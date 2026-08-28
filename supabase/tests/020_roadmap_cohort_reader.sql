-- ============================================================================
-- Logic + grants test suite — 0035 (who may read a programme's cohort, D69)
-- ----------------------------------------------------------------------------
-- `can_read_roadmap_cohort` gates the SCREEN, not the rows: it answers "may
-- this person read everyone's progress on this programme", where the policy on
-- `roadmap_progress` goes on answering "which rows". The two must agree about
-- the third reader, so what is asserted here is the pairing:
--
--   * an owner of a circle that FOLLOWS it — true
--   * a co-admin of that circle — true (D26: both manage the circle)
--   * a plain MEMBER of that circle — FALSE, and this is the whole decision.
--     They can still read their own progress row, which is what draws their own
--     roadmap screen, and that is asserted here too so the two cannot be
--     confused for one another by a later edit
--   * an owner whose circle does NOT follow it — false. The same negative that
--     distinguishes the progress policy from `shares_group_as_admin` (014)
--   * a super admin in no circle at all — true
--   * an unpublished programme nobody follows — false for a circle owner
--   * grants: `anon` cannot execute it
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture — deliberately 014's shape, so the two suites describe one world
-- ----------------------------------------------------------------------------
--   R (published), U (unpublished)
--   G1 follows R  — owner A, co-admin C, member B
--   G2 does NOT   — owner E, member B   ← B is in both, on purpose
--   S             — super admin, in no circle

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('c9000000-0000-0000-0000-00000000000a', 'a@cohort.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('c9000000-0000-0000-0000-00000000000b', 'b@cohort.test', '{"name":"B"}', 'authenticated', 'authenticated'),
  ('c9000000-0000-0000-0000-00000000000c', 'c@cohort.test', '{"name":"C"}', 'authenticated', 'authenticated'),
  ('c9000000-0000-0000-0000-00000000000e', 'e@cohort.test', '{"name":"E"}', 'authenticated', 'authenticated'),
  ('c9000000-0000-0000-0000-00000000000f', 's@cohort.test', '{"name":"S"}', 'authenticated', 'authenticated');

update public.profiles set is_super_admin = true
  where id = 'c9000000-0000-0000-0000-00000000000f';

insert into public.roadmaps (id, name, starts_on, ends_on, published) values
  ('c9000000-0000-0000-0000-0000000000a1', 'Cohort programme', current_date - 30, current_date + 30, true),
  ('c9000000-0000-0000-0000-0000000000a2', 'Staged programme', current_date + 31, current_date + 400, false);

insert into public.roadmap_items (id, roadmap_id, level, category, title, unit, target, compulsory, sort_order) values
  ('c9000000-0000-0000-0000-0000000000b1', 'c9000000-0000-0000-0000-0000000000a1', 1, 'book', 'Nur al-Idah', 'chapters', 3, false, 1);

insert into public.groups (id, name, created_by) values
  ('c9000000-0000-0000-0000-0000000000d1', 'Follows',  'c9000000-0000-0000-0000-00000000000a'),
  ('c9000000-0000-0000-0000-0000000000d2', 'Does not', 'c9000000-0000-0000-0000-00000000000e');

insert into public.group_roadmaps (group_id, roadmap_id) values
  ('c9000000-0000-0000-0000-0000000000d1', 'c9000000-0000-0000-0000-0000000000a1');

insert into public.memberships (user_id, group_id, role) values
  ('c9000000-0000-0000-0000-00000000000a', 'c9000000-0000-0000-0000-0000000000d1', 'owner'),
  ('c9000000-0000-0000-0000-00000000000c', 'c9000000-0000-0000-0000-0000000000d1', 'admin'),
  ('c9000000-0000-0000-0000-00000000000b', 'c9000000-0000-0000-0000-0000000000d1', 'member'),
  ('c9000000-0000-0000-0000-00000000000e', 'c9000000-0000-0000-0000-0000000000d2', 'owner'),
  ('c9000000-0000-0000-0000-00000000000b', 'c9000000-0000-0000-0000-0000000000d2', 'member');

-- B has recorded something, so the "a member still reads their OWN row" check
-- below has a real row to find rather than passing vacuously.
insert into public.roadmap_progress (user_id, item_id, done) values
  ('c9000000-0000-0000-0000-00000000000b', 'c9000000-0000-0000-0000-0000000000b1', 2);

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
-- 1. The three readers of the cohort
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c9000000-0000-0000-0000-00000000000a');
select ok(public.can_read_roadmap_cohort('c9000000-0000-0000-0000-0000000000a1'),
  'A, OWNER of a circle that follows the programme, may read the cohort');

select pg_temp.impersonate('c9000000-0000-0000-0000-00000000000c');
select ok(public.can_read_roadmap_cohort('c9000000-0000-0000-0000-0000000000a1'),
  'C, CO-ADMIN of that circle, may read it too — D26 gives both the same reach');

select pg_temp.impersonate('c9000000-0000-0000-0000-00000000000f');
select ok(public.can_read_roadmap_cohort('c9000000-0000-0000-0000-0000000000a1'),
  'S, a super admin in NO circle, may read it — the organiser''s own report');

-- ----------------------------------------------------------------------------
-- 2. The negatives — the decision itself
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c9000000-0000-0000-0000-00000000000b');

select ok(not public.can_read_roadmap_cohort('c9000000-0000-0000-0000-0000000000a1'),
  'B, a plain MEMBER of the following circle, may NOT read the cohort (D69)');

-- ...and the pairing that keeps the two questions apart. Losing the report must
-- not cost a member their own record, which is what their roadmap screen draws.
select is((select done from public.roadmap_progress
            where user_id = 'c9000000-0000-0000-0000-00000000000b'
              and item_id = 'c9000000-0000-0000-0000-0000000000b1'), 2,
  '...while still reading their OWN progress row, unchanged');

select pg_temp.impersonate('c9000000-0000-0000-0000-00000000000e');
select ok(not public.can_read_roadmap_cohort('c9000000-0000-0000-0000-0000000000a1'),
  'E OWNS a circle and shares one with B, but that circle does not FOLLOW the '
  'programme — no cohort. The negative that distinguishes this from '
  '"shares a group as admin"');

select pg_temp.impersonate('c9000000-0000-0000-0000-00000000000a');
select ok(not public.can_read_roadmap_cohort('c9000000-0000-0000-0000-0000000000a2'),
  'A leads a circle, but nothing follows the UNPUBLISHED programme — no cohort');

select ok(not public.can_read_roadmap_cohort('c9000000-0000-0000-0000-0000000000f9'),
  'an id that names no programme is simply false, never an error');

-- ----------------------------------------------------------------------------
-- 3. Grants — signed in only
-- ----------------------------------------------------------------------------

select pg_temp.reset_role();

select function_privs_are('public', 'can_read_roadmap_cohort', array['uuid'],
  'authenticated', array['EXECUTE'],
  'authenticated may execute it — both roadmap screens call it directly');

select function_privs_are('public', 'can_read_roadmap_cohort', array['uuid'],
  'anon', array[]::text[],
  '...and anon may not');

select * from finish();
rollback;
