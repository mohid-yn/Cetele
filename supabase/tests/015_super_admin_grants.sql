-- ============================================================================
-- Logic + grants test suite — 0026 (an organiser appoints an organiser, D56)
-- ----------------------------------------------------------------------------
-- This is a PRIVILEGE-GRANTING surface, so the negatives are the point and they
-- come first. Covers:
--
--   * THE ASSERTION THE WHOLE AMENDMENT RESTS ON — an ordinary member cannot
--     promote anyone, including themselves. D27 forbade SELF-escalation and
--     that has not moved an inch; only the "already an organiser" path is new
--   * the guard trigger is UNTOUCHED: `authenticated` still cannot write the
--     column directly, so the RPC is the only door and not merely the front one
--   * promotion is by EXACT email — no pattern, no prefix, nothing that turns
--     this into a way to probe for accounts (D26/D27: no god view)
--   * `list_super_admins` returns the ROSTER to an organiser and an EMPTY SET
--     to anyone else — never an error, because "you may see nobody" is the
--     honest answer for a list
--   * THE LOCKOUT NEGATIVE — the last organiser cannot be stood down, or the
--     app loses access to its own administration and only the Supabase
--     dashboard can get it back
--   * standing YOURSELF down is allowed while others remain (the ordinary
--     hand-over), which is the case a naive "can't revoke self" rule gets wrong
--   * every grant and every revoke lands in `audit_log` — D27 said every
--     super-admin action is logged and 0010 built the table for it
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture
-- ----------------------------------------------------------------------------
--   S1, S2  — organisers (two, so the last-organiser rule can be exercised
--             from both sides: one revoke succeeds, the next is refused)
--   M       — an ordinary member, the self-escalation case
--   T       — the person being appointed
-- ----------------------------------------------------------------------------
insert into auth.users (id, instance_id, email, aud, role) values
  ('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 's1@example.com',     'authenticated', 'authenticated'),
  ('d1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 's2@example.com',     'authenticated', 'authenticated'),
  ('d1000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'member@example.com', 'authenticated', 'authenticated'),
  ('d1000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'Target@Example.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

update public.profiles set name = 'S One'  where id = 'd1000000-0000-0000-0000-000000000001';
update public.profiles set name = 'S Two'  where id = 'd1000000-0000-0000-0000-000000000002';
update public.profiles set name = 'Member' where id = 'd1000000-0000-0000-0000-00000000000a';
update public.profiles set name = 'Target' where id = 'd1000000-0000-0000-0000-00000000000b';

update public.profiles set is_super_admin = true
  where id in ('d1000000-0000-0000-0000-000000000001',
               'd1000000-0000-0000-0000-000000000002');

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
-- 1. THE NEGATIVES — self-escalation is exactly as closed as D27 left it
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000a');

select throws_ok(
  $$ select public.grant_super_admin('member@example.com') $$,
  'organisers only',
  'an ordinary member cannot promote THEMSELVES — the whole of D27''s rationale');

select throws_ok(
  $$ select public.grant_super_admin('target@example.com') $$,
  'organisers only',
  'an ordinary member cannot promote anyone else either');

select throws_ok(
  $$ select public.revoke_super_admin('d1000000-0000-0000-0000-000000000001') $$,
  'organisers only',
  'an ordinary member cannot stand an organiser down');

-- The RPC is the ONLY door, not merely the front one: a direct UPDATE from
-- `authenticated` still fails. If this ever passes, the RPC's checks above are
-- decoration.
--
-- TWO layers refuse it, and it is worth being precise about WHICH one answers,
-- because this assertion originally expected the wrong one. The guard trigger
-- (0001) raises 'is_super_admin is set out-of-band…' — but it never gets the
-- chance: 0007 column-scopes `authenticated`'s UPDATE grant to name/avatar_url/
-- timezone, so Postgres refuses on privilege (42501) before any row is touched.
-- The trigger is the inner layer, reachable only by a role that HAS the grant,
-- which since 0026 is service_role — and the trigger deliberately permits that
-- one. So the trigger is belt-and-braces here, not the thing doing the work,
-- and a test that claimed otherwise would be describing a mechanism that never
-- runs.
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'is_super_admin', 'update'),
  'authenticated has no UPDATE grant on is_super_admin — the outer layer');

select throws_ok(
  $$ update public.profiles set is_super_admin = true
      where id = 'd1000000-0000-0000-0000-00000000000a' $$,
  '42501',
  'permission denied for table profiles',
  'a direct write from authenticated is refused on privilege');

-- A non-organiser gets an EMPTY ROSTER, not an error and not a list.
select is(
  (select count(*)::int from public.list_super_admins()),
  0,
  'list_super_admins shows a non-organiser nobody at all');

select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 2. The roster, to someone entitled to it
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('d1000000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.list_super_admins()),
  2,
  'an organiser sees the administration''s own roster');

-- Email is carried because a NAME does not identify a person: removing the
-- wrong "Ahmad" is silent and irreversible from the UI.
select is(
  (select email from public.list_super_admins() where user_id = 'd1000000-0000-0000-0000-000000000002'),
  's2@example.com',
  'the roster carries email, so two people with one name are distinguishable');

-- It is a roster, NOT a directory — the ordinary member is not in it.
select is(
  (select count(*)::int from public.list_super_admins()
    where user_id = 'd1000000-0000-0000-0000-00000000000a'),
  0,
  'the roster is not a user directory: it lists only organisers');

-- ----------------------------------------------------------------------------
-- 3. Appointing, by exact email
-- ----------------------------------------------------------------------------

-- Case-insensitive, because GoTrue lowercases what a human types in mixed case.
-- The fixture's address is deliberately stored as 'Target@Example.com'.
select is(
  (select user_id from public.grant_super_admin('TARGET@example.com')),
  'd1000000-0000-0000-0000-00000000000b'::uuid,
  'an organiser appoints another by email, case-insensitively');

-- Read as the superuser, NOT as the caller. An organiser shares no circle with
-- the person they just appointed, so `profiles_select_self_or_shared` hides
-- that row from them and the select returns NULL rather than false — which is
-- RLS working, and a reminder that "what the DB holds" and "what the caller can
-- see" are different questions. This assertion is about the former.
select pg_temp.reset_role();
select ok(
  (select is_super_admin from public.profiles where id = 'd1000000-0000-0000-0000-00000000000b'),
  '...and the flag is actually set');
select pg_temp.impersonate('d1000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ select public.grant_super_admin('target@example.com') $$,
  'that person is already an organiser',
  'promoting someone twice is refused out loud, not silently re-recorded');

select throws_ok(
  $$ select public.grant_super_admin('nobody@example.com') $$,
  'no account with that email address',
  'an unknown address is refused');

-- NO PATTERN MATCHING. If this ever returned a row, the function would be a way
-- to sweep the user base for accounts — the god view D26/D27 refuses.
select throws_ok(
  $$ select public.grant_super_admin('%@example.com') $$,
  'no account with that email address',
  'a wildcard matches nothing — this is not a search');

-- ----------------------------------------------------------------------------
-- 4. Standing down, and the lockout that must not happen
-- ----------------------------------------------------------------------------

select lives_ok(
  $$ select public.revoke_super_admin('d1000000-0000-0000-0000-00000000000b') $$,
  'an organiser stands another down');

select pg_temp.reset_role();
select ok(
  not (select is_super_admin from public.profiles where id = 'd1000000-0000-0000-0000-00000000000b'),
  '...and the flag is actually cleared');
select pg_temp.impersonate('d1000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ select public.revoke_super_admin('d1000000-0000-0000-0000-00000000000b') $$,
  'that person is not an organiser',
  'standing down someone who is not an organiser is refused');

-- Standing YOURSELF down is the ordinary hand-over and must work while others
-- remain. A naive "you cannot revoke yourself" rule would fail this.
select lives_ok(
  $$ select public.revoke_super_admin('d1000000-0000-0000-0000-000000000001') $$,
  'an organiser can stand THEMSELVES down while another remains');

select pg_temp.reset_role();
select pg_temp.impersonate('d1000000-0000-0000-0000-000000000002');

-- THE LOCKOUT NEGATIVE. S2 is now the only one left.
select is(
  (select count(*)::int from public.profiles where is_super_admin),
  1,
  'exactly one organiser remains');

select throws_ok(
  $$ select public.revoke_super_admin('d1000000-0000-0000-0000-000000000002') $$,
  'the last organiser cannot be stood down',
  'THE LOCKOUT NEGATIVE — the app can never lose its own administration');

select ok(
  (select is_super_admin from public.profiles where id = 'd1000000-0000-0000-0000-000000000002'),
  '...and the refusal ROLLED BACK the update rather than leaving it applied');

-- ----------------------------------------------------------------------------
-- 5. Everything is audited (D27: every super-admin action is logged)
-- ----------------------------------------------------------------------------

select pg_temp.reset_role();

select is(
  (select count(*)::int from public.audit_log
    where action = 'grant_super_admin'
      and target_user_id = 'd1000000-0000-0000-0000-00000000000b'),
  1,
  'the appointment landed in audit_log');

select is(
  (select actor_id from public.audit_log
    where action = 'grant_super_admin'
      and target_user_id = 'd1000000-0000-0000-0000-00000000000b'),
  'd1000000-0000-0000-0000-000000000001'::uuid,
  '...naming WHO did it');

select is(
  (select count(*)::int from public.audit_log where action = 'revoke_super_admin'),
  2,
  'both stand-downs landed in audit_log');

-- The self-revoke is marked as such, so a hand-over reads differently from one
-- organiser removing another.
select ok(
  (select (detail->>'self')::boolean from public.audit_log
    where action = 'revoke_super_admin'
      and target_user_id = 'd1000000-0000-0000-0000-000000000001'),
  '...and a self-stand-down is recorded as one');

-- A REFUSED action must leave no trace: the last-organiser attempt rolled back,
-- so there is no audit row claiming it happened.
select is(
  (select count(*)::int from public.audit_log
    where action = 'revoke_super_admin'
      and target_user_id = 'd1000000-0000-0000-0000-000000000002'),
  0,
  'the REFUSED stand-down wrote no audit row — a rollback is not a record');

-- ----------------------------------------------------------------------------
-- 6. Grants
-- ----------------------------------------------------------------------------

select ok(not has_function_privilege('anon', 'public.grant_super_admin(text)', 'execute'),
  'anon cannot call grant_super_admin');
select ok(not has_function_privilege('anon', 'public.revoke_super_admin(uuid)', 'execute'),
  'anon cannot call revoke_super_admin');
select ok(not has_function_privilege('anon', 'public.list_super_admins()', 'execute'),
  'anon cannot call list_super_admins');

select ok(has_function_privilege('authenticated', 'public.grant_super_admin(text)', 'execute'),
  'authenticated may CALL grant_super_admin — the function itself does the gating');

-- The bootstrap path: service_role can set the column (the first organiser has
-- no in-app route by design) but nothing else writable on profiles.
select ok(has_column_privilege('service_role', 'public.profiles', 'is_super_admin', 'update'),
  'service_role can set is_super_admin — this is how the FIRST organiser is made');
select ok(not has_column_privilege('service_role', 'public.profiles', 'name', 'update'),
  '...and that grant is column-scoped, not a general write on profiles');

select * from finish();
rollback;
