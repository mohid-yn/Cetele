-- ============================================================================
-- RLS + grants + logic test suite — 0018 (member_task_goals, D51)
-- ----------------------------------------------------------------------------
-- Covers:
--   * grant/RLS posture: a goal is readable ONLY by its owner (not a peer, not
--     a group admin), writes are RPC-only, anon gets nothing
--   * set_task_goal: outsider refused · raises · updates in place · a value at
--     or below the circle's share CLEARS rather than storing dead data · NULL
--     clears · the sanity cap is enforced
--   * the raise-only rule survives an admin raising the group target afterwards
--   * THE POINT OF THE FEATURE: a stretch goal does not touch day-completion,
--     the streak, or the rollup — only the reminder it is supposed to drive
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture: a + b are in the same circle, c is an outsider.
-- t1 target 100 (the one a raises) · t2 target 10
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('d1000000-0000-0000-0000-00000000000a', 'a@d51.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('d1000000-0000-0000-0000-00000000000b', 'b@d51.test', '{"name":"B"}', 'authenticated', 'authenticated'),
  ('d1000000-0000-0000-0000-00000000000c', 'c@d51.test', '{"name":"C"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('d1000000-0000-0000-0000-00000000d001', 'D51 Circle', 'd1000000-0000-0000-0000-00000000000a');

-- `a` is the OWNER here, so the "a peer cannot see my goal" assertion below is
-- the strong version: not even the circle's admin can read a member's bar.
insert into public.memberships (user_id, group_id, role) values
  ('d1000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-00000000d001', 'member'),
  ('d1000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-00000000d001', 'owner');

insert into public.tasks (id, group_id, label, target_count) values
  ('d1000000-0000-0000-0000-00000000e001', 'd1000000-0000-0000-0000-00000000d001', 'Salawat', 100),
  ('d1000000-0000-0000-0000-00000000e002', 'd1000000-0000-0000-0000-00000000d001', 'Istighfar', 10);

create function pg_temp.impersonate(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ----------------------------------------------------------------------------
-- Grant posture (standard #6)
-- ----------------------------------------------------------------------------
select ok(has_table_privilege('authenticated','public.member_task_goals','select'),
  'a member can read their goals (RLS-scoped)');
select ok(not has_table_privilege('authenticated','public.member_task_goals','insert'),
  'setting a goal is RPC-only (the raise-only floor needs tasks.target_count)');
select ok(not has_table_privilege('authenticated','public.member_task_goals','update'),
  'member_task_goals has no UPDATE grant');
select ok(not has_table_privilege('authenticated','public.member_task_goals','delete'),
  'clearing a goal is RPC-only too');
select ok(has_function_privilege('authenticated','public.set_task_goal(uuid,integer)','execute'),
  'set_task_goal is the write path');
select ok(not has_table_privilege('anon','public.member_task_goals','select'),
  'anon has no goal read');
select ok(not has_function_privilege('anon','public.set_task_goal(uuid,integer)','execute'),
  'anon cannot set a goal');

-- ----------------------------------------------------------------------------
-- set_task_goal — the write contract
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000c'); -- outsider
select throws_matching(
  $$select public.set_task_goal('d1000000-0000-0000-0000-00000000e001', 300)$$,
  'task not found', 'an outsider cannot set a goal on a task they cannot see');
reset role;

select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000a');
select is(public.set_task_goal('d1000000-0000-0000-0000-00000000e001', 300), 300,
  'a member raises their own bar, and gets the effective target back');
select is(public.set_task_goal('d1000000-0000-0000-0000-00000000e001', 250), 250,
  '...and changes it');
reset role;

select is((select count(*) from public.member_task_goals
            where user_id = 'd1000000-0000-0000-0000-00000000000a'), 1::bigint,
  'the upsert updated in place — not a second row');
select is((select target_count from public.member_task_goals
            where user_id = 'd1000000-0000-0000-0000-00000000000a'), 250,
  'the newer value won');

-- A goal at or below the circle's share is not stored: greatest() would ignore
-- it anyway, and a stored 50 against a group target of 100 reads like a bug.
select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000a');
select is(public.set_task_goal('d1000000-0000-0000-0000-00000000e001', 40), 100,
  'a goal BELOW the circle''s share returns the group target — you cannot owe less');
reset role;
select is((select count(*) from public.member_task_goals
            where user_id = 'd1000000-0000-0000-0000-00000000000a'), 0::bigint,
  '...and it cleared the override rather than storing dead data');

select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000a');
select is(public.set_task_goal('d1000000-0000-0000-0000-00000000e001', 100), 100,
  'setting it exactly to the circle''s share is the way back');
select is(public.set_task_goal('d1000000-0000-0000-0000-00000000e001', 300), 300,
  'raise again');
select is(public.set_task_goal('d1000000-0000-0000-0000-00000000e001', null), 100,
  'NULL clears it too');
-- The sanity cap is the COUNT cap (D36a) against the group target: greatest(
-- 100*10, 100+1000) = 1100. A goal past it could never legally be reached.
select throws_matching(
  $$select public.set_task_goal('d1000000-0000-0000-0000-00000000e001', 1101)$$,
  'sanity cap', 'a goal above the count cap is refused (it could never be closed)');
select is(public.set_task_goal('d1000000-0000-0000-0000-00000000e001', 1100), 1100,
  '...and the cap itself is allowed');
select is(public.set_task_goal('d1000000-0000-0000-0000-00000000e001', 300), 300,
  'back to a realistic stretch for the tests below');
reset role;

-- ----------------------------------------------------------------------------
-- RLS: a goal is private — a peer (here, the circle's OWNER) sees nothing
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000a');
select is((select count(*) from public.member_task_goals), 1::bigint,
  'I see my own goal');
reset role;

select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000b'); -- the circle's owner
select is((select count(*) from public.member_task_goals), 0::bigint,
  'not even the circle''s owner can read a member''s personal bar');
reset role;

-- ----------------------------------------------------------------------------
-- The raise-only rule holds when the ADMIN moves the group target afterwards
-- ----------------------------------------------------------------------------
-- effective = greatest(group, override), so a group target raised past someone's
-- override simply wins — no clamping trigger, no stale row lowering their bar.
update public.tasks set target_count = 500
 where id = 'd1000000-0000-0000-0000-00000000e001';
select is(
  (select greatest(t.target_count, coalesce(g.target_count, 0))
     from public.tasks t
     left join public.member_task_goals g
       on g.task_id = t.id and g.user_id = 'd1000000-0000-0000-0000-00000000000a'
    where t.id = 'd1000000-0000-0000-0000-00000000e001'),
  500, 'a group target raised above the override wins — the override never lowers the bar');
update public.tasks set target_count = 100
 where id = 'd1000000-0000-0000-0000-00000000e001';

-- ----------------------------------------------------------------------------
-- THE INVARIANT: a stretch goal changes what you aim at, never what you are
-- judged by. Raising your bar must not make your own day incomplete.
-- ----------------------------------------------------------------------------
-- `a` has a 300 goal on t1 (group target 100). Log exactly the circle's share
-- on both tasks — the day must count as complete and the streak must advance,
-- exactly as it would for a member who never raised anything.
select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$select public.increment_count('d1000000-0000-0000-0000-00000000e001',
      (now() at time zone 'UTC')::date, 100)$$,
  'count to the circle''s share on the stretched task');
select lives_ok(
  $$select public.increment_count('d1000000-0000-0000-0000-00000000e002',
      (now() at time zone 'UTC')::date, 10)$$,
  'and close the other one');
reset role;

select ok(private.is_day_complete('d1000000-0000-0000-0000-00000000000a',
            (now() at time zone 'UTC')::date),
  'the day is COMPLETE at the group target, even with a 3x personal goal set');
select is((select current from public.streaks
            where user_id = 'd1000000-0000-0000-0000-00000000000a'), 1,
  '...and the streak advanced — raising your goal can never break it (D8)');

-- The rollup agrees. daily_completion feeds consistency, steadfastness (D31)
-- and the garden's height (D49); if the personal goal reached it, the ambitious
-- member would show as LESS consistent than a peer who did strictly less work,
-- and their plant would be shorter for it.
--
-- Rolled up for real rather than by re-deriving the formula here: the window is
-- [today-15, today-1] and starts no earlier than the membership, so the day has
-- to be YESTERDAY and the membership has to predate it.
update public.memberships set created_at = now() - interval '5 days'
 where user_id = 'd1000000-0000-0000-0000-00000000000a';

select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$select public.increment_count('d1000000-0000-0000-0000-00000000e001',
      (now() at time zone 'UTC')::date - 1, 100)$$,
  'back-fill yesterday to the circle''s share on the stretched task');
select lives_ok(
  $$select public.increment_count('d1000000-0000-0000-0000-00000000e002',
      (now() at time zone 'UTC')::date - 1, 10)$$,
  'and the other one');
reset role;

select lives_ok($$select private.run_daily_rollup()$$, 'the nightly rollup runs');
select is((select completion_pct from public.daily_completion
            where user_id = 'd1000000-0000-0000-0000-00000000000a'
              and group_id = 'd1000000-0000-0000-0000-00000000d001'
              and date = (now() at time zone 'UTC')::date - 1),
  100.00, 'yesterday rolled up as a FULL day at the group target, 3x goal and all');

-- ...while the reminder, the one mechanism the stretch is allowed to drive,
-- keeps nudging toward the personal goal.
insert into public.reminders (user_id, task_id, time_of_day, enabled) values
  ('d1000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-00000000e001',
   (now() at time zone 'UTC')::time, true);
select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$select public.save_push_subscription('https://push.test/d51','p256','authkey','iPhone')$$,
  'register a device so there is something to send to');
reset role;

-- Claimed ONCE into a temp table: the claim stamps last_sent_on, so a second
-- call would (correctly) return nothing and the payload assertion below would
-- be testing an empty set.
create temp table d51_claim on commit drop as
  select * from public.claim_due_reminders();

select is((select count(*) from d51_claim
            where user_id = 'd1000000-0000-0000-0000-00000000000a'), 1::bigint,
  'at the group target but under my own goal, the reminder still fires');
select is((select target_count from d51_claim
            where user_id = 'd1000000-0000-0000-0000-00000000000a'), 300,
  '...and the push payload names MY goal, not the circle''s share');
select is((select current_count from d51_claim
            where user_id = 'd1000000-0000-0000-0000-00000000000a'), 100,
  '...against the count I have actually reached');

select * from finish();
rollback;
