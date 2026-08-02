-- ============================================================================
-- Logic + grants test suite — 0024 (as-of task configuration)
-- ----------------------------------------------------------------------------
-- Covers:
--   * the default: every task opens exactly one version, from a trigger,
--     anchored at its own creation — so nothing about an unedited circle moves
--   * THE ASSERTION THAT CARRIES THE MIGRATION — raising a target does not
--     un-keep the days already kept at the old one. Verified to FAIL against
--     the 0023 predicate (measured there: the rebuilt chain does not merely
--     shorten, `refresh_streak` finds no kept day at all and writes nothing)
--   * the other direction: LOWERING a target does not retroactively hand out
--     days that were genuinely missed
--   * the rollup is idempotent across an edit — the property 0009's header
--     claimed and did not have, and the reason a 90-day band could hold two
--     incompatible measurements with nothing marking the seam
--   * frequency history: a cycle change does not add or delete past occasions
--   * intervals: an edit closes one and opens the next, a rename mints nothing,
--     rows are never deleted
--   * the pre-creation fallback, which the D48 escape depends on
--   * what deliberately did NOT move: the reminder and the D36a sanity cap
--   * RLS + grants: readable by the circle, writable by nobody at all
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture: one circle, an owner (A) and a member (B), joined 40 days ago. One
-- DAILY task at target 100, anchored 30 days back, so every day in the window
-- is an occasion and the schedule never masks a target effect.
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('c4000000-0000-0000-0000-00000000000a', 'a@cfg.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('c4000000-0000-0000-0000-00000000000b', 'b@cfg.test', '{"name":"B"}', 'authenticated', 'authenticated'),
  ('c4000000-0000-0000-0000-00000000000e', 'e@cfg.test', '{"name":"E"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('c4000000-0000-0000-0000-00000000d001', 'Config Circle', 'c4000000-0000-0000-0000-00000000000a');

insert into public.memberships (user_id, group_id, role, created_at) values
  ('c4000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-00000000d001', 'owner',  now() - interval '40 days'),
  ('c4000000-0000-0000-0000-00000000000b', 'c4000000-0000-0000-0000-00000000d001', 'member', now() - interval '40 days');

insert into public.tasks (id, group_id, label, target_count, frequency_days, created_at) values
  ('c4000000-0000-0000-0000-00000000e001', 'c4000000-0000-0000-0000-00000000d001', 'Ratib', 100, 1, now() - interval '30 days');

create function pg_temp.impersonate(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.reset_role() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1. The default — one version, from the trigger, anchored at creation
-- ----------------------------------------------------------------------------

select is((select count(*) from public.task_config_versions
            where task_id = 'c4000000-0000-0000-0000-00000000e001'), 1::bigint,
  'a new task opens exactly one config version, from the trigger');

select is((select effective_from::date from public.task_config_versions
            where task_id = 'c4000000-0000-0000-0000-00000000e001'),
  current_date - 30,
  '...anchored at the TASK''s creation, not now() — else every past day loses its target');

select ok((select effective_to is null from public.task_config_versions
            where task_id = 'c4000000-0000-0000-0000-00000000e001'),
  '...and it is open');

select is((select target from private.task_config_on(
             'c4000000-0000-0000-0000-00000000e001', 'c4000000-0000-0000-0000-00000000000b', current_date)), 100,
  'task_config_on returns the live target while nothing has been edited');

select is((select target from private.obligations(
             'c4000000-0000-0000-0000-00000000000b', current_date - 5)
           where task_id = 'c4000000-0000-0000-0000-00000000e001'), 100,
  '...and obligations agrees on a past day — an unedited circle does not move');

-- ----------------------------------------------------------------------------
-- 2. THE ONE THAT CARRIES THE MIGRATION — raising a target cannot un-keep a day
-- ----------------------------------------------------------------------------
-- Ten days kept at exactly the target of 100, then the admin raises it to 500.
-- Against the 0023 predicate every one of those days is re-judged at 500,
-- `is_day_complete` goes false all the way down, and a rebuild finds no kept day
-- to anchor on — for every member of the circle at once, from one admin edit.

insert into public.logs (user_id, task_id, date, count)
select 'c4000000-0000-0000-0000-00000000000b',
       'c4000000-0000-0000-0000-00000000e001',
       (current_date - d)::date, 100
from generate_series(0, 9) d;

select private.refresh_streak('c4000000-0000-0000-0000-00000000000b', current_date);

select is((select current from public.streaks
            where user_id = 'c4000000-0000-0000-0000-00000000000b'), 10,
  'ten days kept at the circle''s target build a streak of 10');

update public.tasks set target_count = 500
 where id = 'c4000000-0000-0000-0000-00000000e001';

select ok(private.is_day_complete('c4000000-0000-0000-0000-00000000000b', current_date - 1),
  'RAISING THE TARGET LEAVES YESTERDAY KEPT — the assertion this migration exists for');

select is((select target from private.obligations(
             'c4000000-0000-0000-0000-00000000000b', current_date - 1)
           where task_id = 'c4000000-0000-0000-0000-00000000e001'), 100,
  '...because a past day is measured against the target IT asked for');

select is((select target from private.obligations(
             'c4000000-0000-0000-0000-00000000000b', current_date)
           where task_id = 'c4000000-0000-0000-0000-00000000e001'), 500,
  '...while today is measured against the new one — an edit applies from the day it is made');

-- The rebuild D48 is for. Nine, not ten: today legitimately owes 500 and holds
-- 100, so today is not kept. That is the new bar being real, not history moving.
delete from public.streaks where user_id = 'c4000000-0000-0000-0000-00000000000b';
select private.refresh_streak('c4000000-0000-0000-0000-00000000000b', current_date);

select is((select current from public.streaks
            where user_id = 'c4000000-0000-0000-0000-00000000000b'), 9,
  '...so a rebuilt chain survives the raise (0 against the 0023 predicate — verified)');

-- ----------------------------------------------------------------------------
-- 3. The rollup is idempotent across an edit
-- ----------------------------------------------------------------------------
-- The nightly job recomputes [today-15, today-1] every night. Before 0024 it
-- recomputed them against whatever the target had become, so a raise silently
-- rewrote the last fortnight of consistency downward while every older row kept
-- the number it was written with — two measurements in one 90-day band (D21),
-- one steadfastness rate (D31) and one garden height (D49), with nothing
-- marking the seam.

select private.run_daily_rollup();

create temp table dc_before as
select date, completion_pct from public.daily_completion
 where user_id = 'c4000000-0000-0000-0000-00000000000b'
   and group_id = 'c4000000-0000-0000-0000-00000000d001';

select is((select count(*) from dc_before where completion_pct = 100), 9::bigint,
  'the nine completed past days roll up at 100%');

update public.tasks set target_count = 1000
 where id = 'c4000000-0000-0000-0000-00000000e001';
select private.run_daily_rollup();

select is((select count(*) from public.daily_completion d
            join dc_before b on b.date = d.date
           where d.user_id = 'c4000000-0000-0000-0000-00000000000b'
             and d.group_id = 'c4000000-0000-0000-0000-00000000d001'
             and d.completion_pct is distinct from b.completion_pct), 0::bigint,
  'RE-RUNNING THE ROLLUP AFTER A RAISE REPRODUCES EVERY PAST DAY — idempotence, at last');

update public.tasks set target_count = 100
 where id = 'c4000000-0000-0000-0000-00000000e001';

-- ----------------------------------------------------------------------------
-- 4. The other direction — lowering a target does not GIFT a missed day
-- ----------------------------------------------------------------------------
-- History moving in the generous direction is still history moving, and it is
-- the direction nobody notices: a day genuinely missed against 500 must not
-- become a kept day because the circle later decided to ask for less.
--
-- This needs its own task carrying the high target THROUGH the past, which the
-- fixture above cannot express — e001's raise happened today, so yesterday only
-- ever asked for 100 and 200 really was a kept day there. Asserting on e001
-- would have pinned the opposite of the intended rule, and did: the first cut of
-- this suite failed here for exactly that reason.

insert into public.tasks (id, group_id, label, target_count, frequency_days, created_at) values
  ('c4000000-0000-0000-0000-00000000e004', 'c4000000-0000-0000-0000-00000000d001', 'Wird', 500, 1, now() - interval '30 days');

insert into public.logs (user_id, task_id, date, count) values
  ('c4000000-0000-0000-0000-00000000000b', 'c4000000-0000-0000-0000-00000000e004',
   current_date - 1, 200);

select ok(not private.is_day_complete('c4000000-0000-0000-0000-00000000000b', current_date - 1),
  '200 of the 500 asked for is not a kept day');

update public.tasks set target_count = 50
 where id = 'c4000000-0000-0000-0000-00000000e004';

select is((select target from private.obligations(
             'c4000000-0000-0000-0000-00000000000b', current_date - 1)
           where task_id = 'c4000000-0000-0000-0000-00000000e004'), 500,
  'dropping the target to 50 today leaves yesterday asking what it asked');

select ok(not private.is_day_complete('c4000000-0000-0000-0000-00000000000b', current_date - 1),
  '...so a day genuinely missed stays missed — history does not move in EITHER direction');

-- ----------------------------------------------------------------------------
-- 5. Frequency history — the same bug, one column along, both directions
-- ----------------------------------------------------------------------------

insert into public.tasks (id, group_id, label, target_count, frequency_days, created_at) values
  ('c4000000-0000-0000-0000-00000000e002', 'c4000000-0000-0000-0000-00000000d001', 'Yasin', 1, 1, current_date - 30);

select ok(private.owes_on('c4000000-0000-0000-0000-00000000000a', current_date - 3),
  'a daily task is owed on every day of the window');

-- Rarer, from today. Days 1..14 back are all multiples-of-nothing on the new
-- cycle, but they were occasions when they happened.
update public.tasks set frequency_days = 7
 where id = 'c4000000-0000-0000-0000-00000000e002';

select is((select count(*) from private.obligations(
             'c4000000-0000-0000-0000-00000000000a', current_date - 3)
           where task_id = 'c4000000-0000-0000-0000-00000000e002'), 1::bigint,
  'making a task RARER does not delete the occasions it already had');

select is((select frequency from private.task_config_on(
             'c4000000-0000-0000-0000-00000000e002', 'c4000000-0000-0000-0000-00000000000a', current_date - 3)), 1,
  '...because that day still reads the cycle it was run under');

select is((select frequency from private.task_config_on(
             'c4000000-0000-0000-0000-00000000e002', 'c4000000-0000-0000-0000-00000000000a', current_date)), 7,
  '...while today runs on the new one');

-- ----------------------------------------------------------------------------
-- 6. Intervals — an edit closes one and opens the next; a rename mints nothing
-- ----------------------------------------------------------------------------

select is((select count(*) from public.task_config_versions
            where task_id = 'c4000000-0000-0000-0000-00000000e002'), 2::bigint,
  'an edit leaves exactly two versions');

select is((select count(*) from public.task_config_versions
            where task_id = 'c4000000-0000-0000-0000-00000000e002'
              and effective_to is null), 1::bigint,
  '...exactly one of them open');

select is((select count(*) from public.task_config_versions v
            where v.task_id = 'c4000000-0000-0000-0000-00000000e002'
              and v.effective_to is not null
              and not exists (
                select 1 from public.task_config_versions n
                where n.task_id = v.task_id and n.effective_from = v.effective_to
              )), 0::bigint,
  '...and the timeline has no hole: each close is the next one''s open');

update public.tasks set label = 'Yasin Sharif'
 where id = 'c4000000-0000-0000-0000-00000000e002';

select is((select count(*) from public.task_config_versions
            where task_id = 'c4000000-0000-0000-0000-00000000e002'), 2::bigint,
  'renaming a task mints NO version — history would fill with rows saying nothing');

-- Idempotence of the write itself: setting a column to the value it already has
-- is not a change, and Postgres''s `is distinct from` guard says so.
update public.tasks set target_count = 1
 where id = 'c4000000-0000-0000-0000-00000000e002';

select is((select count(*) from public.task_config_versions
            where task_id = 'c4000000-0000-0000-0000-00000000e002'), 2::bigint,
  '...and neither does re-writing a target with the number it already holds');

-- ----------------------------------------------------------------------------
-- 7. The pre-creation fallback — what the D48 escape stands on
-- ----------------------------------------------------------------------------
-- A brand-new circle's whole 14-day repair window predates its tasks. If the
-- as-of lookup returned no row for such a day, the task would drop out of the
-- join and the escape would silently disappear — the bug 0023 shipped and had
-- to fix, one layer down.

insert into public.tasks (id, group_id, label, target_count, frequency_days, created_at) values
  ('c4000000-0000-0000-0000-00000000e003', 'c4000000-0000-0000-0000-00000000d001', 'New', 10, 1, now());

select is((select target from private.task_config_on(
             'c4000000-0000-0000-0000-00000000e003', 'c4000000-0000-0000-0000-00000000000b', current_date - 5)), 10,
  'a day BEFORE a task existed reads its original config, never nothing');

insert into public.logs (user_id, task_id, date, count) values
  ('c4000000-0000-0000-0000-00000000000b', 'c4000000-0000-0000-0000-00000000e003',
   current_date - 5, 10);

select is((select count(*) from private.obligations(
             'c4000000-0000-0000-0000-00000000000b', current_date - 5)
           where task_id = 'c4000000-0000-0000-0000-00000000e003'), 1::bigint,
  '...so a completed log on a pre-creation day still rebuilds the chain (D48)');

-- ----------------------------------------------------------------------------
-- 8. What deliberately did NOT move
-- ----------------------------------------------------------------------------
-- A reminder is about the day it FIRES on, which is always today, and the
-- version in force today is the live row. The D36a sanity cap is a bound on
-- what may be written now, not a verdict on a past day — pinning it to a
-- lowered historical target would refuse a member their correction window.

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values ('c4000000-0000-0000-0000-00000000000a', 'https://push.test/a', 'k', 'a');

insert into public.reminders (user_id, task_id, time_of_day, enabled)
values ('c4000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-00000000e003',
        (now() at time zone 'UTC')::time, true);

select is((select count(*) from private.due_reminders()
            where user_id = 'c4000000-0000-0000-0000-00000000000a'), 1::bigint,
  'a reminder still fires off the LIVE target — today''s version is the live row');

-- ----------------------------------------------------------------------------
-- 9. THE MEMBER'S CALENDAR, not the database's
-- ----------------------------------------------------------------------------
-- Every predicate here takes `p_day` as the member's OWN local date (D34) and
-- used to compare it against `some_timestamp::date`, which Postgres resolves in
-- the DATABASE's zone. Those are different calendars for a large slice of every
-- day, and the gap is a whole day — so an edit an admin made "now" could land on
-- the member's YESTERDAY and re-judge it, which is precisely what this migration
-- exists to prevent.
--
-- Fixed instants, never now(): 23:00 UTC is 09:00 or 10:00 the NEXT day in
-- Sydney whichever side of DST it falls, so this test means the same thing at
-- every hour it might be run at. Using now() would make it pass or fail on the
-- clock, which is how this class of bug survives a green suite in the first
-- place.

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('c4000000-0000-0000-0000-00000000000f', 't@cfg.test', '{"name":"T"}', 'authenticated', 'authenticated');
update public.profiles set timezone = 'Australia/Sydney'
 where id = 'c4000000-0000-0000-0000-00000000000f';
insert into public.memberships (user_id, group_id, role, created_at) values
  ('c4000000-0000-0000-0000-00000000000f', 'c4000000-0000-0000-0000-00000000d001', 'member', now() - interval '40 days');

select is(
  private.user_date('c4000000-0000-0000-0000-00000000000f',
                    ((current_date - 1)::text || ' 23:00 UTC')::timestamptz),
  current_date,
  '23:00 UTC yesterday is already TODAY for a member in Sydney');

select is(
  private.user_date('c4000000-0000-0000-0000-00000000000b',
                    ((current_date - 1)::text || ' 23:00 UTC')::timestamptz),
  current_date - 1,
  '...and still yesterday for a member on UTC — the zone is the member''s, not the server''s');

-- A task whose target was raised at that same instant.
insert into public.tasks (id, group_id, label, target_count, frequency_days, created_at) values
  ('c4000000-0000-0000-0000-00000000e005', 'c4000000-0000-0000-0000-00000000d001', 'Zone', 50, 1, current_date - 10);

update public.task_config_versions
   set target_count = 5,
       effective_to = ((current_date - 1)::text || ' 23:00 UTC')::timestamptz
 where task_id = 'c4000000-0000-0000-0000-00000000e005';
insert into public.task_config_versions
  (task_id, target_count, frequency_days, effective_from)
values ('c4000000-0000-0000-0000-00000000e005', 50, 1,
        ((current_date - 1)::text || ' 23:00 UTC')::timestamptz);

select is((select target from private.task_config_on(
             'c4000000-0000-0000-0000-00000000e005',
             'c4000000-0000-0000-0000-00000000000f', current_date - 1)), 5,
  'THE SYDNEY MEMBER''S YESTERDAY STILL ASKS 5 — the raise landed on their today, not before it');

select is((select target from private.task_config_on(
             'c4000000-0000-0000-0000-00000000e005',
             'c4000000-0000-0000-0000-00000000000f', current_date)), 50,
  '...and their today asks the new number');

-- The same boundary, on the assignment axis (0023 carried the identical cast).
update public.task_assignments
   set assigned_at = ((current_date - 1)::text || ' 23:00 UTC')::timestamptz
 where task_id = 'c4000000-0000-0000-0000-00000000e005';

select ok(not private.assigned_on('c4000000-0000-0000-0000-00000000e005',
                                  'c4000000-0000-0000-0000-00000000000f',
                                  current_date - 1),
  'an assignment made on the member''s today did not reach their yesterday either');

select ok(private.assigned_on('c4000000-0000-0000-0000-00000000e005',
                              'c4000000-0000-0000-0000-00000000000f',
                              current_date),
  '...and it does apply from their today');

-- ----------------------------------------------------------------------------
-- 10. RLS + grants
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c4000000-0000-0000-0000-00000000000b');
select ok((select count(*) from public.task_config_versions
            where task_id = 'c4000000-0000-0000-0000-00000000e001') > 0,
  'a member of the circle can read the history their own screens render against');
select pg_temp.reset_role();

select pg_temp.impersonate('c4000000-0000-0000-0000-00000000000e');
select is((select count(*) from public.task_config_versions
            where task_id = 'c4000000-0000-0000-0000-00000000e001'), 0::bigint,
  'someone outside the circle sees nothing at all');
select pg_temp.reset_role();

select ok(has_table_privilege('authenticated', 'public.task_config_versions', 'SELECT'),
  'authenticated may read the history');
select ok(not has_table_privilege('authenticated', 'public.task_config_versions', 'INSERT'),
  'authenticated may NOT insert — history is trigger-written and nothing else');
select ok(not has_table_privilege('authenticated', 'public.task_config_versions', 'UPDATE'),
  '...nor update: a client that could write here could rewrite its own streak');
select ok(not has_table_privilege('authenticated', 'public.task_config_versions', 'DELETE'),
  '...nor delete');

select ok(not pg_catalog.has_function_privilege(
  'authenticated', 'private.task_config_on(uuid, uuid, date)', 'EXECUTE'),
  'the as-of lookup is private — clients read the table, not the predicate');

select * from finish();
rollback;
