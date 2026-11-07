-- ============================================================================
-- Logic + grants test suite: 0047 (moving and archiving branches, moving
-- circles, deleting events, D87)
-- ----------------------------------------------------------------------------
-- Pins who may move what (the right to run both ends), that a branch cannot
-- move inside itself, that archiving silences a subtree for members, pickers
-- and roadmaps and that restoring brings it back, and the new deletes.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

create function pg_temp.impersonate(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;
create function pg_temp.reset_role() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
end;
$$;

-- O organiser · S admin of Melbourne · T admin of North only · A owner of the
-- circle in North · B a member of it.
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('cf000000-0000-0000-0000-00000000000f', 'o@mv.test', '{"name":"O"}', 'authenticated', 'authenticated'),
  ('cf000000-0000-0000-0000-000000000005', 's@mv.test', '{"name":"S"}', 'authenticated', 'authenticated'),
  ('cf000000-0000-0000-0000-000000000006', 't@mv.test', '{"name":"T"}', 'authenticated', 'authenticated'),
  ('cf000000-0000-0000-0000-00000000000a', 'a@mv.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('cf000000-0000-0000-0000-00000000000b', 'b@mv.test', '{"name":"B"}', 'authenticated', 'authenticated');
update public.profiles set is_super_admin = true
 where id = 'cf000000-0000-0000-0000-00000000000f';

-- YN → MEL → {NORTH → INNER, SOUTH};  YN → SYD
insert into public.branches (id, parent_id, name) values
  ('cf000000-0000-0000-0000-000000000100', null, 'MV Nexus'),
  ('cf000000-0000-0000-0000-000000000102', 'cf000000-0000-0000-0000-000000000100', 'Melbourne'),
  ('cf000000-0000-0000-0000-000000000103', 'cf000000-0000-0000-0000-000000000102', 'North'),
  ('cf000000-0000-0000-0000-000000000104', 'cf000000-0000-0000-0000-000000000102', 'South'),
  ('cf000000-0000-0000-0000-000000000106', 'cf000000-0000-0000-0000-000000000103', 'Inner'),
  ('cf000000-0000-0000-0000-000000000105', 'cf000000-0000-0000-0000-000000000100', 'Sydney');
insert into public.branch_stewards (branch_id, user_id) values
  ('cf000000-0000-0000-0000-000000000102', 'cf000000-0000-0000-0000-000000000005'),
  ('cf000000-0000-0000-0000-000000000103', 'cf000000-0000-0000-0000-000000000006');

insert into public.groups (id, name, created_by, branch_id) values
  ('cf000000-0000-0000-0000-000000000200', 'MV circle', 'cf000000-0000-0000-0000-00000000000a',
   'cf000000-0000-0000-0000-000000000103');
insert into public.memberships (user_id, group_id, role) values
  ('cf000000-0000-0000-0000-00000000000a', 'cf000000-0000-0000-0000-000000000200', 'owner'),
  ('cf000000-0000-0000-0000-00000000000b', 'cf000000-0000-0000-0000-000000000200', 'member');

insert into public.roadmaps (id, name, starts_on, ends_on, published) values
  ('cf000000-0000-0000-0000-000000000300', 'MV Roadmap', current_date, current_date + 300, true);

-- ---- 1. moving a circle ----------------------------------------------------
select pg_temp.impersonate('cf000000-0000-0000-0000-000000000006');
select throws_ok(
  $$ select public.move_circle('cf000000-0000-0000-0000-000000000200',
       'cf000000-0000-0000-0000-000000000104') $$,
  'you can only move it to a branch you run',
  'North''s admin cannot move a circle into South, which they do not run');
select pg_temp.reset_role();

select pg_temp.impersonate('cf000000-0000-0000-0000-000000000005');
select lives_ok(
  $$ select public.move_circle('cf000000-0000-0000-0000-000000000200',
       'cf000000-0000-0000-0000-000000000104') $$,
  'Melbourne''s admin moves it from North to South, both theirs');
select pg_temp.reset_role();
select is((select branch_id from public.groups where id = 'cf000000-0000-0000-0000-000000000200'),
  'cf000000-0000-0000-0000-000000000104'::uuid, 'and it is in South');

select pg_temp.impersonate('cf000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.move_circle('cf000000-0000-0000-0000-000000000200',
       'cf000000-0000-0000-0000-000000000103') $$,
  'you do not run the branch it is in',
  'the circle''s own admin uses a request, not this');
select pg_temp.reset_role();

-- Back to North for the rest.
update public.groups set branch_id = 'cf000000-0000-0000-0000-000000000103'
 where id = 'cf000000-0000-0000-0000-000000000200';

-- ---- 2. moving a branch ----------------------------------------------------
select pg_temp.impersonate('cf000000-0000-0000-0000-000000000006');
select throws_ok(
  $$ select public.move_branch('cf000000-0000-0000-0000-000000000103',
       'cf000000-0000-0000-0000-000000000104') $$,
  'only the admins of the branch above can move this one',
  'North''s own admin cannot move North: that is Melbourne''s call');
select pg_temp.reset_role();

select pg_temp.impersonate('cf000000-0000-0000-0000-000000000005');
select throws_ok(
  $$ select public.move_branch('cf000000-0000-0000-0000-000000000103',
       'cf000000-0000-0000-0000-000000000105') $$,
  'you do not run the branch you are moving it into',
  'Melbourne''s admin cannot move North into Sydney');
select throws_ok(
  $$ select public.move_branch('cf000000-0000-0000-0000-000000000102',
       'cf000000-0000-0000-0000-000000000105') $$,
  'only the admins of the branch above can move this one',
  'nor move Melbourne itself');
select lives_ok(
  $$ select public.move_branch('cf000000-0000-0000-0000-000000000104',
       'cf000000-0000-0000-0000-000000000103') $$,
  'but can move South inside North, both theirs');
select pg_temp.reset_role();
update public.branches set parent_id = 'cf000000-0000-0000-0000-000000000102'
 where id = 'cf000000-0000-0000-0000-000000000104';

select pg_temp.impersonate('cf000000-0000-0000-0000-00000000000f');
select throws_ok(
  $$ select public.move_branch('cf000000-0000-0000-0000-000000000103',
       'cf000000-0000-0000-0000-000000000106') $$,
  'a branch cannot move inside itself',
  'North cannot move under its own child');

-- A roadmap on Sydney reaches the circle once North moves there.
select public.set_branch_on_roadmap('cf000000-0000-0000-0000-000000000300',
  'cf000000-0000-0000-0000-000000000105', true);
select lives_ok(
  $$ select public.move_branch('cf000000-0000-0000-0000-000000000103',
       'cf000000-0000-0000-0000-000000000105') $$,
  'an organiser moves North into Sydney');
select pg_temp.reset_role();
select is(
  (select via_branch from public.group_roadmaps
    where group_id = 'cf000000-0000-0000-0000-000000000200'),
  'cf000000-0000-0000-0000-000000000105'::uuid,
  'and the circle now follows Sydney''s roadmap');

select pg_temp.impersonate('cf000000-0000-0000-0000-00000000000f');
select public.move_branch('cf000000-0000-0000-0000-000000000103',
  'cf000000-0000-0000-0000-000000000102');
select pg_temp.reset_role();
select is(
  (select count(*)::int from public.group_roadmaps
    where group_id = 'cf000000-0000-0000-0000-000000000200'),
  0, 'moving back to Melbourne drops it again');

-- ---- 3. archiving ----------------------------------------------------------
select pg_temp.impersonate('cf000000-0000-0000-0000-00000000000f');
select public.set_branch_on_roadmap('cf000000-0000-0000-0000-000000000300',
  'cf000000-0000-0000-0000-000000000105', false);
select public.set_branch_on_roadmap('cf000000-0000-0000-0000-000000000300',
  'cf000000-0000-0000-0000-000000000103', true);
select pg_temp.reset_role();

select pg_temp.impersonate('cf000000-0000-0000-0000-000000000006');
select throws_ok(
  $$ select public.set_branch_archived('cf000000-0000-0000-0000-000000000103', true) $$,
  'only the admins of the branch above can archive this one',
  'North''s admin cannot archive North');
select pg_temp.reset_role();

select pg_temp.impersonate('cf000000-0000-0000-0000-000000000005');
select lives_ok(
  $$ select public.set_branch_archived('cf000000-0000-0000-0000-000000000103', true) $$,
  'Melbourne''s admin archives North');
select pg_temp.reset_role();

select pg_temp.impersonate('cf000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from private.my_reach()), 0,
  'the member in North is reached by nothing while it is archived');
select is((select count(*)::int from public.branch_directory()
            where label like 'MV Nexus%North%'), 0,
  'North, and Inner inside it, leave the picker');
select pg_temp.reset_role();
select is((select count(*)::int from public.group_roadmaps
            where group_id = 'cf000000-0000-0000-0000-000000000200'), 0,
  'its roadmap stops reaching the circle');

select pg_temp.impersonate('cf000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.request_branch('cf000000-0000-0000-0000-000000000200',
       'cf000000-0000-0000-0000-000000000106') $$,
  'that branch is archived', 'and nobody can ask to join inside it');
select pg_temp.reset_role();

select pg_temp.impersonate('cf000000-0000-0000-0000-000000000005');
select results_eq(
  $$ select archived, live from public.my_steward_tree()
      where id in ('cf000000-0000-0000-0000-000000000103', 'cf000000-0000-0000-0000-000000000106')
      order by name $$,
  $$ values (false, false), (true, false) $$,
  'the admin tree marks North archived and Inner quiet with it');
select lives_ok(
  $$ select public.set_branch_archived('cf000000-0000-0000-0000-000000000103', false) $$,
  'and restores it');
select pg_temp.reset_role();

select pg_temp.impersonate('cf000000-0000-0000-0000-00000000000b');
select ok((select count(*)::int from private.my_reach()) > 0, 'the member is reached again');
select pg_temp.reset_role();
select is((select count(*)::int from public.group_roadmaps
            where group_id = 'cf000000-0000-0000-0000-000000000200'), 1,
  'and the roadmap is back, progress untouched');

-- ---- 4. deleting events ----------------------------------------------------
select pg_temp.impersonate('cf000000-0000-0000-0000-000000000005');
create temporary table mv_ids (k text, v uuid);
grant all on mv_ids to authenticated;
insert into mv_ids select 'camp', public.save_camp(null, 'cf000000-0000-0000-0000-000000000102',
  'MV Camp', '', '', now() + interval '5 days', now() + interval '6 days',
  'Australia/Melbourne', null, null, 'published');
select lives_ok(
  $$ select public.delete_event((select v from mv_ids where k = 'camp')) $$,
  'a published camp can be deleted');
insert into mv_ids select 'series', public.save_series(null, 'cf000000-0000-0000-0000-000000000102',
  'MV Halaqah', '', '', 4::smallint, '19:00'::time, 90, 'Australia/Melbourne', true);
select throws_like(
  $$ select public.delete_event((select e.id from public.events e
        where e.series_id = (select v from mv_ids where k = 'series')
        order by e.starts_at limit 1)) $$,
  'cancel this week instead%',
  'one week of a halaqah is cancelled, never deleted');
select lives_ok(
  $$ select public.delete_series((select v from mv_ids where k = 'series')) $$,
  'a weekly halaqah can be deleted as a whole');
select pg_temp.reset_role();
select is((select count(*)::int from public.events
            where series_id = (select v from mv_ids where k = 'series')), 0,
  'and its sessions go with it');

select pg_temp.impersonate('cf000000-0000-0000-0000-000000000006');
select throws_ok(
  $$ select public.delete_series(gen_random_uuid()) $$,
  'halaqah not found', 'an unknown halaqah is reported, not ignored');
select pg_temp.reset_role();

select ok(not has_function_privilege('anon', 'public.move_branch(uuid, uuid)', 'execute'),
  'anon cannot move branches');

select * from finish();
rollback;
