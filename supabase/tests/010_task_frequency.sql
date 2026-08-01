-- ============================================================================
-- Logic + grants test suite — 0021 (task frequency, and as-of configuration)
-- ----------------------------------------------------------------------------
-- Covers:
--   * the schedule: anchored at tasks.created_at, due every N days, never
--     before the task existed
--   * SKIP semantics: a day owing nothing is neither kept nor missed — the
--     streak walks over it, and the rollup writes no row for it
--   * a streak on a cycle counts OCCASIONS, not calendar days
--   * the member's override is MORE OFTEN ONLY, and is a UNION: the circle's
--     occasions always stand, so "more often" can never drop one
--   * D51 on the frequency axis — the member's own cycle moves their reminder
--     and nothing they are judged by (day-completion, streak, rollup)
--   * the as-of fix: a task created today is not owed on a day before it
--     existed (the other half of the retroactivity family; the 10 → 1 case is
--     asserted in 003)
--   * grants: frequency_days is admin-writable, created_at is not client
--     writable at all
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture: one circle, one member, one task on a 3-DAY cycle anchored 30 days
-- back so `current_date` itself is an occasion (30 % 3 = 0).
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('f1000000-0000-0000-0000-00000000000a', 'a@freq.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('f1000000-0000-0000-0000-00000000000b', 'b@freq.test', '{"name":"B"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('f1000000-0000-0000-0000-00000000d001', 'Freq Circle', 'f1000000-0000-0000-0000-00000000000a');

insert into public.memberships (user_id, group_id, role, created_at) values
  ('f1000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-00000000d001', 'owner',  now() - interval '40 days'),
  ('f1000000-0000-0000-0000-00000000000b', 'f1000000-0000-0000-0000-00000000d001', 'member', now() - interval '40 days');

insert into public.tasks (id, group_id, label, target_count, frequency_days, created_at) values
  ('f1000000-0000-0000-0000-00000000e001', 'f1000000-0000-0000-0000-00000000d001', 'Kahf', 1, 3, current_date - 30);

create function pg_temp.impersonate(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ----------------------------------------------------------------------------
-- 1. The schedule itself
-- ----------------------------------------------------------------------------

select ok(private.task_due_on(current_date - 30, 3, null, current_date),
  'due on the anchor + 30 (a multiple of 3)');
select ok(private.task_due_on(current_date - 30, 3, null, current_date - 3),
  'due three days before that');
select ok(not private.task_due_on(current_date - 30, 3, null, current_date - 1),
  'NOT due one day off the cycle');
select ok(not private.task_due_on(current_date - 30, 3, null, current_date - 2),
  'NOT due two days off the cycle');
select ok(not private.task_due_on(current_date - 30, 3, null, current_date - 31),
  'NEVER due before the task existed — the as-of bound');
select ok(private.task_due_on(current_date - 30, 1, null, current_date - 1),
  'frequency 1 is daily, i.e. exactly the pre-0021 predicate');

-- ----------------------------------------------------------------------------
-- 2. SKIP semantics — a day owing nothing is not a day kept
-- ----------------------------------------------------------------------------

select ok(not private.owes_on('f1000000-0000-0000-0000-00000000000a', current_date - 1),
  'nothing is owed on an off-cycle day');
select ok(not private.is_day_complete('f1000000-0000-0000-0000-00000000000a', current_date - 1),
  '...and that day is NOT complete — vacuous truth would hand out free streak');

-- ----------------------------------------------------------------------------
-- 3. A streak on a cycle counts OCCASIONS, and quiet days do not break it
-- ----------------------------------------------------------------------------
-- Keep the last five occasions: today, -3, -6, -9, -12. The twelve calendar
-- days in between owe nothing and must be walked straight over.

insert into public.logs (user_id, task_id, date, count)
  select 'f1000000-0000-0000-0000-00000000000a',
         'f1000000-0000-0000-0000-00000000e001', current_date - (i * 3), 1
    from generate_series(0, 4) i;

select private.refresh_streak('f1000000-0000-0000-0000-00000000000a', current_date);
select is((select current from public.streaks
            where user_id = 'f1000000-0000-0000-0000-00000000000a'), 5,
  'five kept occasions = a streak of 5, though they span 13 calendar days');

-- ----------------------------------------------------------------------------
-- 4. The member's override: MORE OFTEN ONLY, and a UNION
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('f1000000-0000-0000-0000-00000000000b');

select is(public.set_task_frequency('f1000000-0000-0000-0000-00000000e001', 5), 3,
  'asking for a LOOSER cycle returns the circle''s — you cannot come round less often');
reset role;
select is((select count(*) from public.member_task_goals
            where user_id = 'f1000000-0000-0000-0000-00000000000b'), 0::bigint,
  '...and it stored nothing rather than dead data');

select pg_temp.impersonate('f1000000-0000-0000-0000-00000000000b');
select is(public.set_task_frequency('f1000000-0000-0000-0000-00000000e001', 2), 2,
  'a DENSER cycle is accepted');
reset role;

-- The union is the whole point: on every-2 alone the member would owe days
-- 0,2,4 and MISS day 3 — an occasion the circle still asks for. Their days must
-- be a superset of the circle's, for any pair of numbers.
select ok(private.task_due_on(current_date - 30, 3, 2, current_date - 3),
  'the circle''s occasion still stands under a denser personal cycle');
select ok(private.task_due_on(current_date - 30, 3, 2, current_date - 2),
  '...and the member''s own extra occasion is added');
select ok(not private.task_due_on(current_date - 30, 3, 2, current_date - 1),
  '...while a day in neither cycle is still quiet');

-- ----------------------------------------------------------------------------
-- 5. D51 on the frequency axis — the member's cycle is an AIM, not a judgement
-- ----------------------------------------------------------------------------
-- b now comes round every 2 days by choice. Day -2 is one of THEIR occasions
-- and not one of the circle's. Missing it must not be a missed day: the app
-- would otherwise punish the member for volunteering to do more (D8).

select ok(not private.owes_on('f1000000-0000-0000-0000-00000000000b', current_date - 2),
  'a member''s OWN extra occasion is not an obligation the circle judges');
select is((select count(*) from private.obligations(
            'f1000000-0000-0000-0000-00000000000b', current_date - 3)), 1::bigint,
  '...while the circle''s occasion still is');
select is((select target from private.obligations(
            'f1000000-0000-0000-0000-00000000000b', current_date - 3)), 1,
  'and the target judged is the CIRCLE''s, never the member''s own goal');

-- ----------------------------------------------------------------------------
-- 6. The rollup writes no row for a day that owed nothing
-- ----------------------------------------------------------------------------

select private.run_daily_rollup();
select is((select count(*) from public.daily_completion
            where user_id = 'f1000000-0000-0000-0000-00000000000a'
              and date = current_date - 1), 0::bigint,
  'no rollup row for an off-cycle day — a quiet day cannot drag consistency down');
select is((select completion_pct from public.daily_completion
            where user_id = 'f1000000-0000-0000-0000-00000000000a'
              and date = current_date - 3), 100.00,
  '...and a kept occasion still rolls up at 100%');

-- ----------------------------------------------------------------------------
-- 7. Grants — frequency is admin-writable, the anchor is not writable at all
-- ----------------------------------------------------------------------------

select ok(has_column_privilege('authenticated', 'public.tasks', 'frequency_days', 'UPDATE'),
  'an admin can change a task''s frequency');
select ok(not has_column_privilege('authenticated', 'public.tasks', 'created_at', 'UPDATE'),
  'nobody can rewrite the anchor — it decides which past days were owed');
select ok(not has_column_privilege('authenticated', 'public.tasks', 'created_at', 'INSERT'),
  '...not even on insert');
select ok(has_column_privilege('authenticated', 'public.member_task_goals', 'frequency_days', 'SELECT'),
  'a member can read their own cycle back');

select ok(not pg_catalog.has_function_privilege(
  'anon', 'public.set_task_frequency(uuid, integer)', 'EXECUTE'),
  'anon cannot set a frequency');

select * from finish();
rollback;
