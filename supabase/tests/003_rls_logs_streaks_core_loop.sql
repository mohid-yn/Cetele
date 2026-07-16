-- ============================================================================
-- RLS + grants + logic test suite — M3 (logs / streaks / counting RPCs, 0008)
-- ----------------------------------------------------------------------------
-- Run with `supabase test db` (pgTAP; one rolled-back transaction).
--
-- Covers the M3 invariants:
--   * logs: group-wide read (live counter), writes RPC-ONLY (B4)
--   * count-integrity bounds (D34-3 proposal): delta 1..500 · sanity cap ·
--     14-day window in the user's own timezone · no outsider access
--   * set_count: admin proxy is attributed, self-correct clears it (D29)
--   * streaks: advance-on-completion, no double-count, multi-group rule,
--     freeze-covers-one-miss / two-misses-reset (never miss twice, D8)
--   * profiles.timezone validation
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture: o=owner a=co-admin m=member x=outsider r=rollover-guinea-pig
-- g1 has ONE task (target 10) so completion is easy to reach in tests.
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('d0000000-0000-0000-0000-000000000001', 'o@m3.test', '{"name":"O"}', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-000000000002', 'a@m3.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-000000000003', 'm@m3.test', '{"name":"M"}', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-000000000004', 'x@m3.test', '{"name":"X"}', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-000000000005', 'r@m3.test', '{"name":"R"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('d0000000-0000-0000-0000-0000000000b1', 'M3 Circle',
   'd0000000-0000-0000-0000-000000000001');

insert into public.memberships (user_id, group_id, role) values
  ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-0000000000b1', 'owner'),
  ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-0000000000b1', 'admin'),
  ('d0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-0000000000b1', 'member'),
  ('d0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-0000000000b1', 'member');

insert into public.tasks (id, group_id, label, target_count) values
  ('d0000000-0000-0000-0000-0000000000c1', 'd0000000-0000-0000-0000-0000000000b1', 'Salawat', 10);

create function pg_temp.impersonate(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ----------------------------------------------------------------------------
-- Grant posture (0008)
-- ----------------------------------------------------------------------------
select ok(not has_table_privilege('authenticated','public.logs','insert'), 'logs INSERT is RPC-only');
select ok(not has_table_privilege('authenticated','public.logs','update'), 'logs UPDATE is RPC-only');
select ok(not has_table_privilege('authenticated','public.logs','delete'), 'logs DELETE is RPC-only');
select ok(has_table_privilege('authenticated','public.logs','select'), 'logs are readable (group-scoped by RLS)');
select ok(not has_table_privilege('authenticated','public.streaks','update'), 'streaks are never client-written');
select ok(not has_table_privilege('anon','public.logs','select'), 'anon has no logs read');
select ok(not has_table_privilege('anon','public.streaks','select'), 'anon has no streaks read');
select ok(has_column_privilege('authenticated','public.profiles','timezone','update'), 'timezone is self-settable');
select ok(not has_function_privilege('anon','public.increment_count(uuid,date,integer)','execute'),
  'anon cannot call increment_count');
select ok(not has_function_privilege('authenticated','private.process_streak_rollovers()','execute'),
  'clients cannot run the rollover job');

-- streak rows auto-created with profiles (trigger + backfill)
select is(
  (select count(*) from public.streaks where user_id in (
    'd0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002',
    'd0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000004',
    'd0000000-0000-0000-0000-000000000005')),
  5::bigint, 'every profile gets a streak row automatically');

-- ----------------------------------------------------------------------------
-- profiles.timezone validation
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000003'); -- m
select lives_ok(
  $$update public.profiles set timezone = 'Australia/Melbourne'
    where id = 'd0000000-0000-0000-0000-000000000003'$$,
  'a real IANA timezone is accepted');
select throws_matching(
  $$update public.profiles set timezone = 'Not/AZone'
    where id = 'd0000000-0000-0000-0000-000000000003'$$,
  'not recognized',
  'a garbage timezone is rejected');
reset role;
update public.profiles set timezone = 'UTC'
  where id = 'd0000000-0000-0000-0000-000000000003'; -- keep test dates simple

-- ----------------------------------------------------------------------------
-- increment_count — bounds (the D34-3 count-integrity proposal)
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000003'); -- m
select is(
  public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date, 3),
  3, 'a tap batch lands and returns the new count');
select is(
  public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date, 2),
  5, 'increments accumulate on the same day');
select throws_matching(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date, 0)$$,
  'delta out of range', 'zero delta rejected');
select throws_matching(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date, 501)$$,
  'delta out of range', 'oversized delta rejected');
select throws_matching(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date + 1, 1)$$,
  'outside the 14-day', 'future date rejected');
select throws_matching(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date - 14, 1)$$,
  'outside the 14-day', 'older than the back-fill window rejected');
select lives_ok(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date - 13, 1)$$,
  'edge of the 14-day window accepted');
reset role;

-- sanity cap: target 10 → cap = greatest(100, 1010) = 1010
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000003'); -- m
select lives_ok(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date, 500)$$,
  'counting past the target is welcome (505 of 10)');
select lives_ok(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date, 500)$$,
  'still under the sanity cap (1005 of 1010)');
select throws_matching(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date, 500)$$,
  'sanity cap', 'forgery-scale counts rejected');
select is(
  (select count from public.logs
    where user_id = 'd0000000-0000-0000-0000-000000000003'
      and task_id = 'd0000000-0000-0000-0000-0000000000c1' and date = current_date),
  1005, 'the rejected increment rolled back cleanly');
reset role;

-- outsider: absent and forbidden look alike
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000004'); -- x
select throws_matching(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date, 1)$$,
  'task not found', 'outsider cannot count against a foreign group');
reset role;

-- ----------------------------------------------------------------------------
-- logs visibility + direct-DML lockout
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000005'); -- r (peer member)
select is(
  (select count(*) from public.logs where task_id = 'd0000000-0000-0000-0000-0000000000c1'),
  2::bigint, 'a peer sees the group logs (live-counter read scope)');
select throws_ok(
  $$insert into public.logs (user_id, task_id, date, count)
    values ('d0000000-0000-0000-0000-000000000005',
            'd0000000-0000-0000-0000-0000000000c1', current_date, 5)$$,
  '42501', null, 'direct log INSERT denied — RPC only');
reset role;

select pg_temp.impersonate('d0000000-0000-0000-0000-000000000004'); -- x
select is(
  (select count(*) from public.logs), 0::bigint, 'outsider sees no logs');
reset role;

-- ----------------------------------------------------------------------------
-- streaks — advance on completion, exactly once
-- ----------------------------------------------------------------------------
-- m is at 1005/10 today → the earlier increments already completed the day
select is(
  (select current from public.streaks where user_id = 'd0000000-0000-0000-0000-000000000003'),
  1, 'closing the ring advanced the streak to 1');
select is(
  (select last_active from public.streaks where user_id = 'd0000000-0000-0000-0000-000000000003'),
  current_date, 'last_active stamped with today');
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000003'); -- m
select lives_ok(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date, 1)$$,
  'counting continues after completion');
reset role;
select is(
  (select current from public.streaks where user_id = 'd0000000-0000-0000-0000-000000000003'),
  1, 'a day never counts twice');

-- continuity: kept-through-yesterday + complete today → +1, freeze re-armed
update public.streaks
set current = 7, longest = 7, freezes_left = 0, last_active = current_date - 1
where user_id = 'd0000000-0000-0000-0000-000000000005'; -- r
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000005'); -- r
select lives_ok(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date, 10)$$,
  'r closes the ring');
reset role;
select is(
  (select array[current, longest, freezes_left] from public.streaks
    where user_id = 'd0000000-0000-0000-0000-000000000005'),
  array[8, 8, 1], 'consecutive day: streak +1, longest follows, freeze re-armed (never miss twice)');

-- the midnight race (0016): one missed day + a freeze in hand, ring closed
-- BEFORE the hourly rollover job has run → refresh_streak applies the freeze
-- inline instead of resetting (same net state as job-then-complete).
update public.streaks
set current = 3, longest = 6, freezes_left = 1, last_active = current_date - 2
where user_id = 'd0000000-0000-0000-0000-000000000002'; -- a
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000002'); -- a
select lives_ok(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date, 10)$$,
  'a closes the ring before the rollover job has judged yesterday');
reset role;
select is(
  (select array[current, longest, freezes_left] from public.streaks
    where user_id = 'd0000000-0000-0000-0000-000000000002'),
  array[4, 6, 1],
  'early completion consumes the freeze inline: one covered miss, streak continues');

-- …but the same shape WITHOUT a freeze still resets (no over-forgiveness)
update public.streaks
set current = 9, freezes_left = 0, last_active = current_date - 2
where user_id = 'd0000000-0000-0000-0000-000000000002';
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000002'); -- a
select lives_ok(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date, 1)$$,
  'a counts again on the already-complete day');
reset role;
select is(
  (select current from public.streaks
    where user_id = 'd0000000-0000-0000-0000-000000000002'),
  1, 'no freeze left: a missed day still resets to 1');

-- restore a's pristine state — the multi-group section below reuses a and
-- assumes an untouched streak row + no logs (superuser DML, like the fixtures)
delete from public.logs
  where user_id = 'd0000000-0000-0000-0000-000000000002';
update public.streaks
  set current = 0, longest = 0, freezes_left = 1, last_active = null
  where user_id = 'd0000000-0000-0000-0000-000000000002';

-- ----------------------------------------------------------------------------
-- rollover job — freeze covers exactly one miss; two misses reset
-- ----------------------------------------------------------------------------
-- one missed day (last_active = day before yesterday), freeze available:
update public.streaks
set current = 5, longest = 9, freezes_left = 1, last_active = current_date - 2
where user_id = 'd0000000-0000-0000-0000-000000000001'; -- o
select private.process_streak_rollovers();
select is(
  (select array[current, freezes_left] from public.streaks
    where user_id = 'd0000000-0000-0000-0000-000000000001'),
  array[5, 0], 'a single miss consumes the freeze; the streak survives');
select is(
  (select last_active from public.streaks
    where user_id = 'd0000000-0000-0000-0000-000000000001'),
  current_date - 1, 'the freeze marks the missed day as covered');

-- run again: idempotent (the covered day satisfies continuity)
select private.process_streak_rollovers();
select is(
  (select current from public.streaks where user_id = 'd0000000-0000-0000-0000-000000000001'),
  5, 'rollover is idempotent within the same day');

-- second consecutive miss (no freeze left) → reset
update public.streaks
set last_active = current_date - 2, freezes_left = 0
where user_id = 'd0000000-0000-0000-0000-000000000001';
select private.process_streak_rollovers();
select is(
  (select array[current, longest] from public.streaks
    where user_id = 'd0000000-0000-0000-0000-000000000001'),
  array[0, 9], 'missing twice resets the streak (longest is kept)');

-- a user with NO tasks is never judged
update public.streaks
set current = 4, freezes_left = 0, last_active = current_date - 5
where user_id = 'd0000000-0000-0000-0000-000000000004'; -- x (no groups)
select private.process_streak_rollovers();
select is(
  (select current from public.streaks where user_id = 'd0000000-0000-0000-0000-000000000004'),
  4, 'no tasks → no judgement (streak untouched)');

-- ----------------------------------------------------------------------------
-- multi-group completion rule: ALL groups' tasks must close
-- ----------------------------------------------------------------------------
insert into public.groups (id, name, created_by) values
  ('d0000000-0000-0000-0000-0000000000b2', 'Second Circle',
   'd0000000-0000-0000-0000-000000000001');
insert into public.memberships (user_id, group_id, role) values
  ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-0000000000b2', 'owner'),
  ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-0000000000b2', 'member');
insert into public.tasks (id, group_id, label, target_count) values
  ('d0000000-0000-0000-0000-0000000000c2', 'd0000000-0000-0000-0000-0000000000b2', 'Istighfar', 5);

select pg_temp.impersonate('d0000000-0000-0000-0000-000000000002'); -- a (in both groups)
select lives_ok(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c1', current_date, 10)$$,
  'a closes group-1 ring');
reset role;
select is(
  (select current from public.streaks where user_id = 'd0000000-0000-0000-0000-000000000002'),
  0, 'one group done, the other open → day not complete yet');
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000002'); -- a
select lives_ok(
  $$select public.increment_count('d0000000-0000-0000-0000-0000000000c2', current_date, 5)$$,
  'a closes group-2 ring');
reset role;
select is(
  (select current from public.streaks where user_id = 'd0000000-0000-0000-0000-000000000002'),
  1, 'all groups closed → streak advances');

-- ----------------------------------------------------------------------------
-- set_count — proxy attribution (D29) + self-correct + guards
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000002'); -- a (co-admin of g1)
select is(
  public.set_count('d0000000-0000-0000-0000-000000000005',
                   'd0000000-0000-0000-0000-0000000000c1', current_date - 1, 10),
  10, 'admin proxy-sets a member''s past day');
reset role;
select is(
  (select logged_by from public.logs
    where user_id = 'd0000000-0000-0000-0000-000000000005'
      and task_id = 'd0000000-0000-0000-0000-0000000000c1' and date = current_date - 1),
  'd0000000-0000-0000-0000-000000000002'::uuid, 'proxy-log is attributed to the admin (D29)');

select pg_temp.impersonate('d0000000-0000-0000-0000-000000000005'); -- r corrects their own record
select lives_ok(
  $$select public.set_count('d0000000-0000-0000-0000-000000000005',
                            'd0000000-0000-0000-0000-0000000000c1', current_date - 1, 8)$$,
  'member self-corrects within the window');
reset role;
select is(
  (select logged_by from public.logs
    where user_id = 'd0000000-0000-0000-0000-000000000005'
      and task_id = 'd0000000-0000-0000-0000-0000000000c1' and date = current_date - 1),
  null, 'self-edit clears the attribution (D29)');

select pg_temp.impersonate('d0000000-0000-0000-0000-000000000005'); -- r is a plain member
select throws_matching(
  $$select public.set_count('d0000000-0000-0000-0000-000000000003',
                            'd0000000-0000-0000-0000-0000000000c1', current_date, 5)$$,
  'only the member or a group admin', 'a plain member cannot set a peer''s counts');
reset role;

select pg_temp.impersonate('d0000000-0000-0000-0000-000000000002'); -- a
select throws_matching(
  $$select public.set_count('d0000000-0000-0000-0000-000000000005',
                            'd0000000-0000-0000-0000-0000000000c1', current_date, 5000)$$,
  'count out of range', 'set_count honours the sanity cap');
select throws_matching(
  $$select public.set_count('d0000000-0000-0000-0000-000000000004',
                            'd0000000-0000-0000-0000-0000000000c1', current_date, 5)$$,
  'not in this group', 'cannot proxy-log someone outside the group');
reset role;

select pg_temp.impersonate('d0000000-0000-0000-0000-000000000004'); -- x
select throws_matching(
  $$select public.set_count('d0000000-0000-0000-0000-000000000004',
                            'd0000000-0000-0000-0000-0000000000c1', current_date, 5)$$,
  'task not found', 'outsider cannot self-log a foreign task');
reset role;

-- ----------------------------------------------------------------------------
-- D48 (0017) — back-filling repairs the streak
-- ----------------------------------------------------------------------------
-- m completed today earlier (streak 1). Back-filling YESTERDAY joins it to the
-- chain retroactively — the "log today first, then notice the gap" order.
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000003'); -- m
select lives_ok(
  $$select public.set_count('d0000000-0000-0000-0000-000000000003',
                            'd0000000-0000-0000-0000-0000000000c1', current_date - 1, 10)$$,
  'm back-fills yesterday to full');
reset role;
select is(
  (select array[current, longest] from public.streaks
    where user_id = 'd0000000-0000-0000-0000-000000000003'),
  array[2, 2], 'back-filling yesterday retroactively extends the streak (D48)');

-- r: a RESET streak rebuilds from the repaired days. History: t-3/t-2 complete,
-- t-1 missed (8/10 from the self-correct test), today complete; then simulate
-- the post-reset state the rollover job leaves, and repair the missed day.
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000005'); -- r
select lives_ok(
  $$select public.set_count('d0000000-0000-0000-0000-000000000005',
                            'd0000000-0000-0000-0000-0000000000c1', current_date - 2, 10)$$,
  'r back-fills t-2');
select lives_ok(
  $$select public.set_count('d0000000-0000-0000-0000-000000000005',
                            'd0000000-0000-0000-0000-0000000000c1', current_date - 3, 10)$$,
  'r back-fills t-3');
reset role;
update public.streaks
set current = 0, longest = 8, freezes_left = 0, last_active = current_date - 4
where user_id = 'd0000000-0000-0000-0000-000000000005';
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000005'); -- r
select lives_ok(
  $$select public.set_count('d0000000-0000-0000-0000-000000000005',
                            'd0000000-0000-0000-0000-0000000000c1', current_date - 1, 10)$$,
  'r repairs the missed day');
reset role;
select is(
  (select array[current, longest, freezes_left] from public.streaks
    where user_id = 'd0000000-0000-0000-0000-000000000005'),
  array[4, 8, 1],
  'repairing the gap rebuilds the whole visible chain (t-3..today = 4); longest kept (D48)');
select is(
  (select last_active from public.streaks
    where user_id = 'd0000000-0000-0000-0000-000000000005'),
  current_date, 'the repaired chain is anchored at the present');

-- …but an isolated OLD completion never fakes a live streak
select pg_temp.impersonate('d0000000-0000-0000-0000-000000000005'); -- r
select lives_ok(
  $$select public.set_count('d0000000-0000-0000-0000-000000000005',
                            'd0000000-0000-0000-0000-0000000000c1', current_date - 6, 10)$$,
  'r logs an isolated day far in the past');
reset role;
select is(
  (select current from public.streaks
    where user_id = 'd0000000-0000-0000-0000-000000000005'),
  4, 'an isolated old completion does not change the live streak');

select * from finish();
rollback;
