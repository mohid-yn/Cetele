-- ============================================================================
-- RLS + grants + logic test suite — M8 (reminders + push subscriptions, 0013)
-- ----------------------------------------------------------------------------
-- Covers:
--   * grant/RLS posture: reminders + push_subscriptions are STRICTLY self-only
--     (invisible even to a group admin — a reminder is a private setting);
--     last_sent_on is job-written, never client-writable; anon gets nothing;
--     service_role gets exactly the prune privilege the dispatcher needs
--   * claim_due_reminders: service_role-only · claims a due reminder ONCE
--     (atomic — no double-send) · skips a closed ring (D8: no nagging) ·
--     skips a disabled reminder · skips a member with no device
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture: a = the member with a device · b = a peer (same circle) · both in g1
-- t1 = the task a is reminded about (target 100) · t2 = a task a has finished
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('c8000000-0000-0000-0000-00000000000a', 'a@m8.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('c8000000-0000-0000-0000-00000000000b', 'b@m8.test', '{"name":"B"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('c8000000-0000-0000-0000-00000000d001', 'M8 Circle', 'c8000000-0000-0000-0000-00000000000a');

insert into public.memberships (user_id, group_id, role) values
  ('c8000000-0000-0000-0000-00000000000a', 'c8000000-0000-0000-0000-00000000d001', 'owner'),
  ('c8000000-0000-0000-0000-00000000000b', 'c8000000-0000-0000-0000-00000000d001', 'member');

insert into public.tasks (id, group_id, label, target_count) values
  ('c8000000-0000-0000-0000-00000000e001', 'c8000000-0000-0000-0000-00000000d001', 'Salawat', 100),
  ('c8000000-0000-0000-0000-00000000e002', 'c8000000-0000-0000-0000-00000000d001', 'Istighfar', 10);

create function pg_temp.impersonate(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ----------------------------------------------------------------------------
-- Grant posture (standard #6)
-- ----------------------------------------------------------------------------
select ok(has_table_privilege('authenticated','public.reminders','select'), 'reminders readable (RLS-scoped)');
-- Writes are RPC-only (set_reminder): a client-side read-then-write would let
-- two concurrent saves interleave, and last_sent_on must stay the job's alone.
select ok(not has_table_privilege('authenticated','public.reminders','insert'),
  'reminders INSERT is RPC-only');
select ok(not has_table_privilege('authenticated','public.reminders','update'),
  'reminders UPDATE is RPC-only (so two saves can never interleave)');
select ok(has_function_privilege('authenticated','public.set_reminder(uuid,time,boolean)','execute'),
  'set_reminder is the write path');
select ok(not has_table_privilege('anon','public.reminders','select'), 'anon has no reminders read');

-- Device registration is RPC-only (0014). A direct upsert from the client dies
-- `permission denied` — PostgREST compiles upsert to ON CONFLICT DO UPDATE, and
-- there is no UPDATE grant here by design. This shipped as a live bug once; both
-- halves are pinned below.
select ok(not has_table_privilege('authenticated','public.push_subscriptions','insert'),
  'registering a device is RPC-only');
select ok(not has_table_privilege('authenticated','public.push_subscriptions','update'),
  'push_subscriptions has no UPDATE (a device re-subscribes; it never mutates)');
select ok(has_function_privilege('authenticated','public.save_push_subscription(text,text,text,text)','execute'),
  'save_push_subscription is the write path');
select ok(has_table_privilege('authenticated','public.push_subscriptions','delete'),
  'a member can unsubscribe this device');
select ok(not has_table_privilege('anon','public.push_subscriptions','select'), 'anon has no subscription read');

-- The dispatcher's exact privilege — and nothing more. (service_role gets NO
-- grants by default on a new table since 0006, so this must be explicit.)
select ok(has_table_privilege('service_role','public.push_subscriptions','delete'),
  'service_role can prune dead subscriptions');
select ok(has_function_privilege('service_role','public.claim_due_reminders()','execute'),
  'service_role can claim due reminders');
select ok(not has_function_privilege('authenticated','public.claim_due_reminders()','execute'),
  'claim_due_reminders is NOT client-callable (no new advisor WARN)');
select ok(not has_function_privilege('anon','public.claim_due_reminders()','execute'),
  'anon cannot claim reminders');
select ok(not has_function_privilege('authenticated','private.dispatch_reminders()','execute'),
  'the cron dispatcher is not client-callable');

-- ----------------------------------------------------------------------------
-- RLS: a reminder is private — not even a group admin (a's peer b) can see it
-- ----------------------------------------------------------------------------
insert into public.reminders (user_id, task_id, time_of_day, enabled) values
  ('c8000000-0000-0000-0000-00000000000a', 'c8000000-0000-0000-0000-00000000e001',
   (now() at time zone 'UTC')::time, true);

select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000a');
select is((select count(*) from public.reminders), 1::bigint, 'I see my own reminder');
reset role;

select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000b'); -- the circle's other member
select is((select count(*) from public.reminders), 0::bigint,
  'a peer sees none of my reminders (private, even inside the circle)');
reset role;

-- ...and an outsider cannot set a reminder on a task they can't see (the RPC
-- re-checks membership, because a SECURITY DEFINER function bypasses RLS).
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('c8000000-0000-0000-0000-00000000000c', 'c@m8.test', '{"name":"C"}', 'authenticated', 'authenticated');
select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000c'); -- outsider
select throws_matching(
  $$select public.set_reminder('c8000000-0000-0000-0000-00000000e001','07:00',true)$$,
  'not a member', 'an outsider cannot set a reminder on a task they cannot see');
reset role;

-- set_reminder is an atomic upsert: create, then update in place (never a
-- second row, and never an interleaved half-write).
select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000b'); -- b (a real member)
select lives_ok(
  $$select public.set_reminder('c8000000-0000-0000-0000-00000000e002','06:30',true)$$,
  'a member sets a reminder');
select lives_ok(
  $$select public.set_reminder('c8000000-0000-0000-0000-00000000e002','08:15',false)$$,
  '...and changes it');
select is((select count(*) from public.reminders where user_id='c8000000-0000-0000-0000-00000000000b'),
  1::bigint, 'the upsert updated in place — not a duplicate row');
select is((select time_of_day::text from public.reminders where user_id='c8000000-0000-0000-0000-00000000000b'),
  '08:15:00', 'the newer value won');
reset role;
delete from public.reminders where user_id='c8000000-0000-0000-0000-00000000000b';

-- ----------------------------------------------------------------------------
-- claim_due_reminders — the dispatcher's contract
-- ----------------------------------------------------------------------------
-- No device yet → nothing to send to, so the day's send is NOT burned.
select is((select count(*) from public.claim_due_reminders()), 0::bigint,
  'a member with no device is never claimed');
select is((select last_sent_on from public.reminders), null,
  '...and their reminder is left un-stamped for when they do subscribe');

-- Register the device the way the app does — through the RPC (this is the exact
-- call that failed on a real iPhone with `permission denied` before 0014).
select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$select public.save_push_subscription('https://push.test/a1','p256','authkey','iPhone')$$,
  'a member registers a device');
-- Re-subscribing with the same endpoint updates in place, never duplicates.
select lives_ok(
  $$select public.save_push_subscription('https://push.test/a1','p256-new','authkey','iPhone')$$,
  '...and re-registering the same device is idempotent');
reset role;
select is((select count(*) from public.push_subscriptions where endpoint='https://push.test/a1'),
  1::bigint, 'one row per device, not a duplicate');
select is((select p256dh from public.push_subscriptions where endpoint='https://push.test/a1'),
  'p256-new', 'the refreshed key won');

-- Shared phone: the SAME endpoint comes back for a DIFFERENT user. The row must
-- move to them — otherwise their reminders would push to the previous owner.
select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000b');
select lives_ok(
  $$select public.save_push_subscription('https://push.test/a1','p256','authkey','iPhone')$$,
  'a second user subscribes on the same device');
reset role;
select is((select user_id from public.push_subscriptions where endpoint='https://push.test/a1'),
  'c8000000-0000-0000-0000-00000000000b'::uuid,
  'the device now belongs to whoever just subscribed (no cross-user push)');

-- Hand it back to `a` for the claim tests below.
select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$select public.save_push_subscription('https://push.test/a1','p256','authkey','iPhone')$$,
  'the first user re-subscribes');
reset role;

select is((select count(*) from public.claim_due_reminders()), 1::bigint,
  'a due reminder with a device is claimed');
select is((select count(*) from public.claim_due_reminders()), 0::bigint,
  'the SAME claim returns nothing a second time — atomic, so no double-send');
select is((select last_sent_on from public.reminders), (now() at time zone 'UTC')::date,
  'the claim stamped last_sent_on in the member''s own day');

-- A closed ring is never nagged (D8).
update public.reminders set last_sent_on = null;
insert into public.logs (user_id, task_id, date, count) values
  ('c8000000-0000-0000-0000-00000000000a', 'c8000000-0000-0000-0000-00000000e001',
   (now() at time zone 'UTC')::date, 100); -- target met
select is((select count(*) from public.claim_due_reminders()), 0::bigint,
  'a task already at target today is not reminded (no nagging a closed ring)');

-- ...but a partially-done task still is (that's the whole point of the nudge).
update public.logs set count = 40
 where task_id = 'c8000000-0000-0000-0000-00000000e001';
select is((select count(*) from public.claim_due_reminders()), 1::bigint,
  'a partially-done task IS reminded');

-- A reminder switched off is never sent.
update public.reminders set last_sent_on = null, enabled = false;
select is((select count(*) from public.claim_due_reminders()), 0::bigint,
  'a disabled reminder is never claimed');

select * from finish();
rollback;
