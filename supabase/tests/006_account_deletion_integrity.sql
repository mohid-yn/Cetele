-- ============================================================================
-- RLS + logic test suite — CET-27 (account-deletion integrity, 0012)
-- ----------------------------------------------------------------------------
-- Run with `supabase test db` (pgTAP; one rolled-back transaction).
--
-- Covers the two defects a real account deletion exposed:
--   * ghost groups — deleting the LAST member's account takes the group with
--     it; deleting a member's account when others remain does NOT (that is
--     D27's succession case, not junk)
--   * deleting a group in-app still works (the trigger must not recurse into
--     the cascade that fires it)
--   * stale session — a JWT whose account is gone gets PT401 (→ HTTP 401 the
--     app can treat as "signed out"), not a raw FK violation
--   * exposure posture: neither new private function is client-callable
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture:
--   solo  = sole member (owner) of g_solo   → deleting them must remove g_solo
--   own2  = owner of g_pair, with mem2 alongside → deleting own2 must KEEP
--           g_pair (ownerless-but-populated = D27 succession)
--   live  = owner of g_live, used for the in-app group-delete path
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('c7000000-0000-0000-0000-000000000001', 'solo@c27.test', '{"name":"Solo"}', 'authenticated', 'authenticated'),
  ('c7000000-0000-0000-0000-000000000002', 'own2@c27.test', '{"name":"Own2"}', 'authenticated', 'authenticated'),
  ('c7000000-0000-0000-0000-000000000003', 'mem2@c27.test', '{"name":"Mem2"}', 'authenticated', 'authenticated'),
  ('c7000000-0000-0000-0000-000000000004', 'live@c27.test', '{"name":"Live"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('c7000000-0000-0000-0000-0000000000a1', 'Solo Circle', 'c7000000-0000-0000-0000-000000000001'),
  ('c7000000-0000-0000-0000-0000000000a2', 'Pair Circle', 'c7000000-0000-0000-0000-000000000002'),
  ('c7000000-0000-0000-0000-0000000000a3', 'Live Circle', 'c7000000-0000-0000-0000-000000000004');

insert into public.memberships (user_id, group_id, role) values
  ('c7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-0000000000a1', 'owner'),
  ('c7000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-0000000000a2', 'owner'),
  ('c7000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-0000000000a2', 'admin'),
  ('c7000000-0000-0000-0000-000000000004', 'c7000000-0000-0000-0000-0000000000a3', 'owner');

insert into public.tasks (id, group_id, label, target_count) values
  ('c7000000-0000-0000-0000-0000000000b1', 'c7000000-0000-0000-0000-0000000000a1', 'Salawat', 10);

-- An open invite the deleted-account session can try to accept.
insert into public.invites (group_id, code, role) values
  ('c7000000-0000-0000-0000-0000000000a2', 'C27OPEN1', 'member');

create function pg_temp.impersonate(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Returns the SQLSTATE a statement raises (null if it succeeds). The app keys
-- its "signed out" handling off the code, not the message, so assert the code.
create function pg_temp.errcode_of(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return null;
exception when others then
  return sqlstate;
end $$;

-- ----------------------------------------------------------------------------
-- Exposure posture (0003 rule: private helpers stay off /rest/v1/rpc)
-- ----------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated','private.require_caller_profile()','execute'),
  'require_caller_profile is not client-callable');
select ok(not has_function_privilege('anon','private.require_caller_profile()','execute'),
  'anon cannot call require_caller_profile');
select ok(not has_function_privilege('authenticated','private.delete_group_when_last_member_leaves()','execute'),
  'the last-member trigger fn is not client-callable');

-- ----------------------------------------------------------------------------
-- Ghost groups: the last member's account going away takes the group with it
-- ----------------------------------------------------------------------------
delete from auth.users where id = 'c7000000-0000-0000-0000-000000000001';

select is((select count(*) from public.groups where id='c7000000-0000-0000-0000-0000000000a1'),
  0::bigint, 'deleting the sole member''s account deletes the group (no ghost)');
select is((select count(*) from public.tasks where group_id='c7000000-0000-0000-0000-0000000000a1'),
  0::bigint, 'the ghost group''s tasks go with it');

-- ...but a group that still has members survives its owner's deletion: that is
-- an ownerless circle a co-admin can claim (D27), not junk.
delete from auth.users where id = 'c7000000-0000-0000-0000-000000000002';

select is((select count(*) from public.groups where id='c7000000-0000-0000-0000-0000000000a2'),
  1::bigint, 'a group with members left survives its owner''s account deletion');
select is((select created_by from public.groups where id='c7000000-0000-0000-0000-0000000000a2'),
  null, 'the owner pointer is nulled (ON DELETE SET NULL → D27 succession)');
select is((select count(*) from public.memberships where group_id='c7000000-0000-0000-0000-0000000000a2'),
  1::bigint, 'the remaining co-admin keeps their membership');

-- ----------------------------------------------------------------------------
-- Deleting a group in-app still works — the trigger fires inside the cascade
-- that the group delete itself causes, so it must not try to re-delete it.
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('c7000000-0000-0000-0000-000000000004');
select lives_ok(
  $$delete from public.groups where id='c7000000-0000-0000-0000-0000000000a3'$$,
  'an owner can still delete their group (no trigger recursion)');
reset role;
select is((select count(*) from public.groups where id='c7000000-0000-0000-0000-0000000000a3'),
  0::bigint, 'the deleted group is gone');

-- ----------------------------------------------------------------------------
-- Stale session: a JWT that outlived its account. Supabase verifies the token's
-- signature, not the DB, so this arrives looking perfectly authenticated.
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('c7000000-0000-0000-0000-000000000001'); -- deleted above
select is(pg_temp.errcode_of($$select public.create_group('Ghost')$$),
  'PT401', 'create_group on a deleted account → PT401, not an FK violation (23503)');
select is(pg_temp.errcode_of($$select public.accept_invite('C27OPEN1')$$),
  'PT401', 'accept_invite on a deleted account → PT401, not an FK violation');
reset role;

select is((select count(*) from public.groups where name='Ghost'),
  0::bigint, 'the deleted account created no group');

-- The guard must not break the normal path.
select pg_temp.impersonate('c7000000-0000-0000-0000-000000000003');
select lives_ok(
  $$select public.create_group('Real Circle')$$,
  'a live account still creates groups');
reset role;
select is((select count(*) from public.groups where name='Real Circle'),
  1::bigint, 'the group exists');

-- ----------------------------------------------------------------------------
-- Leaving a circle (CET-27 follow-up). Authority is memberships_delete_self
-- (0001): your own row, and only if you are not the owner. RLS *filters* rather
-- than errors, so an owner's leave matches zero rows — that IS the refusal, and
-- it is what stops anyone walking out of a circle and stranding it (which the
-- 0012 trigger would then silently delete).
-- ----------------------------------------------------------------------------
-- mem2 is a co-admin of g_pair (its owner's account was deleted above, so the
-- circle is ownerless-but-populated — they can still leave).
select pg_temp.impersonate('c7000000-0000-0000-0000-000000000003');
select lives_ok(
  $$delete from public.memberships
     where group_id='c7000000-0000-0000-0000-0000000000a2'
       and user_id='c7000000-0000-0000-0000-000000000003'$$,
  'a co-admin can leave a circle');
reset role;
select is((select count(*) from public.memberships where group_id='c7000000-0000-0000-0000-0000000000a2'),
  0::bigint, 'their membership is gone');
select is((select count(*) from public.groups where id='c7000000-0000-0000-0000-0000000000a2'),
  0::bigint, 'the last member leaving takes the empty circle with them (0012 trigger)');

-- An owner cannot leave: the delete matches no row, so the membership survives
-- and the circle is never stranded.
insert into public.groups (id, name, created_by) values
  ('c7000000-0000-0000-0000-0000000000a4', 'Owned Circle', 'c7000000-0000-0000-0000-000000000003');
insert into public.memberships (user_id, group_id, role) values
  ('c7000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-0000000000a4', 'owner');

select pg_temp.impersonate('c7000000-0000-0000-0000-000000000003');
select lives_ok(
  $$delete from public.memberships
     where group_id='c7000000-0000-0000-0000-0000000000a4'
       and user_id='c7000000-0000-0000-0000-000000000003'$$,
  'an owner''s leave is filtered by RLS, not an error');
reset role;
select is((select role from public.memberships where group_id='c7000000-0000-0000-0000-0000000000a4'),
  'owner', 'the owner is still in their circle (leave refused → transfer or delete first)');
select is((select count(*) from public.groups where id='c7000000-0000-0000-0000-0000000000a4'),
  1::bigint, 'the circle survives — an owner can never strand it by leaving');

select * from finish();
rollback;
