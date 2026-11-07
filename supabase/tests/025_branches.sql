-- ============================================================================
-- Logic + grants test suite: 0042 (branches, stewards, circles joining, D79)
-- ----------------------------------------------------------------------------
-- Pins the tree's authority (a steward runs their branch and everything under
-- it, nothing beside or above), the approval a circle needs to join, what a
-- member's reach is, and that a steward learns a circle's name and size and
-- nothing about its people.
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

-- People: O organiser · S steward of Melbourne · A admin of the south-east
-- circle · B a member of it · N admin of the north circle · Q admin of the
-- Queensland circle · X in no circle.
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('cc000000-0000-0000-0000-00000000000f', 'o@br.test', '{"name":"O"}', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-000000000005', 's@br.test', '{"name":"S"}', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-00000000000a', 'a@br.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-00000000000b', 'b@br.test', '{"name":"B"}', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-00000000000d', 'n@br.test', '{"name":"N"}', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-00000000000c', 'q@br.test', '{"name":"Q"}', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-00000000000e', 'x@br.test', '{"name":"X"}', 'authenticated', 'authenticated');

update public.profiles set is_super_admin = true
 where id = 'cc000000-0000-0000-0000-00000000000f';

-- Tree: YN → VIC → MEL → {SE, NORTH};  YN → QLD
insert into public.branches (id, parent_id, name) values
  ('cc000000-0000-0000-0000-000000000100', null, 'Youth Nexus'),
  ('cc000000-0000-0000-0000-000000000101', 'cc000000-0000-0000-0000-000000000100', 'Victoria'),
  ('cc000000-0000-0000-0000-000000000102', 'cc000000-0000-0000-0000-000000000101', 'Melbourne'),
  ('cc000000-0000-0000-0000-000000000103', 'cc000000-0000-0000-0000-000000000102', 'South East'),
  ('cc000000-0000-0000-0000-000000000104', 'cc000000-0000-0000-0000-000000000102', 'North'),
  ('cc000000-0000-0000-0000-000000000105', 'cc000000-0000-0000-0000-000000000100', 'Queensland');

insert into public.branch_stewards (branch_id, user_id) values
  ('cc000000-0000-0000-0000-000000000102', 'cc000000-0000-0000-0000-000000000005');

insert into public.groups (id, name, created_by) values
  ('cc000000-0000-0000-0000-000000000200', 'SE circle', 'cc000000-0000-0000-0000-00000000000a'),
  ('cc000000-0000-0000-0000-000000000201', 'North circle', 'cc000000-0000-0000-0000-00000000000d'),
  ('cc000000-0000-0000-0000-000000000202', 'QLD circle', 'cc000000-0000-0000-0000-00000000000c'),
  ('cc000000-0000-0000-0000-000000000203', 'S own circle', 'cc000000-0000-0000-0000-000000000005');
insert into public.memberships (user_id, group_id, role) values
  ('cc000000-0000-0000-0000-00000000000a', 'cc000000-0000-0000-0000-000000000200', 'owner'),
  ('cc000000-0000-0000-0000-00000000000b', 'cc000000-0000-0000-0000-000000000200', 'member'),
  ('cc000000-0000-0000-0000-00000000000d', 'cc000000-0000-0000-0000-000000000201', 'owner'),
  ('cc000000-0000-0000-0000-00000000000c', 'cc000000-0000-0000-0000-000000000202', 'owner'),
  ('cc000000-0000-0000-0000-000000000005', 'cc000000-0000-0000-0000-000000000203', 'owner');

-- ---- creating branches -----------------------------------------------------
select pg_temp.impersonate('cc000000-0000-0000-0000-000000000005');

select throws_ok(
  $$ select public.create_branch(null, 'My own org') $$,
  'only an organiser can start a new top-level branch',
  'a steward cannot start a new tree');
select throws_ok(
  $$ select public.create_branch('cc000000-0000-0000-0000-000000000101', 'Geelong') $$,
  'you do not run that branch',
  'a steward cannot add a branch beside their own (under Victoria)');
select throws_ok(
  $$ select public.create_branch('cc000000-0000-0000-0000-000000000105', 'Gold Coast') $$,
  'you do not run that branch',
  'nor anywhere in another state');
select lives_ok(
  $$ select public.create_branch('cc000000-0000-0000-0000-000000000102', 'West') $$,
  'a steward can add a branch inside their own');
select lives_ok(
  $$ select public.create_branch('cc000000-0000-0000-0000-000000000103', 'Dandenong') $$,
  'and inside any branch below it');
select throws_ok(
  $$ select public.create_branch('cc000000-0000-0000-0000-000000000102', ' west ') $$,
  'there is already a branch with that name there',
  'two siblings cannot share a name, whatever the case or spacing');
select throws_ok(
  $$ select public.create_branch('cc000000-0000-0000-0000-000000000102', '   ') $$,
  'a branch name is 1 to 80 characters',
  'a blank name is refused');

select throws_ok(
  $$ insert into public.branches (name) values ('Direct') $$,
  '42501', null,
  'nobody writes the table directly');

select pg_temp.reset_role();
select pg_temp.impersonate('cc000000-0000-0000-0000-00000000000f');
select lives_ok(
  $$ select public.create_branch(null, 'Another org') $$,
  'an organiser can start a new tree');
select pg_temp.reset_role();

-- ---- stewards --------------------------------------------------------------
select pg_temp.impersonate('cc000000-0000-0000-0000-000000000005');
select is(
  (select name from public.appoint_steward('cc000000-0000-0000-0000-000000000103', 'N@BR.test ')),
  'N',
  'a steward can appoint a steward below them, by exact email in any case');
select throws_ok(
  $$ select public.appoint_steward('cc000000-0000-0000-0000-000000000103', 'n@br.test') $$,
  'that person already runs this branch',
  'appointing twice says so');
select throws_ok(
  $$ select public.appoint_steward('cc000000-0000-0000-0000-000000000105', 'b@br.test') $$,
  'you do not run that branch',
  'but not in a branch they do not run');
select throws_ok(
  $$ select public.appoint_steward('cc000000-0000-0000-0000-000000000103', 'nobody@br.test') $$,
  'no account with that email address',
  'an unknown address is refused');
select is(
  (select count(*) from public.list_branch_stewards('cc000000-0000-0000-0000-000000000103')),
  1::bigint,
  'a steward reads who runs a branch below them');
select pg_temp.reset_role();

select pg_temp.impersonate('cc000000-0000-0000-0000-00000000000b');
select is(
  (select count(*) from public.list_branch_stewards('cc000000-0000-0000-0000-000000000103')),
  0::bigint,
  'a member reads nothing about who runs a branch');
select is(
  (select count(*) from public.branch_stewards),
  0::bigint,
  'nor through the table');
select is(
  (select count(*) from public.branches where name in ('Youth Nexus', 'Melbourne')),
  2::bigint,
  'branch names are readable to anyone signed in, for the picker');
select ok(
  (select count(*) from public.branch_directory()) >= 8,
  'the directory lists every branch');
select is(
  (select label from public.branch_directory() where id = 'cc000000-0000-0000-0000-000000000103'),
  'Youth Nexus › Victoria › Melbourne › South East',
  'with its full path as the label');
select pg_temp.reset_role();

-- ---- a circle asks to join -------------------------------------------------
select pg_temp.impersonate('cc000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.request_branch('cc000000-0000-0000-0000-000000000200', 'cc000000-0000-0000-0000-000000000103') $$,
  'only the circle''s owner or an admin can do this',
  'a plain member cannot ask for the circle');
select pg_temp.reset_role();

select pg_temp.impersonate('cc000000-0000-0000-0000-00000000000a');
select is(
  public.request_branch('cc000000-0000-0000-0000-000000000200', 'cc000000-0000-0000-0000-000000000103'),
  'requested',
  'the circle''s admin asks to join South East');
select is(
  (select branch_id from public.groups where id = 'cc000000-0000-0000-0000-000000000200'),
  null::uuid,
  'and is not in it until a steward says yes');
select is(
  (select count(*) from public.branch_requests where group_id = 'cc000000-0000-0000-0000-000000000200'),
  1::bigint,
  'the admin can see their own open request');
select throws_ok(
  $$ update public.groups set branch_id = 'cc000000-0000-0000-0000-000000000103'
      where id = 'cc000000-0000-0000-0000-000000000200' $$,
  '42501', null,
  'the circle''s admin cannot write branch_id directly');
select throws_ok(
  $$ select public.decide_branch_request('cc000000-0000-0000-0000-000000000200', true) $$,
  'you do not run that branch',
  'nor approve their own request');
select pg_temp.reset_role();

select pg_temp.impersonate('cc000000-0000-0000-0000-00000000000c');
select throws_ok(
  $$ select public.decide_branch_request('cc000000-0000-0000-0000-000000000200', true) $$,
  'you do not run that branch',
  'someone with no role in that branch cannot approve it');
select is(
  (select count(*) from public.branch_requests),
  0::bigint,
  'or even see it');
select pg_temp.reset_role();

select pg_temp.impersonate('cc000000-0000-0000-0000-000000000005');
select is(
  (select count(*) from public.branch_circles('cc000000-0000-0000-0000-000000000103') where pending),
  1::bigint,
  'the Melbourne steward sees the request to join South East, a branch below them');
select is(
  (select members from public.branch_circles('cc000000-0000-0000-0000-000000000103')
    where group_id = 'cc000000-0000-0000-0000-000000000200'),
  2,
  'with the circle''s size');
select is(
  (select count(*) from public.memberships where group_id = 'cc000000-0000-0000-0000-000000000200'),
  0::bigint,
  'and still nothing about who is in it (D27)');
select lives_ok(
  $$ select public.decide_branch_request('cc000000-0000-0000-0000-000000000200', true) $$,
  'they approve it');
select is(
  (select pending from public.my_steward_tree() where id = 'cc000000-0000-0000-0000-000000000103'),
  0,
  'the tree shows nothing pending');
select is(
  (select circles from public.my_steward_tree() where id = 'cc000000-0000-0000-0000-000000000103'),
  1,
  'and one circle in South East');
select ok(
  not exists (select 1 from public.my_steward_tree() where id = 'cc000000-0000-0000-0000-000000000105'),
  'Queensland is not in the Melbourne steward''s tree');
select is(
  public.request_branch('cc000000-0000-0000-0000-000000000203', 'cc000000-0000-0000-0000-000000000104'),
  'joined',
  'a steward putting their own circle in a branch they run needs no approval');
select pg_temp.reset_role();

-- ---- reach -----------------------------------------------------------------
select pg_temp.impersonate('cc000000-0000-0000-0000-00000000000b');
select set_eq(
  $$ select private.my_reach() $$,
  $$ values ('cc000000-0000-0000-0000-000000000103'::uuid),
            ('cc000000-0000-0000-0000-000000000102'::uuid),
            ('cc000000-0000-0000-0000-000000000101'::uuid),
            ('cc000000-0000-0000-0000-000000000100'::uuid) $$,
  'a member of a South East circle reaches South East and everything above it, and nothing beside');
select pg_temp.reset_role();

select pg_temp.impersonate('cc000000-0000-0000-0000-00000000000e');
select is(
  (select count(*) from private.my_reach()),
  0::bigint,
  'someone in no circle reaches nothing');
select pg_temp.reset_role();

select pg_temp.impersonate('cc000000-0000-0000-0000-00000000000c');
select is(
  (select count(*) from private.my_reach()),
  0::bigint,
  'a circle in no branch reaches nothing');
select pg_temp.reset_role();

-- ---- deleting --------------------------------------------------------------
select pg_temp.impersonate('cc000000-0000-0000-0000-000000000005');
select throws_ok(
  $$ select public.delete_branch('cc000000-0000-0000-0000-000000000102') $$,
  'only someone who runs the branch above can delete this one',
  'a steward cannot delete the branch they were given');
select throws_ok(
  $$ select public.delete_branch('cc000000-0000-0000-0000-000000000103') $$,
  'delete or move the branches inside it first',
  'a branch with branches inside is refused, by name');
select lives_ok(
  $$ select public.delete_branch((select id from public.branches where name = 'Dandenong')) $$,
  'an empty branch below them can go');
select throws_ok(
  $$ select public.delete_branch('cc000000-0000-0000-0000-000000000104') $$,
  'circles are still in this branch',
  'a branch holding circles is refused, by name');

-- ---- leaving ---------------------------------------------------------------
select lives_ok(
  $$ select public.leave_branch('cc000000-0000-0000-0000-000000000203') $$,
  'a steward can take a circle out of a branch they run');
select pg_temp.reset_role();

select pg_temp.impersonate('cc000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.leave_branch('cc000000-0000-0000-0000-000000000200') $$,
  'only the circle''s admins or the branch''s stewards can do this',
  'a plain member cannot take their circle out');
select pg_temp.reset_role();

select pg_temp.impersonate('cc000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select public.leave_branch('cc000000-0000-0000-0000-000000000200') $$,
  'the circle''s admin can');
select is(
  (select branch_id from public.groups where id = 'cc000000-0000-0000-0000-000000000200'),
  null::uuid,
  'and it is out');
select pg_temp.reset_role();

-- ---- stepping down ---------------------------------------------------------
select pg_temp.impersonate('cc000000-0000-0000-0000-00000000000d');
select lives_ok(
  $$ select public.remove_steward('cc000000-0000-0000-0000-000000000103', 'cc000000-0000-0000-0000-00000000000d') $$,
  'a steward can stand themselves down');
select ok(
  not private.is_steward_of('cc000000-0000-0000-0000-000000000103'),
  'and no longer runs it');
select pg_temp.reset_role();

-- ---- grants ----------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.create_branch(uuid, text)', 'execute'),
  'anon cannot create a branch');
select ok(not has_function_privilege('anon', 'public.branch_directory()', 'execute'),
  'anon cannot list branches');
select ok(not has_table_privilege('authenticated', 'public.branches', 'insert'),
  'the client has no insert on branches');
select ok(not has_column_privilege('authenticated', 'public.groups', 'branch_id', 'update'),
  'the client cannot update groups.branch_id');

select * from finish();
rollback;
