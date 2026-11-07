-- ============================================================================
-- Logic + grants test suite: 0044 (roadmaps on a branch, D81) and 0045 (camp
-- details, D84)
-- ----------------------------------------------------------------------------
-- 0044: assigning a roadmap to a branch reaches every circle at or under it,
-- including one that joins later; it leaves a direct follow alone; a circle
-- that leaves the branch stops following; only organisers assign; a circle's
-- admin cannot remove a row the branch set.
-- 0045: a camp's cost, list, contact and schedule round-trip through
-- save_camp, are tidied, and a malformed schedule is refused.
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

-- O organiser · S steward of Melbourne · A owner of the SE circle · N owner of
-- the North circle · Q owner of the QLD circle.
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('ce000000-0000-0000-0000-00000000000f', 'o@rb.test', '{"name":"O"}', 'authenticated', 'authenticated'),
  ('ce000000-0000-0000-0000-000000000005', 's@rb.test', '{"name":"S"}', 'authenticated', 'authenticated'),
  ('ce000000-0000-0000-0000-00000000000a', 'a@rb.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('ce000000-0000-0000-0000-00000000000d', 'n@rb.test', '{"name":"N"}', 'authenticated', 'authenticated'),
  ('ce000000-0000-0000-0000-00000000000c', 'q@rb.test', '{"name":"Q"}', 'authenticated', 'authenticated');
update public.profiles set is_super_admin = true
 where id = 'ce000000-0000-0000-0000-00000000000f';

-- Tree: YN → MEL → {SE, NORTH};  YN → QLD
insert into public.branches (id, parent_id, name) values
  ('ce000000-0000-0000-0000-000000000100', null, 'RB Nexus'),
  ('ce000000-0000-0000-0000-000000000102', 'ce000000-0000-0000-0000-000000000100', 'Melbourne'),
  ('ce000000-0000-0000-0000-000000000103', 'ce000000-0000-0000-0000-000000000102', 'South East'),
  ('ce000000-0000-0000-0000-000000000104', 'ce000000-0000-0000-0000-000000000102', 'North'),
  ('ce000000-0000-0000-0000-000000000105', 'ce000000-0000-0000-0000-000000000100', 'Queensland');
insert into public.branch_stewards (branch_id, user_id) values
  ('ce000000-0000-0000-0000-000000000102', 'ce000000-0000-0000-0000-000000000005');

insert into public.groups (id, name, created_by, branch_id) values
  ('ce000000-0000-0000-0000-000000000200', 'RB SE circle', 'ce000000-0000-0000-0000-00000000000a', 'ce000000-0000-0000-0000-000000000103'),
  ('ce000000-0000-0000-0000-000000000201', 'RB North circle', 'ce000000-0000-0000-0000-00000000000d', null),
  ('ce000000-0000-0000-0000-000000000202', 'RB QLD circle', 'ce000000-0000-0000-0000-00000000000c', 'ce000000-0000-0000-0000-000000000105');
insert into public.memberships (user_id, group_id, role) values
  ('ce000000-0000-0000-0000-00000000000a', 'ce000000-0000-0000-0000-000000000200', 'owner'),
  ('ce000000-0000-0000-0000-00000000000d', 'ce000000-0000-0000-0000-000000000201', 'owner'),
  ('ce000000-0000-0000-0000-00000000000c', 'ce000000-0000-0000-0000-000000000202', 'owner');

insert into public.roadmaps (id, name, starts_on, ends_on, published) values
  ('ce000000-0000-0000-0000-000000000300', 'RB Roadmap', current_date, current_date + 300, true);

-- ---- 1. who may assign -----------------------------------------------------
select pg_temp.impersonate('ce000000-0000-0000-0000-000000000005');
select throws_ok(
  $$ select public.set_branch_on_roadmap('ce000000-0000-0000-0000-000000000300',
       'ce000000-0000-0000-0000-000000000102', true) $$,
  'organisers only', 'a steward cannot assign a roadmap, even to their own branch');
select pg_temp.reset_role();

-- ---- 2. assigning reaches the subtree, not beside it -----------------------
select pg_temp.impersonate('ce000000-0000-0000-0000-00000000000f');
select lives_ok(
  $$ select public.set_branch_on_roadmap('ce000000-0000-0000-0000-000000000300',
       'ce000000-0000-0000-0000-000000000102', true) $$,
  'an organiser assigns the roadmap to Melbourne');
select pg_temp.reset_role();

select is(
  (select via_branch from public.group_roadmaps
    where group_id = 'ce000000-0000-0000-0000-000000000200'
      and roadmap_id = 'ce000000-0000-0000-0000-000000000300'),
  'ce000000-0000-0000-0000-000000000102'::uuid,
  'the South East circle, under Melbourne, follows it through Melbourne');
select is(
  (select count(*)::int from public.group_roadmaps
    where group_id = 'ce000000-0000-0000-0000-000000000202'),
  0, 'the Queensland circle, beside Melbourne, does not');

-- ---- 3. a circle that joins later picks it up ------------------------------
update public.groups set branch_id = 'ce000000-0000-0000-0000-000000000104'
 where id = 'ce000000-0000-0000-0000-000000000201';
select is(
  (select via_branch from public.group_roadmaps
    where group_id = 'ce000000-0000-0000-0000-000000000201'
      and roadmap_id = 'ce000000-0000-0000-0000-000000000300'),
  'ce000000-0000-0000-0000-000000000102'::uuid,
  'the North circle follows it the moment it joins North');

-- ---- 4. the nearest branch wins, and re-points on removal ------------------
select pg_temp.impersonate('ce000000-0000-0000-0000-00000000000f');
select public.set_branch_on_roadmap('ce000000-0000-0000-0000-000000000300',
  'ce000000-0000-0000-0000-000000000100', true);
select pg_temp.reset_role();
select is(
  (select via_branch from public.group_roadmaps
    where group_id = 'ce000000-0000-0000-0000-000000000200'
      and roadmap_id = 'ce000000-0000-0000-0000-000000000300'),
  'ce000000-0000-0000-0000-000000000102'::uuid,
  'with the root assigned too, SE still names the nearer branch, Melbourne');
select is(
  (select via_branch from public.group_roadmaps
    where group_id = 'ce000000-0000-0000-0000-000000000202'),
  'ce000000-0000-0000-0000-000000000100'::uuid,
  'and Queensland now follows through the root');

select pg_temp.impersonate('ce000000-0000-0000-0000-00000000000f');
select public.set_branch_on_roadmap('ce000000-0000-0000-0000-000000000300',
  'ce000000-0000-0000-0000-000000000102', false);
select pg_temp.reset_role();
select is(
  (select via_branch from public.group_roadmaps
    where group_id = 'ce000000-0000-0000-0000-000000000200'
      and roadmap_id = 'ce000000-0000-0000-0000-000000000300'),
  'ce000000-0000-0000-0000-000000000100'::uuid,
  'removing Melbourne re-points SE to the root rather than dropping it');

select pg_temp.impersonate('ce000000-0000-0000-0000-00000000000f');
select public.set_branch_on_roadmap('ce000000-0000-0000-0000-000000000300',
  'ce000000-0000-0000-0000-000000000100', false);
select pg_temp.reset_role();
select is(
  (select count(*)::int from public.group_roadmaps
    where roadmap_id = 'ce000000-0000-0000-0000-000000000300'),
  0, 'with no branch assigned, no circle follows through a branch');

-- ---- 5. a direct follow survives -------------------------------------------
insert into public.group_roadmaps (group_id, roadmap_id) values
  ('ce000000-0000-0000-0000-000000000200', 'ce000000-0000-0000-0000-000000000300');
select pg_temp.impersonate('ce000000-0000-0000-0000-00000000000f');
select public.set_branch_on_roadmap('ce000000-0000-0000-0000-000000000300',
  'ce000000-0000-0000-0000-000000000102', true);
select public.set_branch_on_roadmap('ce000000-0000-0000-0000-000000000300',
  'ce000000-0000-0000-0000-000000000102', false);
select pg_temp.reset_role();
select is(
  (select count(*)::int from public.group_roadmaps
    where group_id = 'ce000000-0000-0000-0000-000000000200'
      and roadmap_id = 'ce000000-0000-0000-0000-000000000300'
      and via_branch is null),
  1, 'a circle that followed directly still follows after the branch assignment goes');

-- ---- 6. a circle admin cannot drop a branch row ----------------------------
select pg_temp.impersonate('ce000000-0000-0000-0000-00000000000f');
select public.set_branch_on_roadmap('ce000000-0000-0000-0000-000000000300',
  'ce000000-0000-0000-0000-000000000104', true);
select pg_temp.reset_role();

select pg_temp.impersonate('ce000000-0000-0000-0000-00000000000d');
delete from public.group_roadmaps
 where group_id = 'ce000000-0000-0000-0000-000000000201';
select pg_temp.reset_role();
select is(
  (select count(*)::int from public.group_roadmaps
    where group_id = 'ce000000-0000-0000-0000-000000000201'),
  1, 'the North owner''s delete removes nothing: the row is the branch''s');

select pg_temp.impersonate('ce000000-0000-0000-0000-00000000000d');
select throws_ok(
  $$ insert into public.group_roadmaps (group_id, roadmap_id, via_branch) values
       ('ce000000-0000-0000-0000-000000000201', 'ce000000-0000-0000-0000-000000000300',
        'ce000000-0000-0000-0000-000000000104') $$,
  '42501', null, 'and cannot forge one');
select results_eq(
  $$ select b.name from public.branch_roadmaps br join public.branches b on b.id = br.branch_id
      where br.roadmap_id = 'ce000000-0000-0000-0000-000000000300' $$,
  $$ values ('North'::text) $$,
  'a member reached by the branch can read which branch set it');
select pg_temp.reset_role();

select pg_temp.impersonate('ce000000-0000-0000-0000-00000000000f');
select throws_like(
  $$ select public.set_circle_on_roadmap('ce000000-0000-0000-0000-000000000300',
       'ce000000-0000-0000-0000-000000000201', false) $$,
  'this circle follows it through North%',
  'the organiser''s circle switch explains instead of removing a branch row');
select results_eq(
  $$ select name, following, via_branch_name from public.roadmap_circles('ce000000-0000-0000-0000-000000000300')
      where name like 'RB %' order by name $$,
  $$ values ('RB North circle'::text, true, 'North'::text),
            ('RB QLD circle'::text, false, null::text),
            ('RB SE circle'::text, true, null::text) $$,
  'roadmap_circles says why each circle follows');
select pg_temp.reset_role();

-- ---- 7. leaving the branch stops it ----------------------------------------
update public.groups set branch_id = null
 where id = 'ce000000-0000-0000-0000-000000000201';
select is(
  (select count(*)::int from public.group_roadmaps
    where group_id = 'ce000000-0000-0000-0000-000000000201'),
  0, 'a circle that leaves the branch stops following through it');

select ok(not has_table_privilege('authenticated', 'public.branch_roadmaps', 'insert'),
  'nobody writes branch_roadmaps from the client');
select ok(not has_function_privilege('anon', 'public.set_branch_on_roadmap(uuid, uuid, boolean)', 'execute'),
  'anon cannot call set_branch_on_roadmap');

-- ---- 8. camp details (0045) ------------------------------------------------
select pg_temp.impersonate('ce000000-0000-0000-0000-000000000005');
create temporary table camp_ids (v uuid);
grant all on camp_ids to authenticated;
insert into camp_ids select public.save_camp(null, 'ce000000-0000-0000-0000-000000000102',
  'RB Camp', '', 'Hall', now() + interval '10 days', now() + interval '12 days',
  'Australia/Melbourne', null, 40, 'draft',
  '  $120  ', array['Sleeping bag', '  ', ' Torch '], ' Yusuf ', '0400 000 000',
  '[{"day":1,"time":"09:00","label":"Arrive"},{"day":2,"time":"","label":"Hike"}]'::jsonb);
select results_eq(
  $$ select cost, bring, contact_name, jsonb_array_length(schedule)
       from public.events where id = (select v from camp_ids) $$,
  $$ values ('$120'::text, array['Sleeping bag', 'Torch']::text[], 'Yusuf'::text, 2) $$,
  'a camp''s details round-trip, trimmed, with blank lines dropped');
select throws_ok(
  $$ select public.save_camp(null, 'ce000000-0000-0000-0000-000000000102',
       'Bad', '', '', now() + interval '10 days', now() + interval '11 days',
       'Australia/Melbourne', null, null, 'draft', '', null, '', '',
       '[{"day":0,"time":"25:00","label":""}]'::jsonb) $$,
  '23514', null, 'a malformed schedule is refused');
select lives_ok(
  $$ select public.save_camp(null, 'ce000000-0000-0000-0000-000000000102',
       'Old caller', '', '', now() + interval '10 days', now() + interval '11 days',
       'Australia/Melbourne', null, null, 'draft') $$,
  'a caller that predates 0045 still saves a camp');
select pg_temp.reset_role();

-- ---- 9. branch_reach (0046) ------------------------------------------------
-- Assign the roadmap at the root, so Melbourne's steward sees it as inherited.
select pg_temp.impersonate('ce000000-0000-0000-0000-00000000000f');
select public.set_branch_on_roadmap('ce000000-0000-0000-0000-000000000300',
  'ce000000-0000-0000-0000-000000000100', true);
select public.save_camp(null, 'ce000000-0000-0000-0000-000000000100',
  'Root camp', '', '', now() + interval '5 days', now() + interval '6 days',
  'Australia/Melbourne', null, null, 'published');
select public.save_camp(null, 'ce000000-0000-0000-0000-000000000100',
  'Root draft', '', '', now() + interval '5 days', now() + interval '6 days',
  'Australia/Melbourne', null, null, 'draft');
select pg_temp.reset_role();

select pg_temp.impersonate('ce000000-0000-0000-0000-000000000005');
select results_eq(
  $$ select kind, title, from_branch_name, inherited from public.branch_reach('ce000000-0000-0000-0000-000000000104')
      where title in ('RB Roadmap', 'Root camp', 'Root draft', 'RB Camp') order by title, inherited $$,
  -- 'RB Camp' is a DRAFT in Melbourne (section 8), so North does not list it.
  -- The roadmap shows twice: North's own assignment (section 6) and the root's.
  $$ values ('roadmap'::text, 'RB Roadmap'::text, 'North'::text, false),
            ('roadmap'::text, 'RB Roadmap'::text, 'RB Nexus'::text, true),
            ('camp'::text, 'Root camp'::text, 'RB Nexus'::text, true) $$,
  'a steward sees what reaches North from above, and no draft from above');
select throws_ok(
  $$ select * from public.branch_reach('ce000000-0000-0000-0000-000000000105') $$,
  'you do not run that branch', 'and is refused for a branch beside theirs');
select pg_temp.reset_role();

select pg_temp.impersonate('ce000000-0000-0000-0000-00000000000f');
select results_eq(
  $$ select count(*)::int from public.branch_reach('ce000000-0000-0000-0000-000000000100')
      where title = 'Root draft' and not inherited $$,
  $$ values (1) $$,
  'the branch''s own draft shows on its own page');
select pg_temp.reset_role();

select * from finish();
rollback;
