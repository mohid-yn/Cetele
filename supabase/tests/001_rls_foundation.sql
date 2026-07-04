-- ============================================================================
-- RLS + grants test suite — foundation (profiles / groups / memberships / RPCs)
-- ----------------------------------------------------------------------------
-- The B3 "tests from day one" debt, paid. Run with `supabase test db`
-- (pgTAP; the whole file is one rolled-back transaction — nothing persists).
--
-- Covers the invariants the reviews fought for:
--   * group-scoped visibility (outsider sees nothing)
--   * owner-safety (a co-admin can never demote/remove/seize the owner)
--   * is_super_admin is not client-writable (UPDATE guard + INSERT column lock)
--   * groups.created_by column lock (0004 owner-orphan fix)
--   * explicit grant posture (0006 — anon nothing; groups insert RPC-only)
--   * create_group / transfer_ownership RPC behaviour
-- Fixture users are distinct from seed.sql; every scenario re-impersonates.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture (as postgres): 4 users, 1 group. o=owner a=co-admin m=member x=outsider
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('f0000000-0000-0000-0000-000000000001', 'o@rls.test', '{"name":"O"}', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000002', 'a@rls.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000003', 'm@rls.test', '{"name":"M"}', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000004', 'x@rls.test', '{"name":"X"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('f0000000-0000-0000-0000-0000000000b1', 'RLS Test Circle',
   'f0000000-0000-0000-0000-000000000001');

insert into public.memberships (user_id, group_id, role) values
  ('f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-0000000000b1', 'owner'),
  ('f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-0000000000b1', 'admin'),
  ('f0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-0000000000b1', 'member');

-- Impersonation helper: postgres-owned, sets claims + switches role.
create function pg_temp.impersonate(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ----------------------------------------------------------------------------
-- Grant posture (0006) — environment parity assertions
-- ----------------------------------------------------------------------------
select ok(has_table_privilege('authenticated','public.profiles','select'), 'authenticated may select profiles');
select ok(not has_table_privilege('authenticated','public.groups','insert'), 'groups INSERT is RPC-only (no table grant)');
select ok(not has_column_privilege('authenticated','public.profiles','is_super_admin','update'), 'is_super_admin not updatable');
select ok(not has_column_privilege('authenticated','public.profiles','is_super_admin','insert'), 'is_super_admin not insertable');
select ok(not has_column_privilege('authenticated','public.groups','created_by','update'), 'owner pointer not updatable');
select ok(not has_column_privilege('authenticated','public.memberships','user_id','update'), 'membership identity immutable');
select ok(not has_table_privilege('anon','public.profiles','select'), 'anon has no profiles read');
select ok(not has_table_privilege('anon','public.groups','select'), 'anon has no groups read');
select ok(not has_table_privilege('anon','public.memberships','select'), 'anon has no memberships read');

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('f0000000-0000-0000-0000-000000000003'); -- m
select is(
  (select count(*) from public.profiles where id::text like 'f0000000-%'),
  3::bigint, 'member sees self + group peers, not the outsider');

reset role;
select pg_temp.impersonate('f0000000-0000-0000-0000-000000000004'); -- x
select is(
  (select count(*) from public.profiles where id::text like 'f0000000-%'),
  1::bigint, 'outsider sees only their own profile');

reset role;
select pg_temp.impersonate('f0000000-0000-0000-0000-000000000003'); -- m
select lives_ok(
  $$update public.profiles set name = 'M renamed'
    where id = 'f0000000-0000-0000-0000-000000000003'$$,
  'member can rename self');
select throws_matching(
  $$update public.profiles set is_super_admin = true
    where id = 'f0000000-0000-0000-0000-000000000003'$$,
  'permission denied',
  'is_super_admin self-escalation blocked (column privilege)');
select throws_ok(
  $$insert into public.profiles (id, name, avatar_url, is_super_admin)
    values ('f0000000-0000-0000-0000-000000000003', 'evil', null, true)$$,
  '42501', null,
  'is_super_admin not settable at INSERT either');

-- silent no-op: member "updates" a peer → RLS filters to 0 rows
update public.profiles set name = 'hacked'
  where id = 'f0000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select name from public.profiles where id = 'f0000000-0000-0000-0000-000000000001'),
  'O', 'member cannot rename a peer (0 rows)');

-- ----------------------------------------------------------------------------
-- groups
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('f0000000-0000-0000-0000-000000000002'); -- a
select is(
  (select count(*) from public.groups where id = 'f0000000-0000-0000-0000-0000000000b1'),
  1::bigint, 'co-admin sees the group');
select lives_ok(
  $$update public.groups set name = 'Renamed Circle'
    where id = 'f0000000-0000-0000-0000-0000000000b1'$$,
  'co-admin can rename the group');
select throws_matching(
  $$update public.groups set created_by = null
    where id = 'f0000000-0000-0000-0000-0000000000b1'$$,
  'permission denied',
  'co-admin cannot null the owner pointer (0004 orphan fix)');
select throws_matching(
  $$update public.groups set created_by = 'f0000000-0000-0000-0000-000000000002'
    where id = 'f0000000-0000-0000-0000-0000000000b1'$$,
  'permission denied',
  'co-admin cannot seize the owner pointer');
select throws_ok(
  $$insert into public.groups (name)
    values ('rogue')$$,
  '42501', null,
  'direct group INSERT denied — create_group RPC only');

-- co-admin delete: RLS filters to 0 rows
delete from public.groups where id = 'f0000000-0000-0000-0000-0000000000b1';
reset role;
select is(
  (select count(*) from public.groups where id = 'f0000000-0000-0000-0000-0000000000b1'),
  1::bigint, 'co-admin cannot delete the group');

select pg_temp.impersonate('f0000000-0000-0000-0000-000000000004'); -- x
select is(
  (select count(*) from public.groups where id = 'f0000000-0000-0000-0000-0000000000b1'),
  0::bigint, 'outsider sees no group');
reset role;

-- owner CAN delete — inside a savepoint so the fixture survives
savepoint owner_delete;
select pg_temp.impersonate('f0000000-0000-0000-0000-000000000001'); -- o
delete from public.groups where id = 'f0000000-0000-0000-0000-0000000000b1';
reset role;
select is(
  (select count(*) from public.groups where id = 'f0000000-0000-0000-0000-0000000000b1'),
  0::bigint, 'owner can delete the group');
rollback to savepoint owner_delete;

-- ----------------------------------------------------------------------------
-- memberships — owner-safety
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('f0000000-0000-0000-0000-000000000004'); -- x
select is(
  (select count(*) from public.memberships where group_id = 'f0000000-0000-0000-0000-0000000000b1'),
  0::bigint, 'outsider sees no memberships');
reset role;

select pg_temp.impersonate('f0000000-0000-0000-0000-000000000002'); -- a
select is(
  (select count(*) from public.memberships where group_id = 'f0000000-0000-0000-0000-0000000000b1'),
  3::bigint, 'co-admin sees all membership rows');

-- demote the owner: silently 0 rows
update public.memberships set role = 'member'
  where group_id = 'f0000000-0000-0000-0000-0000000000b1'
    and user_id = 'f0000000-0000-0000-0000-000000000001';
-- remove the owner: silently 0 rows
delete from public.memberships
  where group_id = 'f0000000-0000-0000-0000-0000000000b1'
    and user_id = 'f0000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select role from public.memberships
    where group_id = 'f0000000-0000-0000-0000-0000000000b1'
      and user_id = 'f0000000-0000-0000-0000-000000000001'),
  'owner', 'co-admin can neither demote nor remove the owner');

select pg_temp.impersonate('f0000000-0000-0000-0000-000000000002'); -- a
select throws_ok(
  $$insert into public.memberships (user_id, group_id, role)
    values ('f0000000-0000-0000-0000-000000000004',
            'f0000000-0000-0000-0000-0000000000b1', 'owner')$$,
  '42501', null,
  'co-admin cannot insert a second owner row');
select lives_ok(
  $$update public.memberships set role = 'admin'
    where group_id = 'f0000000-0000-0000-0000-0000000000b1'
      and user_id = 'f0000000-0000-0000-0000-000000000003'$$,
  'co-admin can promote a member to co-admin');
reset role;
update public.memberships set role = 'member' -- revert promotion
  where group_id = 'f0000000-0000-0000-0000-0000000000b1'
    and user_id = 'f0000000-0000-0000-0000-000000000003';

-- member leaves (own row) — savepoint to keep fixture
savepoint member_leave;
select pg_temp.impersonate('f0000000-0000-0000-0000-000000000003'); -- m
delete from public.memberships
  where group_id = 'f0000000-0000-0000-0000-0000000000b1'
    and user_id = 'f0000000-0000-0000-0000-000000000003';
reset role;
select is(
  (select count(*) from public.memberships where group_id = 'f0000000-0000-0000-0000-0000000000b1'),
  2::bigint, 'member can leave (delete own row)');
rollback to savepoint member_leave;

-- member touching someone else's row: silently 0 rows
select pg_temp.impersonate('f0000000-0000-0000-0000-000000000003'); -- m
delete from public.memberships
  where group_id = 'f0000000-0000-0000-0000-0000000000b1'
    and user_id = 'f0000000-0000-0000-0000-000000000002';
reset role;
select is(
  (select count(*) from public.memberships where group_id = 'f0000000-0000-0000-0000-0000000000b1'),
  3::bigint, 'plain member cannot remove a peer');

-- ----------------------------------------------------------------------------
-- RPCs: create_group / transfer_ownership
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('f0000000-0000-0000-0000-000000000004'); -- x
select lives_ok(
  $$select public.create_group('X Circle')$$,
  'any authenticated user can create a group');
reset role;
select is(
  (select m.role from public.memberships m
     join public.groups g on g.id = m.group_id
    where g.name = 'X Circle'
      and m.user_id = 'f0000000-0000-0000-0000-000000000004'),
  'owner', 'create_group bootstraps creator as owner');
-- (create_group no longer mints a group-level invite code — joining is via the
--  invites table, 0007/D35; covered in 002_rls_tasks_invites_join.sql)

select pg_temp.impersonate('f0000000-0000-0000-0000-000000000002'); -- a (not owner)
select throws_matching(
  $$select public.transfer_ownership(
      'f0000000-0000-0000-0000-0000000000b1',
      'f0000000-0000-0000-0000-000000000002')$$,
  'only the current owner',
  'non-owner cannot transfer ownership');
reset role;

select pg_temp.impersonate('f0000000-0000-0000-0000-000000000001'); -- o
select throws_matching(
  $$select public.transfer_ownership(
      'f0000000-0000-0000-0000-0000000000b1',
      'f0000000-0000-0000-0000-000000000004')$$,
  'must already be a member',
  'cannot transfer to a non-member');
reset role;

savepoint transfer;
select pg_temp.impersonate('f0000000-0000-0000-0000-000000000001'); -- o
select lives_ok(
  $$select public.transfer_ownership(
      'f0000000-0000-0000-0000-0000000000b1',
      'f0000000-0000-0000-0000-000000000003')$$,
  'owner can transfer to a member');
reset role;
select is(
  (select created_by from public.groups where id = 'f0000000-0000-0000-0000-0000000000b1'),
  'f0000000-0000-0000-0000-000000000003'::uuid,
  'transfer moves the owner pointer');
select is(
  (select role from public.memberships
    where group_id = 'f0000000-0000-0000-0000-0000000000b1'
      and user_id = 'f0000000-0000-0000-0000-000000000001'),
  'admin', 'old owner demoted to co-admin');
rollback to savepoint transfer;

-- ----------------------------------------------------------------------------
-- anon: nothing
-- ----------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$select count(*) from public.profiles$$, '42501', null,
  'anon cannot read profiles at all');
reset role;

select * from finish();
rollback;
