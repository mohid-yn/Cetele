-- ============================================================================
-- Logic + grants test suite — 0030 (an organiser authors a programme, D59)
-- ----------------------------------------------------------------------------
-- 0030 hands an organiser the whole programme: create it, publish it, add and
-- remove the work in it, delete it. The assertions that matter are not that
-- those succeed — it is where they REFUSE, because every refusal here is
-- protecting a record somebody earned:
--
--   * ORGANISERS ONLY, and the negative that keeps D55: a circle OWNER whose
--     circle follows the programme still cannot author it
--   * THE FREEZE, BY COMPARISON. Once anyone has recorded work against an item,
--     level / category / unit / target / compulsory cannot move — but title and
--     source still can, so a typo does not have to stand all year
--   * `done > 0`, NOT ROW EXISTENCE. A member who taps once and undoes leaves a
--     zero row behind; if that froze the item, one accidental tap would fix a
--     programme's structure permanently
--   * DELETE REFUSES ONCE RECORDED, and says "unpublish instead" — the cascade
--     would take every roadmap_progress row with it
--   * ADDING TO A FINISHED LEVEL IS REFUSED. A new item makes its level harder,
--     which would take the finish away from whoever had earned it
--   * every action is audited (D27), and a REFUSED action writes nothing
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture — an organiser, a circle owner, a member, and two programmes
-- ----------------------------------------------------------------------------
--   S — an organiser
--   O — the OWNER of a circle that follows the programme
--   M — a plain member of that circle, who will RECORD something
-- ----------------------------------------------------------------------------
insert into auth.users (id, instance_id, email, aud, role) values
  ('a1000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'au-s@example.com', 'authenticated', 'authenticated'),
  ('a1000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000000', 'au-o@example.com', 'authenticated', 'authenticated'),
  ('a1000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'au-m@example.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

update public.profiles set is_super_admin = false where is_super_admin;
update public.profiles set is_super_admin = true
  where id = 'a1000000-0000-0000-0000-00000000000e';

-- TOUCHED: a programme somebody records against. UNTOUCHED: one nobody has.
insert into public.roadmaps (id, name, starts_on, ends_on, published) values
  ('a2000000-0000-0000-0000-000000000001', 'Touched Programme',
   current_date - 10, current_date + 100, true),
  ('a2000000-0000-0000-0000-000000000002', 'Untouched Programme',
   current_date - 10, current_date + 100, true);

insert into public.roadmap_items
  (id, roadmap_id, level, category, title, unit, target, compulsory, sort_order)
values
  -- Level 1 of TOUCHED: one item, so completing it completes the level.
  ('a3000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001', 1, 'book', 'A Book', 'book', 1, false, 1),
  -- Level 2 of TOUCHED: nobody will touch this one.
  ('a3000000-0000-0000-0000-000000000002',
   'a2000000-0000-0000-0000-000000000001', 2, 'book', 'Another Book', 'book', 1, false, 1),
  -- UNTOUCHED's only item.
  ('a3000000-0000-0000-0000-000000000003',
   'a2000000-0000-0000-0000-000000000002', 1, 'book', 'Third Book', 'book', 1, false, 1);

insert into public.groups (id, name, created_by)
values ('a4000000-0000-0000-0000-000000000001', 'Authoring Circle',
        'a1000000-0000-0000-0000-00000000000f');

insert into public.group_roadmaps (group_id, roadmap_id) values
  ('a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001'),
  ('a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002');

insert into public.memberships (user_id, group_id, role) values
  ('a1000000-0000-0000-0000-00000000000f', 'a4000000-0000-0000-0000-000000000001', 'owner'),
  ('a1000000-0000-0000-0000-00000000000c', 'a4000000-0000-0000-0000-000000000001', 'member');

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
-- 1. ORGANISERS ONLY — every door, including the owner's
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('a1000000-0000-0000-0000-00000000000c');
select throws_ok(
  $$ select public.create_roadmap('Mine', current_date, current_date + 1) $$,
  'organisers only', 'a plain member cannot create a programme');
select pg_temp.reset_role();

-- The one worth having: maximum authority INSIDE a circle that genuinely
-- follows the programme is still no authority over the programme (D55).
select pg_temp.impersonate('a1000000-0000-0000-0000-00000000000f');
select throws_ok(
  $$ select public.create_roadmap('Mine', current_date, current_date + 1) $$,
  'organisers only', 'THE NEGATIVE: a circle OWNER cannot create a programme');
select throws_ok(
  $$ select public.delete_roadmap('a2000000-0000-0000-0000-000000000002') $$,
  'organisers only', 'THE NEGATIVE: a circle OWNER cannot delete one either');
select throws_ok(
  $$ select public.create_roadmap_item('a2000000-0000-0000-0000-000000000002',
       1, 'book', 'Sneaky', null, 'book', 1, false, 9) $$,
  'organisers only', 'THE NEGATIVE: a circle OWNER cannot add work to one');
select throws_ok(
  $$ select public.set_roadmap_published('a2000000-0000-0000-0000-000000000002', false) $$,
  'organisers only', 'THE NEGATIVE: a circle OWNER cannot withdraw one');
select pg_temp.reset_role();

-- The tables stay shut whatever the RPCs do — no direct write for any client.
select ok(not has_table_privilege('authenticated', 'public.roadmaps', 'insert'),
  'authenticated has no direct INSERT on roadmaps');
select ok(not has_table_privilege('authenticated', 'public.roadmaps', 'delete'),
  'authenticated has no direct DELETE on roadmaps');
select ok(not has_table_privilege('authenticated', 'public.roadmap_items', 'insert'),
  'authenticated has no direct INSERT on roadmap_items');
select ok(not has_table_privilege('anon', 'public.roadmaps', 'select'),
  'anon cannot even read roadmaps');

-- ----------------------------------------------------------------------------
-- 2. The organiser's ordinary work — create, publish, add, delete
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('a1000000-0000-0000-0000-00000000000e');

select lives_ok(
  $$ select public.create_roadmap('Fresh Programme', current_date, current_date + 30) $$,
  'an organiser creates a programme');

select is(
  (select published from public.roadmaps where name = 'Fresh Programme'),
  false,
  'a new programme is born UNPUBLISHED — nothing a circle can see exists yet');

select throws_ok(
  $$ select public.create_roadmap('  ', current_date, current_date + 1) $$,
  'a programme needs a name', 'a blank name is refused');
select throws_ok(
  $$ select public.create_roadmap('Backwards', current_date + 10, current_date) $$,
  'the end cannot come before the start', 'a backwards window is refused');

-- ----------------------------------------------------------------------------
-- 3. THE FREEZE. M records against level 1 of TOUCHED, which finishes it.
-- ----------------------------------------------------------------------------
select pg_temp.reset_role();
select pg_temp.impersonate('a1000000-0000-0000-0000-00000000000c');
select lives_ok(
  $$ select public.set_roadmap_progress('a3000000-0000-0000-0000-000000000001', 1) $$,
  'a member records the one item at level 1 — which finishes that level');
select pg_temp.reset_role();

select pg_temp.impersonate('a1000000-0000-0000-0000-00000000000e');

select throws_ok(
  $$ select public.set_roadmap_item_shape('a3000000-0000-0000-0000-000000000001',
       1, 'book', 'A Book', null, 'book', 99, false, 1) $$,
  'members have recorded progress on this item — its level, category, unit, target and compulsory flag are fixed now',
  'THE FREEZE: the target cannot move once somebody has recorded against it');

-- ...but the presentation still can, which is the whole point of comparing
-- field by field rather than refusing the call outright.
select lives_ok(
  $$ select public.set_roadmap_item_shape('a3000000-0000-0000-0000-000000000001',
       1, 'book', 'A Book (corrected)', 'An author', 'book', 1, false, 2) $$,
  'the TITLE and source of a recorded item can still be corrected');
select pg_temp.reset_role();
select is(
  (select title from public.roadmap_items where id = 'a3000000-0000-0000-0000-000000000001'),
  'A Book (corrected)', '...and the correction landed');
select is(
  (select target from public.roadmap_items where id = 'a3000000-0000-0000-0000-000000000001'),
  1, '...with the target untouched');

select pg_temp.impersonate('a1000000-0000-0000-0000-00000000000e');
select throws_ok(
  $$ select public.delete_roadmap_item('a3000000-0000-0000-0000-000000000001') $$,
  'members have recorded progress on this item — it cannot be removed',
  'a recorded item cannot be deleted — that would destroy what they recorded');

select throws_ok(
  $$ select public.delete_roadmap('a2000000-0000-0000-0000-000000000001') $$,
  'members have recorded progress on this programme — unpublish it instead',
  'DELETE REFUSES, and names the alternative');

-- Withdrawing IS allowed, and is the honest way to take a live programme down.
select lives_ok(
  $$ select public.set_roadmap_published('a2000000-0000-0000-0000-000000000001', false) $$,
  'unpublishing a recorded programme is allowed — it destroys nothing');
select pg_temp.reset_role();
select is(
  (select count(*)::int from public.roadmap_progress
    where item_id = 'a3000000-0000-0000-0000-000000000001'),
  1, '...and the recorded row is still there afterwards');
select pg_temp.impersonate('a1000000-0000-0000-0000-00000000000e');
select lives_ok(
  $$ select public.set_roadmap_published('a2000000-0000-0000-0000-000000000001', true) $$,
  '...and it can be published again, putting everyone back where they were');

-- ----------------------------------------------------------------------------
-- 4. ADDING TO A FINISHED LEVEL. Level 1 of TOUCHED is complete for M, so a new
--    item there would un-finish them. Level 2 is untouched and stays open.
-- ----------------------------------------------------------------------------
select throws_ok(
  $$ select public.create_roadmap_item('a2000000-0000-0000-0000-000000000001',
       1, 'book', 'Late Addition', null, 'book', 1, false, 9) $$,
  'somebody has already finished level 1 — adding to it would undo that',
  'work cannot be added to a level somebody has already finished');

select lives_ok(
  $$ select public.create_roadmap_item('a2000000-0000-0000-0000-000000000001',
       2, 'book', 'Fine Here', null, 'book', 1, false, 9) $$,
  '...but a level nobody has finished still takes new work, mid-programme');

-- Moving an item INTO a finished level is the same harm, and is refused too.
select throws_ok(
  $$ select public.set_roadmap_item_shape('a3000000-0000-0000-0000-000000000002',
       1, 'book', 'Another Book', null, 'book', 1, false, 1) $$,
  'somebody has already finished level 1 — moving work into it would undo that',
  'work cannot be MOVED into a finished level either');

-- ----------------------------------------------------------------------------
-- 5. `done > 0`, NOT ROW EXISTENCE — the undone tap must not freeze anything
-- ----------------------------------------------------------------------------
select pg_temp.reset_role();
select pg_temp.impersonate('a1000000-0000-0000-0000-00000000000c');
select lives_ok(
  $$ select public.set_roadmap_progress('a3000000-0000-0000-0000-000000000003', 1) $$,
  'a member taps an item on the UNTOUCHED programme...');
select lives_ok(
  $$ select public.set_roadmap_progress('a3000000-0000-0000-0000-000000000003', 0) $$,
  '...and undoes it, which leaves a zero row behind');
select pg_temp.reset_role();

select is(
  (select count(*)::int from public.roadmap_progress
    where item_id = 'a3000000-0000-0000-0000-000000000003'),
  1, 'the zero row really is still there');

select pg_temp.impersonate('a1000000-0000-0000-0000-00000000000e');
select lives_ok(
  $$ select public.set_roadmap_item_shape('a3000000-0000-0000-0000-000000000003',
       1, 'book', 'Third Book', null, 'chapters', 12, false, 1) $$,
  'an UNDONE tap does not freeze the item — the lock is on work actually done');

select lives_ok(
  $$ select public.delete_roadmap('a2000000-0000-0000-0000-000000000002') $$,
  '...and the programme it belongs to can still be deleted');
select pg_temp.reset_role();
select is(
  (select count(*)::int from public.roadmaps
    where id = 'a2000000-0000-0000-0000-000000000002'),
  0, '...which really removed it');

-- ----------------------------------------------------------------------------
-- 6. Rewards freeze the same way, except for the WORDING
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('a1000000-0000-0000-0000-00000000000e');

-- TOUCHED has recorded work, so a new reward on it is refused...
select throws_ok(
  $$ select public.upsert_roadmap_reward('a2000000-0000-0000-0000-000000000001',
       1, 'Level 1', 'A prize') $$,
  'members have recorded progress on this programme — its rewards are fixed now',
  'a reward cannot be ADDED to a programme people are working on');

-- ...but an existing one can still say what it gives, which is exactly the
-- open question the owner needed to be able to settle without a migration.
select pg_temp.reset_role();
insert into public.roadmap_rewards (id, roadmap_id, threshold, label, description)
values ('a5000000-0000-0000-0000-000000000001',
        'a2000000-0000-0000-0000-000000000001', 1, 'Level 1 complete', 'TBC');

select pg_temp.impersonate('a1000000-0000-0000-0000-00000000000e');
select lives_ok(
  $$ select public.upsert_roadmap_reward('a2000000-0000-0000-0000-000000000001',
       1, 'Level 1 complete', '$1,000 toward the trip',
       'a5000000-0000-0000-0000-000000000001') $$,
  'THE WORDING of an existing reward is editable on a live programme');

select throws_ok(
  $$ select public.upsert_roadmap_reward('a2000000-0000-0000-0000-000000000001',
       3, 'Level 1 complete', '$1,000 toward the trip',
       'a5000000-0000-0000-0000-000000000001') $$,
  'members have recorded progress on this programme — a reward''s level is fixed now',
  '...but the LEVEL it unlocks at is not — that is a promise already made');

-- How a category is SCORED decides completion outright, so it freezes whole.
select throws_ok(
  $$ select public.set_roadmap_level_requirement('a2000000-0000-0000-0000-000000000001',
       1, 'book', 5) $$,
  'members have recorded progress on this programme — how a category is scored is fixed now',
  'a budget cannot be introduced on a programme people are working on');

-- ----------------------------------------------------------------------------
-- 7. AUDIT (D27) — every action leaves a row, every refusal leaves none
-- ----------------------------------------------------------------------------
select pg_temp.reset_role();
select ok(
  exists (select 1 from public.audit_log
           where action = 'create_roadmap'
             and actor_id = 'a1000000-0000-0000-0000-00000000000e'),
  'creating a programme is audited');
select ok(
  exists (select 1 from public.audit_log where action = 'create_roadmap_item'),
  'adding work is audited');
select ok(
  exists (select 1 from public.audit_log where action = 'delete_roadmap'),
  'deleting a programme is audited');
select ok(
  exists (select 1 from public.audit_log where action = 'set_roadmap_published'),
  'publishing is audited');
select is(
  (select count(*)::int from public.audit_log
    where action = 'delete_roadmap_item'),
  0, 'the REFUSED item deletion wrote no audit row');

select * from finish();
rollback;
