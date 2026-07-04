-- ============================================================================
-- RLS + grants test suite — M2 (tasks / invites / the join model, 0007)
-- ----------------------------------------------------------------------------
-- Run with `supabase test db` (pgTAP; one rolled-back transaction).
--
-- Covers the M2 invariants:
--   * tasks: member-read / admin-write; a task can never move between groups
--   * invites: admin-only surface; code is DB-minted, never client-chosen
--   * join model (D34/D35): membership INSERT is RPC-only; accept_invite
--     enforces the email lock; open invites are reusable, locked single-use
--   * groups.invite_code is gone (one code namespace)
-- Fixture users are distinct from seed.sql; every scenario re-impersonates.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture (as postgres): o=owner a=co-admin m=member x=outsider y=locked-invitee
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('e0000000-0000-0000-0000-000000000001', 'o@m2.test', '{"name":"O"}', 'authenticated', 'authenticated'),
  ('e0000000-0000-0000-0000-000000000002', 'a@m2.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('e0000000-0000-0000-0000-000000000003', 'm@m2.test', '{"name":"M"}', 'authenticated', 'authenticated'),
  ('e0000000-0000-0000-0000-000000000004', 'x@m2.test', '{"name":"X"}', 'authenticated', 'authenticated'),
  ('e0000000-0000-0000-0000-000000000005', 'y@m2.test', '{"name":"Y"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('e0000000-0000-0000-0000-0000000000b1', 'M2 Circle',
   'e0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-0000000000b2', 'Other Circle',
   'e0000000-0000-0000-0000-000000000001');

insert into public.memberships (user_id, group_id, role) values
  ('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-0000000000b1', 'owner'),
  ('e0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-0000000000b1', 'admin'),
  ('e0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-0000000000b1', 'member'),
  ('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-0000000000b2', 'owner');

insert into public.tasks (id, group_id, label, target_count, sort_order) values
  ('e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'Salawat', 100, 0);

-- Impersonation helper: postgres-owned, sets claims + switches role.
create function pg_temp.impersonate(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ----------------------------------------------------------------------------
-- Schema + grant posture (0007)
-- ----------------------------------------------------------------------------
select hasnt_column('public', 'groups', 'invite_code', 'groups.invite_code is dropped (D35 — one code namespace)');

select ok(not has_table_privilege('authenticated','public.memberships','insert'),
  'membership INSERT is RPC-only (D34 invite/accept)');
select ok(not has_column_privilege('authenticated','public.tasks','group_id','update'),
  'a task cannot be moved between groups');
select ok(not has_column_privilege('authenticated','public.tasks','id','insert'),
  'task ids are server-generated');
select ok(not has_column_privilege('authenticated','public.invites','code','insert'),
  'invite codes are DB-minted, never client-chosen');
select ok(not has_table_privilege('authenticated','public.invites','update'),
  'invites are never updated (revoke + re-create)');
select ok(not has_table_privilege('anon','public.tasks','select'), 'anon has no tasks read');
select ok(not has_table_privilege('anon','public.invites','select'), 'anon has no invites read');
select ok(not has_function_privilege('anon','public.lookup_invite(text)','execute'),
  'anon cannot call lookup_invite');
select ok(not has_function_privilege('anon','public.accept_invite(text)','execute'),
  'anon cannot call accept_invite');

-- ----------------------------------------------------------------------------
-- tasks — member-read / admin-write
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('e0000000-0000-0000-0000-000000000003'); -- m
select is(
  (select count(*) from public.tasks where group_id = 'e0000000-0000-0000-0000-0000000000b1'),
  1::bigint, 'member sees the group task list');
select throws_ok(
  $$insert into public.tasks (group_id, label, target_count)
    values ('e0000000-0000-0000-0000-0000000000b1', 'rogue', 10)$$,
  '42501', null,
  'member cannot add a task');
-- member update/delete: RLS filters to 0 rows
update public.tasks set target_count = 1
  where id = 'e0000000-0000-0000-0000-0000000000c1';
delete from public.tasks where id = 'e0000000-0000-0000-0000-0000000000c1';
reset role;
select is(
  (select target_count from public.tasks where id = 'e0000000-0000-0000-0000-0000000000c1'),
  100, 'member can neither edit nor delete a task');

select pg_temp.impersonate('e0000000-0000-0000-0000-000000000004'); -- x
select is(
  (select count(*) from public.tasks), 0::bigint, 'outsider sees no tasks');
reset role;

select pg_temp.impersonate('e0000000-0000-0000-0000-000000000002'); -- a
select lives_ok(
  $$insert into public.tasks (group_id, label, subtitle, target_count, sort_order)
    values ('e0000000-0000-0000-0000-0000000000b1', 'Istighfar', 'Astaghfirullah', 100, 1)$$,
  'co-admin can add a task');
select lives_ok(
  $$update public.tasks set target_count = 33
    where id = 'e0000000-0000-0000-0000-0000000000c1'$$,
  'co-admin can edit a task');
select throws_ok(
  $$insert into public.tasks (group_id, label, target_count)
    values ('e0000000-0000-0000-0000-0000000000b2', 'rogue', 10)$$,
  '42501', null,
  'co-admin of one group cannot write tasks into another');
reset role;

-- ----------------------------------------------------------------------------
-- invites — admin-only surface
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('e0000000-0000-0000-0000-000000000002'); -- a
select lives_ok(
  $$insert into public.invites (group_id, role)
    values ('e0000000-0000-0000-0000-0000000000b1', 'member')$$,
  'co-admin can create an open invite (re-share, D26)');
select matches(
  (select code from public.invites where group_id = 'e0000000-0000-0000-0000-0000000000b1' limit 1),
  '^[0-9A-F]{8}$', 'invite code is DB-minted, 8 hex chars');
reset role;

select pg_temp.impersonate('e0000000-0000-0000-0000-000000000003'); -- m
select is(
  (select count(*) from public.invites), 0::bigint, 'plain member sees no invites');
select throws_ok(
  $$insert into public.invites (group_id, role)
    values ('e0000000-0000-0000-0000-0000000000b1', 'member')$$,
  '42501', null,
  'plain member cannot create an invite');
reset role;

-- fixture invites for the join-flow tests (as postgres; codes fixed)
insert into public.invites (group_id, email, role, code) values
  ('e0000000-0000-0000-0000-0000000000b1', null,        'member', 'OPENCODE'),
  ('e0000000-0000-0000-0000-0000000000b1', 'y@m2.test', 'admin',  'LOCKEDY1');

-- ----------------------------------------------------------------------------
-- lookup_invite
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('e0000000-0000-0000-0000-000000000004'); -- x (outsider)
select is(
  (select group_name from public.lookup_invite('OPENCODE')),
  'M2 Circle', 'lookup_invite shows the invitee the group name');
select is(
  (select email_matches from public.lookup_invite('LOCKEDY1')),
  false, 'lookup_invite flags an email lock that does not match the caller');
select is(
  (select count(*) from public.lookup_invite('NOSUCH00')),
  0::bigint, 'unknown code returns zero rows');
reset role;

-- ----------------------------------------------------------------------------
-- accept_invite — email lock rejections (D34). MUST run while x is still an
-- outsider: once x joins below, the already-member no-op short-circuits the
-- lock check and these paths would never be exercised.
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('e0000000-0000-0000-0000-000000000004'); -- x (wrong email)
select throws_matching(
  $$select public.accept_invite('LOCKEDY1')$$,
  'locked to a different email',
  'wrong verified email cannot use a locked invite');
select throws_matching(
  $$select public.accept_invite('NOSUCH00')$$,
  'invite not found',
  'unknown/revoked code is rejected');
reset role;

-- ----------------------------------------------------------------------------
-- accept_invite — open invites are reusable (D35)
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('e0000000-0000-0000-0000-000000000004'); -- x
select lives_ok(
  $$select public.accept_invite('OPENCODE')$$,
  'outsider joins via an open invite');
reset role;
select is(
  (select role from public.memberships
    where group_id = 'e0000000-0000-0000-0000-0000000000b1'
      and user_id = 'e0000000-0000-0000-0000-000000000004'),
  'member', 'accept created a member-role membership');
select is(
  (select count(*) from public.invites where code = 'OPENCODE'),
  1::bigint, 'open invite survives an accept (reusable until revoked)');

-- idempotent for an existing member, and never a sideways promotion
select pg_temp.impersonate('e0000000-0000-0000-0000-000000000003'); -- m
select lives_ok(
  $$select public.accept_invite('LOCKEDY1')$$,
  'accept is a no-op for an existing member');
reset role;
-- (m is not y@m2.test — but m is already a member, so the lock never bites;
--  the role must be untouched even though the invite says admin)
select is(
  (select role from public.memberships
    where group_id = 'e0000000-0000-0000-0000-0000000000b1'
      and user_id = 'e0000000-0000-0000-0000-000000000003'),
  'member', 'an admin-role invite never promotes an existing member');
select is(
  (select count(*) from public.invites where code = 'LOCKEDY1'),
  1::bigint, 'a no-op accept does not consume a locked invite');

-- ----------------------------------------------------------------------------
-- accept_invite — locked accept + single-use consumption (D35)
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('e0000000-0000-0000-0000-000000000005'); -- y (the locked email)
select lives_ok(
  $$select public.accept_invite('LOCKEDY1')$$,
  'the locked-to email accepts successfully');
reset role;
select is(
  (select role from public.memberships
    where group_id = 'e0000000-0000-0000-0000-0000000000b1'
      and user_id = 'e0000000-0000-0000-0000-000000000005'),
  'admin', 'locked invite carried its co-admin role');
select is(
  (select count(*) from public.invites where code = 'LOCKEDY1'),
  0::bigint, 'locked invite is consumed on accept (single-use)');

-- ----------------------------------------------------------------------------
-- revoke: admin deletes an invite → the code dies
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('e0000000-0000-0000-0000-000000000001'); -- o
select lives_ok(
  $$delete from public.invites where code = 'OPENCODE'$$,
  'owner can revoke an open invite');
reset role;
select pg_temp.impersonate('e0000000-0000-0000-0000-000000000005'); -- y (now a co-admin, but code is dead)
select throws_matching(
  $$select public.accept_invite('OPENCODE')$$,
  'invite not found',
  'a revoked code no longer joins anyone');
reset role;

select * from finish();
rollback;
