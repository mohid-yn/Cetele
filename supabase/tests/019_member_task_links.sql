-- ============================================================================
-- Logic + grants test suite — 0034 (linked tasks: one act, many circles)
-- ----------------------------------------------------------------------------
-- Covers:
--   * the default: a member with no links behaves exactly as before
--   * THE ASSERTION THAT CARRIES THE MIGRATION — one tap in circle A lands in
--     circle B, and each circle still judges it by its OWN target
--   * the RAW COUNT travels, never the completion: a task asking 1 and a task
--     asking 5 both receive 1
--   * the OPERATION is mirrored, not the value — increment carries the delta, so
--     two counts that had drifted stay drifted; set_count carries the absolute
--   * an admin's proxy log fans out into a circle the admin is not in (D64's
--     deliberate widening of D29), attributed on both rows
--   * DORMANCY (0019's rule, third application): leaving a circle stops the
--     fan-out and KEEPS the row; rejoining wakes it
--   * clusters merge, and a cluster that falls to one task is dissolved
--   * same-circle links are refused out loud
--   * RLS + grants: a member reads only their own links and writes none at all
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture: two circles. M is in both. A owns House 1 only (the proxy-log case).
-- N is in House 1 only, as the "somebody else's links" negative. Car exists in
-- both circles asking DIFFERENT amounts (1 vs 5) — the mismatch D64 allows.
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('c6000000-0000-0000-0000-00000000000a', 'a@lnk.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('c6000000-0000-0000-0000-00000000000d', 'm@lnk.test', '{"name":"M"}', 'authenticated', 'authenticated'),
  ('c6000000-0000-0000-0000-00000000000e', 'n@lnk.test', '{"name":"N"}', 'authenticated', 'authenticated'),
  -- F owns House 2 so that House 2 SURVIVES M leaving it. A circle whose last
  -- member goes is deleted outright (0014), which would cascade the task and
  -- take the link row with it — the dormancy assertions below would then be
  -- testing the cascade rather than the membership guard they are aimed at.
  ('c6000000-0000-0000-0000-00000000000f', 'f@lnk.test', '{"name":"F"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('c6000000-0000-0000-0000-00000000d001', 'House 1', 'c6000000-0000-0000-0000-00000000000a'),
  ('c6000000-0000-0000-0000-00000000d002', 'House 2', 'c6000000-0000-0000-0000-00000000000f');

insert into public.memberships (user_id, group_id, role, created_at) values
  ('c6000000-0000-0000-0000-00000000000a', 'c6000000-0000-0000-0000-00000000d001', 'owner',  now() - interval '40 days'),
  ('c6000000-0000-0000-0000-00000000000d', 'c6000000-0000-0000-0000-00000000d001', 'member', now() - interval '40 days'),
  ('c6000000-0000-0000-0000-00000000000e', 'c6000000-0000-0000-0000-00000000d001', 'member', now() - interval '40 days'),
  ('c6000000-0000-0000-0000-00000000000f', 'c6000000-0000-0000-0000-00000000d002', 'owner',  now() - interval '40 days'),
  ('c6000000-0000-0000-0000-00000000000d', 'c6000000-0000-0000-0000-00000000d002', 'member', now() - interval '40 days');

insert into public.tasks (id, group_id, label, target_count, frequency_days, created_at) values
  -- House 1: Car asks 1 (a toggle), Dishes asks 10 (the same-circle negative)
  ('c6000000-0000-0000-0000-00000000e001', 'c6000000-0000-0000-0000-00000000d001', 'Car',    1,  1, now() - interval '30 days'),
  ('c6000000-0000-0000-0000-00000000e002', 'c6000000-0000-0000-0000-00000000d001', 'Dishes', 10, 1, now() - interval '30 days'),
  -- House 2: the same Car, asking 5
  ('c6000000-0000-0000-0000-00000000e003', 'c6000000-0000-0000-0000-00000000d002', 'Car',    5,  1, now() - interval '30 days');

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

/** M's count for one task today. */
create function pg_temp.cnt(t uuid) returns integer language sql as $$
  select coalesce((select count from public.logs
                   where user_id = 'c6000000-0000-0000-0000-00000000000d'
                     and task_id = t and date = current_date), 0);
$$;

-- ----------------------------------------------------------------------------
-- 1. The default — no links, no fan-out
-- ----------------------------------------------------------------------------

select is((select count(*) from public.member_task_links), 0::bigint,
  'no links exist until a member makes one');

select pg_temp.impersonate('c6000000-0000-0000-0000-00000000000d');
select is(public.increment_count('c6000000-0000-0000-0000-00000000e001', current_date, 1), 1,
  'an unlinked tap lands on its own task');
select is(pg_temp.cnt('c6000000-0000-0000-0000-00000000e003'), 0,
  '...and nowhere else — the other circle is untouched');
select pg_temp.reset_role();

-- Clear it again, so the linking tests start from a clean day.
delete from public.logs where user_id = 'c6000000-0000-0000-0000-00000000000d';

-- ----------------------------------------------------------------------------
-- 2. link_tasks — what it refuses, and out loud
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c6000000-0000-0000-0000-00000000000d');

select throws_ok(
  $$ select public.link_tasks('c6000000-0000-0000-0000-00000000e001',
                              'c6000000-0000-0000-0000-00000000e002') $$,
  'those two tasks are in the same circle',
  'two tasks in ONE circle cannot be linked — it would double that circle''s own total');

select throws_ok(
  $$ select public.link_tasks('c6000000-0000-0000-0000-00000000e001',
                              'c6000000-0000-0000-0000-00000000e001') $$,
  'two different tasks are needed',
  'a task cannot be linked to itself');

select pg_temp.reset_role();

-- N is not in House 2, so its task must not even be admitted to exist.
select pg_temp.impersonate('c6000000-0000-0000-0000-00000000000e');
select throws_ok(
  $$ select public.link_tasks('c6000000-0000-0000-0000-00000000e001',
                              'c6000000-0000-0000-0000-00000000e003') $$,
  'task not found',
  'a task in a circle you are not in is "not found" — no oracle');
select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 3. THE ONE THAT CARRIES IT — one tap, both circles
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c6000000-0000-0000-0000-00000000000d');

select isnt(public.link_tasks('c6000000-0000-0000-0000-00000000e001',
                              'c6000000-0000-0000-0000-00000000e003'), null,
  'M links House 1''s Car to House 2''s Car');

select is((select count(distinct cluster_id) from public.member_task_links
            where user_id = 'c6000000-0000-0000-0000-00000000000d'), 1::bigint,
  '...as ONE cluster, not two rows pointing at each other');

select is(public.increment_count('c6000000-0000-0000-0000-00000000e001', current_date, 1), 1,
  'M taps the Car once, in House 1');

select is(pg_temp.cnt('c6000000-0000-0000-0000-00000000e003'), 1,
  'THE ASSERTION: the same 1 landed in House 2 — one act, both circles');

-- The RAW COUNT travelled, not the completion. House 2 asks 5, so it is 1-of-5
-- and NOT closed: mirroring "done" would post four counts nobody performed.
-- Read as postgres — `effective_target` is revoked from `authenticated` (0032).
select pg_temp.reset_role();
select is(private.effective_target('c6000000-0000-0000-0000-00000000e003',
                                   'c6000000-0000-0000-0000-00000000000d', current_date), 5,
  'House 2 still asks 5 of its own accord');
select ok(pg_temp.cnt('c6000000-0000-0000-0000-00000000e003')
          < private.effective_target('c6000000-0000-0000-0000-00000000e003',
                                     'c6000000-0000-0000-0000-00000000000d', current_date),
  '...and 1 of 5 is NOT closed — the count travels, the completion does not');

-- ----------------------------------------------------------------------------
-- 4. The OPERATION is mirrored, not the value
-- ----------------------------------------------------------------------------
-- House 2's Car is pushed ahead by hand, as if it had been logged separately
-- before the link existed. A further tap must add the DELTA to both, leaving the
-- drift intact rather than flattening the two counts together.

update public.logs set count = 4
 where user_id = 'c6000000-0000-0000-0000-00000000000d'
   and task_id = 'c6000000-0000-0000-0000-00000000e003' and date = current_date;

select pg_temp.impersonate('c6000000-0000-0000-0000-00000000000d');
select is(public.increment_count('c6000000-0000-0000-0000-00000000e001', current_date, 2), 3,
  'another tap of 2 takes House 1 from 1 to 3');
select is(pg_temp.cnt('c6000000-0000-0000-0000-00000000e003'), 6,
  '...and House 2 from 4 to 6 — the DELTA travelled, so the drift survives');

-- set_count carries the ABSOLUTE, because that is the operation being mirrored.
select is(public.set_count('c6000000-0000-0000-0000-00000000000d',
                           'c6000000-0000-0000-0000-00000000e001', current_date, 9), 9,
  'M corrects House 1''s day to exactly 9');
select is(pg_temp.cnt('c6000000-0000-0000-0000-00000000e003'), 9,
  '...and House 2 is set to 9 too — "the day was 9" in both');

select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 5. An admin's proxy log fans out — D64's deliberate widening of D29
-- ----------------------------------------------------------------------------
-- A owns House 1 and is NOT in House 2. The far write skips the admin check on
-- purpose: the authority is M's link, not A's role.

select pg_temp.impersonate('c6000000-0000-0000-0000-00000000000a');
select is(public.set_count('c6000000-0000-0000-0000-00000000000d',
                           'c6000000-0000-0000-0000-00000000e001', current_date, 7), 7,
  'A proxy-logs 7 for M in the circle A actually administers');
select pg_temp.reset_role();

select is(pg_temp.cnt('c6000000-0000-0000-0000-00000000e003'), 7,
  '...and it reaches House 2, a circle A is not even in');

select is((select logged_by from public.logs
            where user_id = 'c6000000-0000-0000-0000-00000000000d'
              and task_id = 'c6000000-0000-0000-0000-00000000e003'
              and date = current_date),
          'c6000000-0000-0000-0000-00000000000a'::uuid,
  '...attributed to A on the FAR row too — the row does not lie about who wrote it');

-- ----------------------------------------------------------------------------
-- 6. Dormancy — leaving a circle stops the fan-out and KEEPS the row (0019)
-- ----------------------------------------------------------------------------

delete from public.memberships
 where user_id = 'c6000000-0000-0000-0000-00000000000d'
   and group_id = 'c6000000-0000-0000-0000-00000000d002';

select is((select count(*) from public.member_task_links
            where user_id = 'c6000000-0000-0000-0000-00000000000d'), 2::bigint,
  'leaving House 2 does NOT delete the link — 0019''s rule, third application');

select is((select count(*) from private.linked_tasks(
            'c6000000-0000-0000-0000-00000000000d',
            'c6000000-0000-0000-0000-00000000e001')), 0::bigint,
  '...but the link is dormant: nothing to fan out into');

select pg_temp.impersonate('c6000000-0000-0000-0000-00000000000d');
select is(public.set_count('c6000000-0000-0000-0000-00000000000d',
                           'c6000000-0000-0000-0000-00000000e001', current_date, 3), 3,
  'M logs House 1 again while out of House 2');
select pg_temp.reset_role();
select is(pg_temp.cnt('c6000000-0000-0000-0000-00000000e003'), 7,
  '...and House 2 is untouched — still the 7 from before they left');

-- Rejoining wakes it, which is the whole reason the row was kept.
insert into public.memberships (user_id, group_id, role, created_at) values
  ('c6000000-0000-0000-0000-00000000000d', 'c6000000-0000-0000-0000-00000000d002', 'member', now());

select is((select count(*) from private.linked_tasks(
            'c6000000-0000-0000-0000-00000000000d',
            'c6000000-0000-0000-0000-00000000e001')), 1::bigint,
  'rejoining wakes the link, with nothing for the member to set up again');

-- ----------------------------------------------------------------------------
-- 7. Clusters merge; a cluster of one is dissolved
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c6000000-0000-0000-0000-00000000000d');

-- Link Dishes (House 1) to House 2's Car, which is already clustered with
-- House 1's Car. Dishes and Car are in the same circle, so this must still be
-- refused — the same-circle rule is about the CLUSTER, not just the pair.
select throws_ok(
  $$ select public.link_tasks('c6000000-0000-0000-0000-00000000e002',
                              'c6000000-0000-0000-0000-00000000e001') $$,
  'those two tasks are in the same circle',
  'the same-circle refusal still holds for an already-clustered task');

-- Re-linking the same pair is a no-op that returns the standing cluster.
select is(public.link_tasks('c6000000-0000-0000-0000-00000000e003',
                            'c6000000-0000-0000-0000-00000000e001'),
          (select cluster_id from public.member_task_links
            where user_id = 'c6000000-0000-0000-0000-00000000000d'
              and task_id = 'c6000000-0000-0000-0000-00000000e001'),
  'linking an existing pair again returns the cluster they already share');

-- Unlinking one side takes the OTHER with it: a cluster of one fans out to
-- nothing, so it is dissolved rather than left for the member to remove twice.
select public.unlink_task('c6000000-0000-0000-0000-00000000e001');
select is((select count(*) from public.member_task_links
            where user_id = 'c6000000-0000-0000-0000-00000000000d'), 0::bigint,
  'unlinking one of a pair dissolves the cluster entirely');

select lives_ok(
  $$ select public.unlink_task('c6000000-0000-0000-0000-00000000e001') $$,
  'unlinking something that was never linked is not an error');

select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 8. RLS + grants — a member reads only their own links, and writes none
-- ----------------------------------------------------------------------------

insert into public.member_task_links (user_id, task_id, cluster_id) values
  ('c6000000-0000-0000-0000-00000000000d', 'c6000000-0000-0000-0000-00000000e001',
   'c6000000-0000-0000-0000-0000000c1051'),
  ('c6000000-0000-0000-0000-00000000000d', 'c6000000-0000-0000-0000-00000000e003',
   'c6000000-0000-0000-0000-0000000c1051');

select pg_temp.impersonate('c6000000-0000-0000-0000-00000000000d');
select is((select count(*) from public.member_task_links), 2::bigint,
  'M reads their own links');
select pg_temp.reset_role();

-- N shares a circle with M, and is still shown nothing: a link exposes which
-- OTHER circles a member belongs to.
select pg_temp.impersonate('c6000000-0000-0000-0000-00000000000e');
select is((select count(*) from public.member_task_links), 0::bigint,
  'a fellow member of the same circle sees none of M''s links');

select pg_temp.reset_role();

select ok(not has_table_privilege('authenticated', 'public.member_task_links', 'INSERT'),
  'authenticated holds no INSERT — the merge and dissolve rules are the RPC''s');
select ok(not has_table_privilege('authenticated', 'public.member_task_links', 'UPDATE'),
  '...nor UPDATE — a client that could re-cluster could redirect its own taps');
select ok(not has_table_privilege('authenticated', 'public.member_task_links', 'DELETE'),
  '...nor DELETE — unlink_task dissolves the leftover, a raw delete would not');
select ok(has_table_privilege('authenticated', 'public.member_task_links', 'SELECT'),
  '...but SELECT is granted, so the member can see their own links');

select * from finish();
rollback;
