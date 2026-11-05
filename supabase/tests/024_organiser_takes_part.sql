-- ============================================================================
-- Logic + grants test suite: 0040 (an organiser takes part directly, D76)
-- ----------------------------------------------------------------------------
-- Pins the gain (an organiser with no circle can record), and everything that
-- must not come with it: no ordinary member can use this, a draft cannot be
-- joined, a circle's admin does not see the organiser, and the entitlement ends
-- with the role while the recorded progress stays.
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

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('cb000000-0000-0000-0000-00000000000f', 's@part.test', '{"name":"S"}', 'authenticated', 'authenticated'),
  ('cb000000-0000-0000-0000-00000000000a', 'a@part.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('cb000000-0000-0000-0000-00000000000b', 'b@part.test', '{"name":"B"}', 'authenticated', 'authenticated');

update public.profiles set is_super_admin = true
  where id = 'cb000000-0000-0000-0000-00000000000f';

insert into public.roadmaps (id, name, starts_on, ends_on, published) values
  ('cb000000-0000-0000-0000-0000000000a1', 'Live', current_date - 1, current_date + 30, true),
  ('cb000000-0000-0000-0000-0000000000a2', 'Draft', current_date - 1, current_date + 30, false);

insert into public.roadmap_items (id, roadmap_id, level, category, title, unit, target, compulsory, sort_order) values
  ('cb000000-0000-0000-0000-0000000000b1', 'cb000000-0000-0000-0000-0000000000a1', 1, 'book', 'One', 'book', 5, true, 1);

insert into public.groups (id, name, created_by) values
  ('cb000000-0000-0000-0000-0000000000d1', 'Circle', 'cb000000-0000-0000-0000-00000000000a');
insert into public.memberships (user_id, group_id, role) values
  ('cb000000-0000-0000-0000-00000000000a', 'cb000000-0000-0000-0000-0000000000d1', 'owner');
insert into public.group_roadmaps (group_id, roadmap_id) values
  ('cb000000-0000-0000-0000-0000000000d1', 'cb000000-0000-0000-0000-0000000000a1');

-- ---- an organiser in no circle ---------------------------------------------
select pg_temp.impersonate('cb000000-0000-0000-0000-00000000000f');

select throws_ok(
  $$ select public.set_roadmap_progress('cb000000-0000-0000-0000-0000000000b1', 1) $$,
  'roadmap item not found',
  'before taking part, an organiser in no circle cannot record');

select throws_ok(
  $$ select public.take_part_in_roadmap('cb000000-0000-0000-0000-0000000000a2', true) $$,
  'that roadmap is not published',
  'a draft cannot be joined');

select lives_ok(
  $$ select public.take_part_in_roadmap('cb000000-0000-0000-0000-0000000000a1', true) $$,
  'an organiser can take part in a published roadmap');

select lives_ok(
  $$ select public.take_part_in_roadmap('cb000000-0000-0000-0000-0000000000a1', true) $$,
  'taking part twice is harmless');

select is(
  public.set_roadmap_progress('cb000000-0000-0000-0000-0000000000b1', 2), 2,
  'having taken part, they can record');

select is(
  (select count(*) from public.roadmap_roster()
    where roadmap_id = 'cb000000-0000-0000-0000-0000000000a1'
      and user_id = 'cb000000-0000-0000-0000-00000000000f'),
  1::bigint,
  'they appear in the cohort report');

select is(
  (select count(*) from public.roadmap_roster()
    where roadmap_id = 'cb000000-0000-0000-0000-0000000000a1'
      and user_id = 'cb000000-0000-0000-0000-00000000000a'),
  1::bigint,
  'the circle half of the roster is unchanged');

select throws_ok(
  $$ insert into public.roadmap_participants (roadmap_id, user_id)
     values ('cb000000-0000-0000-0000-0000000000a1', 'cb000000-0000-0000-0000-00000000000b') $$,
  '42501', null,
  'nobody can write the table directly, so nobody can enrol someone else');

select pg_temp.reset_role();

-- ---- everyone else ---------------------------------------------------------
select pg_temp.impersonate('cb000000-0000-0000-0000-00000000000b');

select throws_ok(
  $$ select public.take_part_in_roadmap('cb000000-0000-0000-0000-0000000000a1', true) $$,
  'organisers only',
  'an ordinary member cannot use this');

select throws_ok(
  $$ select public.set_roadmap_progress('cb000000-0000-0000-0000-0000000000b1', 1) $$,
  'roadmap item not found',
  'an ordinary member in no following circle still cannot record');

select is((select count(*) from public.roadmap_participants), 0::bigint,
  'an ordinary member cannot read who is taking part');

select pg_temp.reset_role();
select pg_temp.impersonate('cb000000-0000-0000-0000-00000000000a');

select is(
  (select count(*) from public.roadmap_roster()
    where user_id = 'cb000000-0000-0000-0000-00000000000f'),
  0::bigint,
  'a circle admin does not see an organiser who is not in their circle');

select lives_ok(
  $$ select public.set_roadmap_progress('cb000000-0000-0000-0000-0000000000b1', 1) $$,
  'a member of a following circle still records as before');

select pg_temp.reset_role();

select ok(not has_function_privilege('anon', 'public.take_part_in_roadmap(uuid, boolean)', 'execute'),
  'anon cannot call it');

-- ---- leaving, and losing the role ------------------------------------------
select pg_temp.impersonate('cb000000-0000-0000-0000-00000000000f');
select lives_ok(
  $$ select public.take_part_in_roadmap('cb000000-0000-0000-0000-0000000000a1', false) $$,
  'an organiser can stop taking part');
select throws_ok(
  $$ select public.set_roadmap_progress('cb000000-0000-0000-0000-0000000000b1', 3) $$,
  'roadmap item not found',
  'and then cannot record');
select lives_ok(
  $$ select public.take_part_in_roadmap('cb000000-0000-0000-0000-0000000000a1', true) $$,
  'and can come back');
select pg_temp.reset_role();

select is(
  (select done from public.roadmap_progress
    where user_id = 'cb000000-0000-0000-0000-00000000000f'
      and item_id = 'cb000000-0000-0000-0000-0000000000b1'),
  2,
  'leaving kept what they had recorded');

update public.profiles set is_super_admin = false
  where id = 'cb000000-0000-0000-0000-00000000000f';

select pg_temp.impersonate('cb000000-0000-0000-0000-00000000000f');
select throws_ok(
  $$ select public.set_roadmap_progress('cb000000-0000-0000-0000-0000000000b1', 3) $$,
  'roadmap item not found',
  'stood down, they can no longer record, though their row is still there');
select pg_temp.reset_role();

select is(
  (select done from public.roadmap_progress
    where user_id = 'cb000000-0000-0000-0000-00000000000f'
      and item_id = 'cb000000-0000-0000-0000-0000000000b1'),
  2,
  'and what they recorded stays');

select * from finish();
rollback;
