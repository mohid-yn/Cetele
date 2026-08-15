-- ============================================================================
-- RLS + grants + logic test suite — M8 (reminders + push subscriptions, 0013),
-- rewritten for 0033: a reminder is the MEMBER'S OWN, not a task's (D62)
-- ----------------------------------------------------------------------------
-- Covers:
--   * grant/RLS posture: reminders + push_subscriptions are STRICTLY self-only
--     (invisible even to a group admin — a reminder is a private setting);
--     last_sent_on is job-written, never client-writable; anon gets nothing;
--     service_role gets exactly the prune privilege the dispatcher needs
--   * set_reminder: creates and updates, names are required and bounded, and
--     ONE ACCOUNT CANNOT TOUCH ANOTHER'S ROW — with no task and no membership
--     left to check, that ownership predicate is the entire authority model
--   * the 20-per-account cap, which only holds because writes are RPC-only
--   * claim_due_reminders: service_role-only · claims a due reminder ONCE
--     (atomic — no double-send) · skips a disabled reminder · skips a member
--     with no device
--   * THE DELIBERATE ABSENCE (D62): a reminder fires whether or not the member
--     has already done anything, and no longer cares which circles they are in.
--     0019's "leaving the circle silences it" and D8's "never nag a closed ring"
--     are gone WITH their subjects — a standalone reminder has no task to be
--     finished and no group to leave. Both are asserted as absences below, so
--     the day someone reintroduces a coupling this suite says so.
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
select ok(has_function_privilege('authenticated','public.set_reminder(uuid,text,time,boolean)','execute'),
  'set_reminder is the write path');
select ok(has_table_privilege('authenticated','public.reminders','delete'),
  'a member can delete their own reminder (RLS-scoped, no RPC needed)');
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
insert into public.reminders (id, user_id, label, time_of_day, enabled) values
  ('c8000000-0000-0000-0000-0000000f0001',
   'c8000000-0000-0000-0000-00000000000a', 'Evening dhikr',
   (now() at time zone 'UTC')::time, true);

select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000a');
select is((select count(*) from public.reminders), 1::bigint, 'I see my own reminder');
reset role;

select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000b'); -- the circle's other member
select is((select count(*) from public.reminders), 0::bigint,
  'a peer sees none of my reminders (private, even inside the circle)');
reset role;

-- ----------------------------------------------------------------------------
-- set_reminder — the whole authority model, now that there is no task to hang
-- it on. A reminder belongs to its author and to nobody else.
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('c8000000-0000-0000-0000-00000000000c', 'c@m8.test', '{"name":"C"}', 'authenticated', 'authenticated');

-- THE ONE THAT MATTERS: a stranger holding a valid id gets nothing. The select
-- policy protects nothing inside a SECURITY DEFINER function (it runs as
-- postgres and bypasses RLS), so the RPC's own `user_id = caller` predicate is
-- the only thing between a guessed uuid and somebody else's reminder.
select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000c');
select throws_matching(
  $$select public.set_reminder('c8000000-0000-0000-0000-0000000f0001','Mine now','07:00',true)$$,
  'no such reminder', 'a stranger cannot edit a reminder they do not own');
reset role;
select is((select label from public.reminders where id='c8000000-0000-0000-0000-0000000f0001'),
  'Evening dhikr', '...and the owner''s reminder is untouched');

-- A name is required, and said OUT LOUD rather than silently clamped (D51/D61's
-- standing rule): a member who typed only spaces has to learn why nothing saved.
select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000c');
select throws_matching(
  $$select public.set_reminder(null,'   ','07:00',true)$$,
  'needs a name', 'a blank name is refused, not saved as an empty title');
select throws_matching(
  $$select public.set_reminder(null, repeat('x', 61), '07:00', true)$$,
  'too long', 'an over-long name is refused (the push title has to fit)');

-- Create, then update in place — never a second row.
select lives_ok(
  $$select public.set_reminder(null,'Morning wird','06:30',true)$$,
  'a member creates a reminder of their own');
select is((select count(*) from public.reminders where user_id='c8000000-0000-0000-0000-00000000000c'),
  1::bigint, 'one row');
select lives_ok(
  $$select public.set_reminder(
      (select id from public.reminders where user_id='c8000000-0000-0000-0000-00000000000c'),
      'Morning wird', '08:15', false)$$,
  '...and changes it');
select is((select count(*) from public.reminders where user_id='c8000000-0000-0000-0000-00000000000c'),
  1::bigint, 'the update was in place — not a duplicate row');
select is((select time_of_day::text from public.reminders where user_id='c8000000-0000-0000-0000-00000000000c'),
  '08:15:00', 'the newer value won');

-- NO CIRCLE IS INVOLVED any more. `c` is in no group at all, and that is now
-- irrelevant — the assertion above already proved it, and this names why.
select is((select count(*) from public.memberships
            where user_id='c8000000-0000-0000-0000-00000000000c'), 0::bigint,
  'a member of NO circle can still have reminders (D62: they are not a group thing)');

-- The cap. It is only a cap because writes are RPC-only: with a table INSERT
-- grant a client would simply skip it.
-- Seeded as postgres, deliberately: `authenticated` has no INSERT grant here —
-- that is the assertion three blocks up — so filling the account to the cap has
-- to bypass the very rule being relied on.
reset role;
insert into public.reminders (user_id, label, time_of_day)
select 'c8000000-0000-0000-0000-00000000000c', 'filler ' || i, '09:00'
from generate_series(1, 19) i;
select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000c');
select throws_matching(
  $$select public.set_reminder(null,'one too many','07:00',true)$$,
  'as many reminders', 'the 20-per-account cap is enforced on create');
-- ...but an UPDATE at the cap is still fine: editing what you have is not
-- growing the dispatcher's sweep, and refusing it would strand a full account.
select lives_ok(
  $$select public.set_reminder(
      (select id from public.reminders where user_id='c8000000-0000-0000-0000-00000000000c'
        and label='Morning wird'),
      'Morning wird', '09:45', true)$$,
  '...and editing an existing one at the cap still works');
reset role;
delete from public.reminders where user_id='c8000000-0000-0000-0000-00000000000c';

-- ----------------------------------------------------------------------------
-- claim_due_reminders — the dispatcher's contract
-- ----------------------------------------------------------------------------
-- No device yet → nothing to send to, so the day's send is NOT burned.
select is((select count(*) from public.claim_due_reminders()), 0::bigint,
  'a member with no device is never claimed');
-- Fixture-scoped, not a bare table scan: a prior e2e run leaves real reminders
-- rows behind in the local DB, and a global scalar subquery dies "more than one
-- row" on them (the 005 lesson — see the STATUS gotchas table).
select is((select last_sent_on from public.reminders
            where user_id='c8000000-0000-0000-0000-00000000000a'), null,
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
select is((select last_sent_on from public.reminders
            where user_id='c8000000-0000-0000-0000-00000000000a'),
  (now() at time zone 'UTC')::date,
  'the claim stamped last_sent_on in the member''s own day');

-- THE DELIBERATE ABSENCE (D62). The old predicate went quiet once the ring was
-- closed (D8: no nagging). A standalone reminder has no ring to close, so it
-- fires regardless — asserted rather than merely deleted, because the cost of
-- this trade is exactly here and a future reader should meet it as a decision.
update public.reminders set last_sent_on = null;
insert into public.logs (user_id, task_id, date, count) values
  ('c8000000-0000-0000-0000-00000000000a', 'c8000000-0000-0000-0000-00000000e001',
   (now() at time zone 'UTC')::date, 100); -- every task finished
select is((select count(*) from public.claim_due_reminders()), 1::bigint,
  'a reminder still fires on a day the member finished everything (it is a clock, not a judge)');

-- A reminder switched off is never sent.
update public.reminders set last_sent_on = null, enabled = false;
select is((select count(*) from public.claim_due_reminders()), 0::bigint,
  'a disabled reminder is never claimed');

-- ----------------------------------------------------------------------------
-- Leaving every circle does NOT silence a reminder any more (0019 → D62)
-- ----------------------------------------------------------------------------
-- 0019 taught the dispatcher to skip a member who had left the circle, because
-- a reminder pointed at that circle's task and there was no control anywhere to
-- turn it off (/profile listed rows built from tasks in circles you were
-- CURRENTLY in, so the row was invisible there). Both halves of that bug are
-- gone: the reminder names itself, and it is listed on /profile unconditionally,
-- so the member can always see and delete it. Silencing it on their behalf would
-- now be the app deleting a setting it was not asked to touch.
update public.reminders set last_sent_on = null, enabled = true;
select is((select count(*) from public.claim_due_reminders()), 1::bigint,
  'baseline: the reminder is claimed');

update public.reminders set last_sent_on = null;
delete from public.memberships
 where user_id  = 'c8000000-0000-0000-0000-00000000000a'
   and group_id = 'c8000000-0000-0000-0000-00000000d001';
select ok(exists (select 1 from private.due_reminders()),
  'the cron tick still sees it due for someone in no circle at all');
select is((select count(*) from public.claim_due_reminders()), 1::bigint,
  '...and it is still delivered — the member owns it, not the circle');

-- ----------------------------------------------------------------------------
-- MOVING THE TIME RE-ARMS TODAY — the fix for the bug that impersonated a
-- dropped platform invocation.
-- ----------------------------------------------------------------------------
-- `claim_due_reminders` only fires when `last_sent_on <> today`, and
-- `set_reminder` used never to clear it (inherited from 0013). So a reminder
-- that had already fired and was then moved to a later time sat silent until
-- tomorrow, which from the outside is indistinguishable from "the function
-- skipped". Asserted here so it cannot come back quietly.
-- The stamp is written here as the JOB, not as the member: clients have no
-- update grant on `reminders` at all, which is exactly the design this suite
-- asserts further up.
update public.reminders
   set last_sent_on = private.user_today('c8000000-0000-0000-0000-00000000000a')
 where id = 'c8000000-0000-0000-0000-0000000f0001';

select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000a');
select public.set_reminder('c8000000-0000-0000-0000-0000000f0001', 'Evening dhikr',
  ((now() at time zone 'UTC')::time + interval '2 hours')::time, true);
reset role;
select is((select last_sent_on from public.reminders
            where id = 'c8000000-0000-0000-0000-0000000f0001'), null::date,
  'moving a reminder FORWARD clears last_sent_on, so it fires again today');

-- …but a time already gone by does NOT re-arm: that would nag within the
-- minute for a moment the member has just moved past (D8).
update public.reminders
   set last_sent_on = private.user_today('c8000000-0000-0000-0000-00000000000a')
 where id = 'c8000000-0000-0000-0000-0000000f0001';

select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000a');
select public.set_reminder('c8000000-0000-0000-0000-0000000f0001', 'Evening dhikr',
  ((now() at time zone 'UTC')::time - interval '2 hours')::time, true);
reset role;
select isnt((select last_sent_on from public.reminders
              where id = 'c8000000-0000-0000-0000-0000000f0001'), null::date,
  '...but moving it BACKWARD past the current moment does not re-arm it');

-- And a RENAME re-arms nothing at all — the moment being asked for is unchanged.
select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000a');
select public.set_reminder('c8000000-0000-0000-0000-0000000f0001', 'Renamed only',
  ((now() at time zone 'UTC')::time - interval '2 hours')::time, true);
reset role;
select isnt((select last_sent_on from public.reminders
              where id = 'c8000000-0000-0000-0000-0000000f0001'), null::date,
  '...and renaming alone never re-arms it');

-- Deleting is the member's own, and it is the ONLY way one goes away.
select pg_temp.impersonate('c8000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$delete from public.reminders where id='c8000000-0000-0000-0000-0000000f0001'$$,
  'a member deletes their own reminder');
reset role;
select is((select count(*) from public.reminders
            where id='c8000000-0000-0000-0000-0000000f0001'), 0::bigint,
  '...and it is gone');

select * from finish();
rollback;
