-- ============================================================================
-- RLS + grants + logic test suite — M6 (daily_completion rollup, 0010)
-- ----------------------------------------------------------------------------
-- Run with `supabase test db` (pgTAP; one rolled-back transaction).
--
-- Covers the M6 invariants:
--   * daily_completion: read self OR same-group admin; writes are job-only
--   * run_daily_rollup: completion_pct = mean ring-fill (full=100, partial=
--     fraction, missed-in-span=0); enrolment cutoff (no rows before joining);
--     WRITE-BEFORE-PRUNE (the boundary day is rolled up, then its raw log
--     pruned in the same run); logs prune to 14d, rollup prunes to 90d
--   * group_consistency: members-facing aggregate; non-member is refused
--   * steadfastness shape: avg(completion_pct) + active-day eligibility
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture: o=owner a=co-admin m=member n=new-joiner x=outsider
-- g1 has TWO tasks (t1 target 10, t2 target 5) so partial credit is testable.
-- Enrolment: o/a/m joined 40d ago; n joined 3d ago (tests the span cutoff).
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('e6000000-0000-0000-0000-000000000001', 'o@m6.test', '{"name":"O"}', 'authenticated', 'authenticated'),
  ('e6000000-0000-0000-0000-000000000002', 'a@m6.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('e6000000-0000-0000-0000-000000000003', 'm@m6.test', '{"name":"M"}', 'authenticated', 'authenticated'),
  ('e6000000-0000-0000-0000-000000000004', 'n@m6.test', '{"name":"N"}', 'authenticated', 'authenticated'),
  ('e6000000-0000-0000-0000-000000000005', 'x@m6.test', '{"name":"X"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('e6000000-0000-0000-0000-0000000000b1', 'M6 Circle',
   'e6000000-0000-0000-0000-000000000001');

insert into public.memberships (user_id, group_id, role, created_at) values
  ('e6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-0000000000b1', 'owner',  current_date - 40),
  ('e6000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-0000000000b1', 'admin',  current_date - 40),
  ('e6000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-0000000000b1', 'member', current_date - 40),
  ('e6000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-0000000000b1', 'member', current_date - 3);

insert into public.tasks (id, group_id, label, target_count) values
  ('e6000000-0000-0000-0000-0000000000c1', 'e6000000-0000-0000-0000-0000000000b1', 'Salawat',   10),
  ('e6000000-0000-0000-0000-0000000000c2', 'e6000000-0000-0000-0000-0000000000b1', 'Istighfar', 5);

-- Raw logs (inserted directly as the test superuser; the app path is RPC-only).
-- m: cd-1 FULL (both rings) · cd-2 PARTIAL (t1 only → 50%) · cd-3 nothing (missed
--    within span → 0) · cd-15 FULL (the write-before-prune boundary day).
insert into public.logs (user_id, task_id, date, count) values
  ('e6000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-0000000000c1', current_date - 1, 10),
  ('e6000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-0000000000c2', current_date - 1, 5),
  ('e6000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-0000000000c1', current_date - 2, 10),
  ('e6000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-0000000000c1', current_date - 15, 10),
  ('e6000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-0000000000c2', current_date - 15, 5),
  -- an ancient log outside the rollup window → must be pruned, never rolled up
  ('e6000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-0000000000c1', current_date - 20, 10),
  -- n: only cd-1 FULL (joined cd-3, so cd-3/cd-2 are enrolled-but-missed = 0)
  ('e6000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-0000000000c1', current_date - 1, 10),
  ('e6000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-0000000000c2', current_date - 1, 5);

-- an ancient rollup row (as if written 100 days ago) → must be pruned to 90d
insert into public.daily_completion (user_id, group_id, date, completion_pct) values
  ('e6000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-0000000000b1', current_date - 100, 100);

create function pg_temp.impersonate(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ----------------------------------------------------------------------------
-- Grant posture (0010)
-- ----------------------------------------------------------------------------
select ok(has_table_privilege('authenticated','public.daily_completion','select'), 'daily_completion is readable (RLS-scoped)');
select ok(not has_table_privilege('authenticated','public.daily_completion','insert'), 'daily_completion INSERT is job-only');
select ok(not has_table_privilege('authenticated','public.daily_completion','update'), 'daily_completion UPDATE is job-only');
select ok(not has_table_privilege('authenticated','public.daily_completion','delete'), 'daily_completion DELETE is job-only');
select ok(not has_table_privilege('anon','public.daily_completion','select'), 'anon has no daily_completion read');
select ok(not has_function_privilege('anon','public.group_consistency(uuid,integer)','execute'), 'anon cannot call group_consistency');
select ok(has_function_privilege('authenticated','public.group_consistency(uuid,integer)','execute'), 'members can call group_consistency');
select ok(not has_function_privilege('authenticated','private.run_daily_rollup()','execute'), 'clients cannot run the rollup job');
-- the new enrolment column is never client-writable (no column grant added)
select ok(not has_column_privilege('authenticated','public.memberships','created_at','insert'), 'memberships.created_at is not client-insertable');
select ok(not has_column_privilege('authenticated','public.memberships','created_at','update'), 'memberships.created_at is not client-updatable');

-- ----------------------------------------------------------------------------
-- Run the nightly rollup + prune
-- ----------------------------------------------------------------------------
select lives_ok($$select private.run_daily_rollup()$$, 'the rollup job runs');

-- completion_pct — mean ring-fill (partial credit, D31)
select is((select completion_pct from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000003' and date=current_date-1),
  100.00, 'a fully-completed day rolls up to 100');
select is((select completion_pct from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000003' and date=current_date-2),
  50.00, 'one of two rings closed rolls up to 50 (partial credit)');
select is((select completion_pct from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000003' and date=current_date-3),
  0.00, 'a missed day within the enrolled span rolls up to 0');

-- enrolment cutoff — n (joined cd-3) has no row before joining, a 0 row on cd-3
select is((select completion_pct from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000004' and date=current_date-1),
  100.00, 'new joiner: their completed day rolls up');
select is((select completion_pct from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000004' and date=current_date-3),
  0.00, 'new joiner: enrolled-but-missed day is 0');
select is((select count(*) from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000004' and date=current_date-4),
  0::bigint, 'new joiner: NO row before they joined (pre-enrolment days do not count)');

-- write-before-prune: the boundary day (cd-15) is rolled up, THEN its raw log
-- is pruned — proves ordering (a day is never lost to the prune un-rolled).
select is((select completion_pct from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000003' and date=current_date-15),
  100.00, 'the boundary day is rolled up before its raw log is pruned');
select is((select count(*) from public.logs
  where user_id='e6000000-0000-0000-0000-000000000003' and date=current_date-15),
  0::bigint, 'the boundary day''s raw log is pruned (14-day retention)');

-- prune: the ancient log (cd-20) is gone and was never rolled up (outside window)
select is((select count(*) from public.logs
  where user_id='e6000000-0000-0000-0000-000000000003' and date=current_date-20),
  0::bigint, 'logs older than 14 days are pruned');
select is((select count(*) from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000003' and date=current_date-20),
  0::bigint, 'a day outside the rollup window is not fabricated');
-- recent logs (still in the 14-day window) survive the prune
select is((select count from public.logs
  where user_id='e6000000-0000-0000-0000-000000000003'
    and task_id='e6000000-0000-0000-0000-0000000000c1' and date=current_date-1),
  10, 'logs inside the 14-day window are kept');
-- rollup prune: the 100-day-old row is gone
select is((select count(*) from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000003' and date=current_date-100),
  0::bigint, 'rollup rows older than 90 days are pruned');

-- idempotent: a second run leaves the same picture
select lives_ok($$select private.run_daily_rollup()$$, 'the rollup job is idempotent');
select is((select completion_pct from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000003' and date=current_date-2),
  50.00, 're-running does not change a settled day');

-- ----------------------------------------------------------------------------
-- steadfastness shape — avg(completion_pct) over the member's rows + active days
-- m has: cd-1=100, cd-2=50, cd-3..cd-14=0 (12 days), cd-15=100 → 15 rows,
-- sum 250 → avg 16.67 → 17; active days (pct>0) = 3 → NOT yet eligible (<14).
-- ----------------------------------------------------------------------------
select is((select round(avg(completion_pct))::integer from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000003'
    and group_id='e6000000-0000-0000-0000-0000000000b1'),
  17, 'steadfastness = average daily completion rate (a rate, not a sum)');
select is((select count(*) from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000003'
    and group_id='e6000000-0000-0000-0000-0000000000b1' and completion_pct > 0),
  3::bigint, 'active-day count feeds the >=14-day eligibility floor');

-- ----------------------------------------------------------------------------
-- RLS — self reads own; same-group admin reads members'; peers/outsiders don't
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('e6000000-0000-0000-0000-000000000003'); -- m
select ok((select count(*) from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000003') > 0, 'a member sees their own rows');
select is((select count(*) from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000004'),
  0::bigint, 'a plain member cannot read a peer''s rows (privacy)');
reset role;

select pg_temp.impersonate('e6000000-0000-0000-0000-000000000002'); -- a (co-admin)
select ok((select count(*) from public.daily_completion
  where user_id='e6000000-0000-0000-0000-000000000003') > 0, 'a same-group admin reads members'' rows (steadfastness board)');
reset role;

select pg_temp.impersonate('e6000000-0000-0000-0000-000000000005'); -- x (outsider)
select is((select count(*) from public.daily_completion), 0::bigint, 'an outsider sees no rows');
reset role;

-- ----------------------------------------------------------------------------
-- group_consistency — the members-facing collective figure
-- Members: o=0 a=0 m=2 full days n=1 full day. Over 90: avg of full/90*100
--   = (0+0+2.222+1.111)/4 = 0.83 → 1. Over 5: (0+0+20+20)/4 = 10.
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('e6000000-0000-0000-0000-000000000003'); -- m
select is(public.group_consistency('e6000000-0000-0000-0000-0000000000b1', 90), 1,
  'group consistency = mean of members'' recent full-day rate (90d)');
select is(public.group_consistency('e6000000-0000-0000-0000-0000000000b1', 5), 10,
  'group consistency respects the window (5d)');
reset role;

select pg_temp.impersonate('e6000000-0000-0000-0000-000000000005'); -- x (outsider)
select throws_matching(
  $$select public.group_consistency('e6000000-0000-0000-0000-0000000000b1', 90)$$,
  'group not found', 'a non-member cannot read the group figure');
reset role;

select * from finish();
rollback;
