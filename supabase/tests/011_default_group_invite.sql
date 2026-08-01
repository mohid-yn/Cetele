-- ============================================================================
-- RLS + behaviour suite — 0022 (the default, regenerable, member-level invite)
-- ----------------------------------------------------------------------------
-- What this pins:
--   * exactly ONE open link per circle, enforced by the DB, not the UI
--   * every circle HAS one — including circles made through create_group
--   * the open link cannot be deleted (regenerate replaces revoke)
--   * regenerate is admin-only, kills the old code, and keeps the row unique
--   * `authenticated` still holds no UPDATE grant — the code only ever moves
--     through the SECURITY DEFINER RPC (002's invariant, restated here because
--     0022 is the first thing that ever needed to update an invite)
--   * admin-role invites are impossible
-- ============================================================================
begin;
select plan(19);

-- Fixture: o=owner a=co-admin m=member x=outsider
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('f2000000-0000-0000-0000-000000000001', 'o@inv.test', '{"name":"O"}', 'authenticated', 'authenticated'),
  ('f2000000-0000-0000-0000-000000000002', 'a@inv.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('f2000000-0000-0000-0000-000000000003', 'm@inv.test', '{"name":"M"}', 'authenticated', 'authenticated'),
  ('f2000000-0000-0000-0000-000000000004', 'x@inv.test', '{"name":"X"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('f2000000-0000-0000-0000-0000000000b1', 'Invite Circle',
   'f2000000-0000-0000-0000-000000000001');

insert into public.memberships (user_id, group_id, role) values
  ('f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-0000000000b1', 'owner'),
  ('f2000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-0000000000b1', 'admin'),
  ('f2000000-0000-0000-0000-000000000003', 'f2000000-0000-0000-0000-0000000000b1', 'member');

insert into public.invites (group_id, email, role, code) values
  ('f2000000-0000-0000-0000-0000000000b1', null, 'member', 'DEFAULT1');

create function pg_temp.impersonate(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ----------------------------------------------------------------------------
-- Schema posture
-- ----------------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'public.invites', 'update'),
  'authenticated still cannot UPDATE invites — regenerate goes through the RPC');
select has_index('public', 'invites', 'invites_one_default_per_group',
  'the one-open-link-per-circle index exists');
select ok(not has_function_privilege('anon', 'public.regenerate_invite(uuid)', 'execute'),
  'anon cannot regenerate an invite');

-- ----------------------------------------------------------------------------
-- Exactly one open link per circle
-- ----------------------------------------------------------------------------
select throws_ok(
  $$insert into public.invites (group_id, email)
    values ('f2000000-0000-0000-0000-0000000000b1', null)$$,
  '23505', null,
  'a SECOND open link is refused by the database');

-- Locked invites are deliberately unconstrained in number.
select lives_ok(
  $$insert into public.invites (group_id, email) values
      ('f2000000-0000-0000-0000-0000000000b1', 'p@inv.test'),
      ('f2000000-0000-0000-0000-0000000000b1', 'q@inv.test')$$,
  'several email-locked invites can coexist with the open link');

-- ----------------------------------------------------------------------------
-- Admin invites are impossible
-- ----------------------------------------------------------------------------
select throws_ok(
  $$insert into public.invites (group_id, email, role)
    values ('f2000000-0000-0000-0000-0000000000b1', 'r@inv.test', 'admin')$$,
  '23514', null,
  'an admin-role invite is refused — admins are promoted, never invited');

-- ----------------------------------------------------------------------------
-- create_group gives the new circle its link
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('f2000000-0000-0000-0000-000000000004'); -- x
select lives_ok(
  $$select public.create_group('Fresh Circle')$$,
  'an outsider can start their own circle');
reset role;
select is(
  (select count(*) from public.invites i
    join public.groups g on g.id = i.group_id
    where g.name = 'Fresh Circle' and i.email is null),
  1::bigint, 'a brand-new circle already owns exactly one open link');
select matches(
  (select i.code from public.invites i
    join public.groups g on g.id = i.group_id
    where g.name = 'Fresh Circle' and i.email is null),
  '^[0-9A-F]{8}$', 'the auto-created code is DB-minted, 8 hex chars');

-- ----------------------------------------------------------------------------
-- The open link cannot be revoked
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('f2000000-0000-0000-0000-000000000001'); -- o
select lives_ok(
  $$delete from public.invites where code = 'DEFAULT1'$$,
  'the delete is not an error — RLS filters the row out rather than raising');
reset role;
select is(
  (select count(*) from public.invites where code = 'DEFAULT1'),
  1::bigint, 'the default open link SURVIVES an owner''s delete');

select pg_temp.impersonate('f2000000-0000-0000-0000-000000000001'); -- o
select lives_ok(
  $$delete from public.invites where email = 'p@inv.test'$$,
  'a locked invite is still revocable');
reset role;
select is(
  (select count(*) from public.invites where email = 'p@inv.test'),
  0::bigint, 'the locked invite is gone');

-- ----------------------------------------------------------------------------
-- Regenerate
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('f2000000-0000-0000-0000-000000000003'); -- m
select throws_matching(
  $$select public.regenerate_invite('f2000000-0000-0000-0000-0000000000b1')$$,
  'only an admin',
  'a plain member cannot regenerate the link');
reset role;

select pg_temp.impersonate('f2000000-0000-0000-0000-000000000004'); -- x (outsider)
select throws_matching(
  $$select public.regenerate_invite('f2000000-0000-0000-0000-0000000000b1')$$,
  'only an admin',
  'an outsider cannot regenerate someone else''s link');
reset role;

select pg_temp.impersonate('f2000000-0000-0000-0000-000000000002'); -- a (co-admin)
select matches(
  (select public.regenerate_invite('f2000000-0000-0000-0000-0000000000b1')),
  '^[0-9A-F]{8}$', 'a co-admin regenerates, and gets a DB-minted code back');
reset role;

select is(
  (select count(*) from public.invites where code = 'DEFAULT1'),
  0::bigint, 'regenerating KILLS every previously shared copy of the link');
select is(
  (select count(*) from public.invites
    where group_id = 'f2000000-0000-0000-0000-0000000000b1' and email is null),
  1::bigint, 'regenerating replaces the row rather than adding a second');

-- The old code must no longer join anyone — the point of regenerate.
select pg_temp.impersonate('f2000000-0000-0000-0000-000000000004'); -- x
select throws_matching(
  $$select public.accept_invite('DEFAULT1')$$,
  'invite not found',
  'the regenerated-away code no longer joins anyone');
reset role;

select * from finish();
rollback;
