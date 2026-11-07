-- ============================================================================
-- Logic test suite: 0041 (a circle can only follow a published roadmap, D77)
-- ----------------------------------------------------------------------------
-- Pins the refusal on BOTH writers (a circle admin through the table, an
-- organiser through the RPC) and what it leaves alone: a circle already on a
-- roadmap that is later unpublished keeps its row, and can still leave.
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
  ('cd000000-0000-0000-0000-00000000000a', 'a@draft.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('cd000000-0000-0000-0000-00000000000f', 's@draft.test', '{"name":"S"}', 'authenticated', 'authenticated');

update public.profiles set is_super_admin = true
  where id = 'cd000000-0000-0000-0000-00000000000f';

insert into public.roadmaps (id, name, starts_on, ends_on, published) values
  ('cd000000-0000-0000-0000-0000000000a1', 'Live', current_date - 1, current_date + 30, true),
  ('cd000000-0000-0000-0000-0000000000a2', 'Draft', current_date - 1, current_date + 30, false);

insert into public.groups (id, name, created_by) values
  ('cd000000-0000-0000-0000-0000000000d1', 'Circle one', 'cd000000-0000-0000-0000-00000000000a');

-- The organiser also owns the circle, so they hold BOTH writers' authority:
-- the refusal must not depend on which hat they are wearing.
insert into public.memberships (user_id, group_id, role) values
  ('cd000000-0000-0000-0000-00000000000a', 'cd000000-0000-0000-0000-0000000000d1', 'owner'),
  ('cd000000-0000-0000-0000-00000000000f', 'cd000000-0000-0000-0000-0000000000d1', 'admin');

-- 1. A circle admin, through the table (Manage) -------------------------------
select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ insert into public.group_roadmaps (group_id, roadmap_id) values
       ('cd000000-0000-0000-0000-0000000000d1', 'cd000000-0000-0000-0000-0000000000a2') $$,
  '42501',
  'new row violates row-level security policy for table "group_roadmaps"',
  'a circle admin cannot follow a draft (the ordinary RLS refusal, no oracle)');
select lives_ok(
  $$ insert into public.group_roadmaps (group_id, roadmap_id) values
       ('cd000000-0000-0000-0000-0000000000d1', 'cd000000-0000-0000-0000-0000000000a1') $$,
  'a circle admin can follow a published roadmap');
select pg_temp.reset_role();

-- 2. An organiser who can read drafts, through the table and the RPC ----------
select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000f');
select is((select count(*)::int from public.roadmaps
            where id = 'cd000000-0000-0000-0000-0000000000a2'), 1,
  'the organiser can read the draft (which is why Manage used to offer it)');
select throws_ok(
  $$ insert into public.group_roadmaps (group_id, roadmap_id) values
       ('cd000000-0000-0000-0000-0000000000d1', 'cd000000-0000-0000-0000-0000000000a2') $$,
  '42501',
  'new row violates row-level security policy for table "group_roadmaps"',
  'an organiser who is also a circle admin cannot follow a draft from Manage');
select throws_ok(
  $$ select public.set_circle_on_roadmap('cd000000-0000-0000-0000-0000000000a2',
       'cd000000-0000-0000-0000-0000000000d1', true) $$,
  'publish this roadmap before adding circles to it',
  'nor through the builder');
select pg_temp.reset_role();

-- 3. Unpublishing later leaves the row, and leaving still works ---------------
update public.roadmaps set published = false
  where id = 'cd000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.group_roadmaps
            where roadmap_id = 'cd000000-0000-0000-0000-0000000000a1'), 1,
  'unpublishing does not take a circle off the roadmap');

select pg_temp.impersonate('cd000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ delete from public.group_roadmaps
      where group_id = 'cd000000-0000-0000-0000-0000000000d1'
        and roadmap_id = 'cd000000-0000-0000-0000-0000000000a1' $$,
  'a circle can still leave a roadmap that is no longer published');
select pg_temp.reset_role();
select is((select count(*)::int from public.group_roadmaps
            where roadmap_id = 'cd000000-0000-0000-0000-0000000000a1'), 0,
  'and the row is gone');

select * from finish();
rollback;
