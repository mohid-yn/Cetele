-- ============================================================================
-- Logic + grants test suite: 0037 (an organiser assigns circles, D72)
-- ----------------------------------------------------------------------------
-- Pins both halves of the decision: an organiser gains a view of every circle
-- and a second way to add one, and a circle's admins keep the way they have.
-- Also pins what an organiser does NOT gain: `groups` stays unreadable to them
-- directly (D27), and removal touches no recorded progress (D55).
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('ca000000-0000-0000-0000-00000000000a', 'a@assign.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('ca000000-0000-0000-0000-00000000000b', 'b@assign.test', '{"name":"B"}', 'authenticated', 'authenticated'),
  ('ca000000-0000-0000-0000-00000000000f', 's@assign.test', '{"name":"S"}', 'authenticated', 'authenticated');

update public.profiles set is_super_admin = true
  where id = 'ca000000-0000-0000-0000-00000000000f';

insert into public.roadmaps (id, name, starts_on, ends_on, published) values
  ('ca000000-0000-0000-0000-0000000000a1', 'Live', current_date - 1, current_date + 30, true),
  ('ca000000-0000-0000-0000-0000000000a2', 'Draft', current_date - 1, current_date + 30, false);

insert into public.roadmap_items (id, roadmap_id, level, category, title, unit, target, compulsory, sort_order) values
  ('ca000000-0000-0000-0000-0000000000b1', 'ca000000-0000-0000-0000-0000000000a1', 1, 'book', 'One', 'book', 1, false, 1),
  ('ca000000-0000-0000-0000-0000000000b2', 'ca000000-0000-0000-0000-0000000000a1', 1, 'book', 'Two', 'book', 1, false, 2),
  ('ca000000-0000-0000-0000-0000000000b3', 'ca000000-0000-0000-0000-0000000000a1', 1, 'book', 'Three', 'book', 1, false, 3),
  ('ca000000-0000-0000-0000-0000000000b4', 'ca000000-0000-0000-0000-0000000000a1', 2, 'book', 'Elsewhere', 'book', 1, false, 1);

insert into public.groups (id, name, created_by) values
  ('ca000000-0000-0000-0000-0000000000d1', 'Circle one', 'ca000000-0000-0000-0000-00000000000a'),
  ('ca000000-0000-0000-0000-0000000000d2', 'Circle two', 'ca000000-0000-0000-0000-00000000000a');

insert into public.memberships (user_id, group_id, role) values
  ('ca000000-0000-0000-0000-00000000000a', 'ca000000-0000-0000-0000-0000000000d1', 'owner'),
  ('ca000000-0000-0000-0000-00000000000b', 'ca000000-0000-0000-0000-0000000000d1', 'member'),
  ('ca000000-0000-0000-0000-00000000000a', 'ca000000-0000-0000-0000-0000000000d2', 'owner')
on conflict do nothing;

insert into public.group_roadmaps (group_id, roadmap_id) values
  ('ca000000-0000-0000-0000-0000000000d1', 'ca000000-0000-0000-0000-0000000000a1');

insert into public.roadmap_progress (user_id, item_id, done) values
  ('ca000000-0000-0000-0000-00000000000b', 'ca000000-0000-0000-0000-0000000000b1', 1);

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
-- 1. Everyone who is not an organiser is refused, circle owners included
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('ca000000-0000-0000-0000-00000000000a');

select throws_ok(
  $$ select * from public.roadmap_circles('ca000000-0000-0000-0000-0000000000a1') $$,
  'organisers only', 'an owner cannot list every circle');
select throws_ok(
  $$ select public.set_circle_on_roadmap('ca000000-0000-0000-0000-0000000000a1',
       'ca000000-0000-0000-0000-0000000000d2', true) $$,
  'organisers only', 'an owner cannot use the organiser path, even for their own circle');
select throws_ok(
  $$ select public.reorder_roadmap_items('ca000000-0000-0000-0000-0000000000a1', 1, 'book',
       array['ca000000-0000-0000-0000-0000000000b1']::uuid[]) $$,
  'organisers only', 'an owner cannot reorder items');

-- The route a circle's admin already has must survive this migration.
select lives_ok(
  $$ insert into public.group_roadmaps (group_id, roadmap_id) values
       ('ca000000-0000-0000-0000-0000000000d2', 'ca000000-0000-0000-0000-0000000000a1') $$,
  'an owner can still put their own circle on a roadmap');
delete from public.group_roadmaps
 where group_id = 'ca000000-0000-0000-0000-0000000000d2';
select is((select count(*)::int from public.group_roadmaps
            where group_id = 'ca000000-0000-0000-0000-0000000000d2'), 0,
  'and can still take it off again');

select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 2. The organiser's view: names and counts, and nothing wider
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('ca000000-0000-0000-0000-00000000000f');

select results_eq(
  $$ select name, member_count, following
       from public.roadmap_circles('ca000000-0000-0000-0000-0000000000a1')
      where name like 'Circle %' order by name $$,
  $$ values ('Circle one'::text, 2, true), ('Circle two'::text, 1, false) $$,
  'an organiser sees each circle, its head-count, and whether it is on the roadmap');

select is((select count(*)::int from public.groups
            where id = 'ca000000-0000-0000-0000-0000000000d1'), 0,
  'D27 still holds: an organiser cannot read `groups` directly');
select is((select count(*)::int from public.memberships
            where group_id = 'ca000000-0000-0000-0000-0000000000d1'), 0,
  'and cannot read who is in a circle');

-- ----------------------------------------------------------------------------
-- 3. Assigning and removing
-- ----------------------------------------------------------------------------
select lives_ok(
  $$ select public.set_circle_on_roadmap('ca000000-0000-0000-0000-0000000000a1',
       'ca000000-0000-0000-0000-0000000000d2', true) $$,
  'an organiser can add a circle');
select lives_ok(
  $$ select public.set_circle_on_roadmap('ca000000-0000-0000-0000-0000000000a1',
       'ca000000-0000-0000-0000-0000000000d2', true) $$,
  'adding it twice is not an error');
select is((select count(*)::int from public.group_roadmaps
            where group_id = 'ca000000-0000-0000-0000-0000000000d2'
              and roadmap_id = 'ca000000-0000-0000-0000-0000000000a1'), 1,
  'and leaves exactly one row');

select lives_ok(
  $$ select public.set_circle_on_roadmap('ca000000-0000-0000-0000-0000000000a2',
       'ca000000-0000-0000-0000-0000000000d1', true) $$,
  'a draft can be lined up with circles before it is published');

select lives_ok(
  $$ select public.set_circle_on_roadmap('ca000000-0000-0000-0000-0000000000a1',
       'ca000000-0000-0000-0000-0000000000d1', false) $$,
  'an organiser can remove a circle whose member has recorded work');

select throws_ok(
  $$ select public.set_circle_on_roadmap('ca000000-0000-0000-0000-0000000000ff',
       'ca000000-0000-0000-0000-0000000000d1', true) $$,
  'roadmap not found', 'an unknown roadmap is refused');
select throws_ok(
  $$ select public.set_circle_on_roadmap('ca000000-0000-0000-0000-0000000000a1',
       'ca000000-0000-0000-0000-0000000000ff', true) $$,
  'circle not found', 'an unknown circle is refused');

select pg_temp.reset_role();

select is((select done from public.roadmap_progress
            where user_id = 'ca000000-0000-0000-0000-00000000000b'
              and item_id = 'ca000000-0000-0000-0000-0000000000b1'), 1,
  'removing a circle keeps every recorded row (D55)');
select is((select count(*)::int from public.audit_log
            where action = 'set_circle_on_roadmap'
              and detail ->> 'roadmap' = 'ca000000-0000-0000-0000-0000000000a1'), 3,
  'every organiser write to a circle is audited');

-- ----------------------------------------------------------------------------
-- 4. A draft stays hidden from a member of a circle lined up for it
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('ca000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.roadmaps
            where id = 'ca000000-0000-0000-0000-0000000000a2'), 0,
  'a member cannot read a draft their circle has been lined up for');
select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 5. Reordering
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('ca000000-0000-0000-0000-00000000000f');

select lives_ok(
  $$ select public.reorder_roadmap_items('ca000000-0000-0000-0000-0000000000a1', 1, 'book',
       array['ca000000-0000-0000-0000-0000000000b3',
             'ca000000-0000-0000-0000-0000000000b1',
             'ca000000-0000-0000-0000-0000000000b2']::uuid[]) $$,
  'an organiser can reorder, including an item with recorded work');
select results_eq(
  $$ select title from public.roadmap_items
      where roadmap_id = 'ca000000-0000-0000-0000-0000000000a1' and level = 1
      order by sort_order $$,
  $$ values ('Three'::text), ('One'::text), ('Two'::text) $$,
  'and the new order is what comes back');

select throws_like(
  $$ select public.reorder_roadmap_items('ca000000-0000-0000-0000-0000000000a1', 1, 'book',
       array['ca000000-0000-0000-0000-0000000000b1',
             'ca000000-0000-0000-0000-0000000000b2']::uuid[]) $$,
  '%has changed%', 'a list missing an item is refused');
select throws_like(
  $$ select public.reorder_roadmap_items('ca000000-0000-0000-0000-0000000000a1', 1, 'book',
       array['ca000000-0000-0000-0000-0000000000b1',
             'ca000000-0000-0000-0000-0000000000b2',
             'ca000000-0000-0000-0000-0000000000b4']::uuid[]) $$,
  '%has changed%', 'an item from another level is refused');
select throws_like(
  $$ select public.reorder_roadmap_items('ca000000-0000-0000-0000-0000000000a1', 1, 'book',
       array['ca000000-0000-0000-0000-0000000000b1',
             'ca000000-0000-0000-0000-0000000000b1',
             'ca000000-0000-0000-0000-0000000000b2']::uuid[]) $$,
  '%has changed%', 'a repeated item is refused');

select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 6. Grants
-- ----------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.roadmap_circles(uuid)', 'execute'),
  'anon cannot list circles');
select ok(not has_function_privilege('anon', 'public.set_circle_on_roadmap(uuid, uuid, boolean)', 'execute'),
  'anon cannot assign circles');
select ok(not has_function_privilege('anon', 'public.reorder_roadmap_items(uuid, integer, text, uuid[])', 'execute'),
  'anon cannot reorder');

-- ----------------------------------------------------------------------------
-- 7. Reach counts PEOPLE (0038). A is in both circles and must count once.
-- ----------------------------------------------------------------------------
insert into public.group_roadmaps (group_id, roadmap_id) values
  ('ca000000-0000-0000-0000-0000000000d1', 'ca000000-0000-0000-0000-0000000000a2'),
  ('ca000000-0000-0000-0000-0000000000d2', 'ca000000-0000-0000-0000-0000000000a2')
on conflict do nothing;

select pg_temp.impersonate('ca000000-0000-0000-0000-00000000000f');
select is(
  public.roadmap_reach('ca000000-0000-0000-0000-0000000000a2'),
  2,
  'reach counts someone in two circles once');
select cmp_ok(
  public.roadmap_reach('ca000000-0000-0000-0000-0000000000a2'),
  '<',
  (select sum(member_count)::integer
     from public.roadmap_circles('ca000000-0000-0000-0000-0000000000a2')
    where following),
  'and is below the sum of the circles'' head-counts');
select pg_temp.reset_role();

select pg_temp.impersonate('ca000000-0000-0000-0000-00000000000b');
select throws_like(
  $$ select public.roadmap_reach('ca000000-0000-0000-0000-0000000000a2') $$,
  '%organisers only%', 'a member is refused the reach figure');
select pg_temp.reset_role();

select ok(not has_function_privilege('anon', 'public.roadmap_reach(uuid)', 'execute'),
  'anon cannot read reach');

select * from finish();
rollback;
