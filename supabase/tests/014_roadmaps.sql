-- ============================================================================
-- Logic + grants test suite — 0025 (roadmaps, D55)
-- ----------------------------------------------------------------------------
-- Covers:
--   * the SHAPE that carries the decision — progress is keyed (member, item)
--     and there is no group column anywhere on it, so a member in two circles
--     following one programme has one record and not two
--   * the catalogue split: a published roadmap's NAME is readable by anyone
--     signed in (the picker has to render options it does not yet follow),
--     while its ITEMS and REWARDS are gated on actually following it
--   * an unpublished roadmap is invisible — that is how next year is staged
--   * THE NEGATIVE THAT CARRIES THE PRIVACY DECISION — an admin who shares a
--     circle with someone but whose circle does NOT follow the roadmap reads
--     nothing. This is the assertion that distinguishes the real predicate from
--     `private.shares_group_as_admin`, which would have passed everything else
--   * THE NEGATIVE THAT KEEPS D26/D27 — a super admin reads roadmap progress
--     and STILL reaches no logs, no streaks, no daily_completion. The roadmap
--     report is a view over the programme, never over circles
--   * the RPC: clamps both ends to the item's own target, refuses an item on a
--     programme the caller does not follow, and writes only the caller's row
--   * grants: read-only on all four tables, for every path except the RPC
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture
-- ----------------------------------------------------------------------------
-- Roadmap R (published) with two items and one reward; roadmap U (unpublished).
--
--   G1 follows R  — owner A, member B
--   G2 does NOT   — admin E, member B   ← B is in both, on purpose
--   G3 follows R  — owner D
--   S             — super admin, in no circle at all
--
-- B being in both G1 and G2 is the whole point of the fixture: E is an admin
-- who genuinely shares a circle with B, and must still read nothing, because
-- the circle they share does not follow the programme.

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('c5000000-0000-0000-0000-00000000000a', 'a@road.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('c5000000-0000-0000-0000-00000000000b', 'b@road.test', '{"name":"B"}', 'authenticated', 'authenticated'),
  ('c5000000-0000-0000-0000-00000000000d', 'd@road.test', '{"name":"D"}', 'authenticated', 'authenticated'),
  ('c5000000-0000-0000-0000-00000000000e', 'e@road.test', '{"name":"E"}', 'authenticated', 'authenticated'),
  ('c5000000-0000-0000-0000-00000000000f', 's@road.test', '{"name":"S"}', 'authenticated', 'authenticated');

update public.profiles set is_super_admin = true
  where id = 'c5000000-0000-0000-0000-00000000000f';

insert into public.roadmaps (id, name, starts_on, ends_on, published) values
  ('c5000000-0000-0000-0000-0000000000a1', '2026 programme', current_date - 60, current_date + 60, true),
  ('c5000000-0000-0000-0000-0000000000a2', '2027 programme', current_date + 61, current_date + 400, false);

insert into public.roadmap_items (id, roadmap_id, kind, title, unit, target, sort_order) values
  ('c5000000-0000-0000-0000-0000000000b1', 'c5000000-0000-0000-0000-0000000000a1', 'read',  'Nur al-Idah',  'chapters', 3, 1),
  ('c5000000-0000-0000-0000-0000000000b2', 'c5000000-0000-0000-0000-0000000000a1', 'custom', 'Winter retreat', 'sessions', 1, 2),
  ('c5000000-0000-0000-0000-0000000000b9', 'c5000000-0000-0000-0000-0000000000a2', 'read',  'Next year',    'chapters', 5, 1);

insert into public.roadmap_rewards (id, roadmap_id, threshold, label) values
  ('c5000000-0000-0000-0000-0000000000c1', 'c5000000-0000-0000-0000-0000000000a1', 2, 'Retreat place held');

insert into public.groups (id, name, created_by, roadmap_id) values
  ('c5000000-0000-0000-0000-0000000000d1', 'Follows',     'c5000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-0000000000a1'),
  ('c5000000-0000-0000-0000-0000000000d2', 'Does not',    'c5000000-0000-0000-0000-00000000000e', null),
  ('c5000000-0000-0000-0000-0000000000d3', 'Also follows','c5000000-0000-0000-0000-00000000000d', 'c5000000-0000-0000-0000-0000000000a1');

insert into public.memberships (user_id, group_id, role) values
  ('c5000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-0000000000d1', 'owner'),
  ('c5000000-0000-0000-0000-00000000000b', 'c5000000-0000-0000-0000-0000000000d1', 'member'),
  ('c5000000-0000-0000-0000-00000000000e', 'c5000000-0000-0000-0000-0000000000d2', 'owner'),
  ('c5000000-0000-0000-0000-00000000000b', 'c5000000-0000-0000-0000-0000000000d2', 'member'),
  ('c5000000-0000-0000-0000-00000000000d', 'c5000000-0000-0000-0000-0000000000d3', 'owner');

-- A task + a log + a streak for B, so the super-admin negative below has real
-- rows to fail to reach. Without these it would pass vacuously.
insert into public.tasks (id, group_id, label, target_count, frequency_days) values
  ('c5000000-0000-0000-0000-0000000000e1', 'c5000000-0000-0000-0000-0000000000d1', 'Ratib', 33, 1);

insert into public.logs (user_id, task_id, date, count) values
  ('c5000000-0000-0000-0000-00000000000b', 'c5000000-0000-0000-0000-0000000000e1', current_date, 33);

-- Upsert, not insert: a profile already owns a streaks row by the time we get
-- here, so a plain insert collides on the PK.
insert into public.streaks (user_id, current, longest, last_active) values
  ('c5000000-0000-0000-0000-00000000000b', 7, 9, current_date)
on conflict (user_id) do update
  set current = 7, longest = 9, last_active = current_date;

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
-- 1. The shape — progress belongs to the MEMBER, not to a circle
-- ----------------------------------------------------------------------------

select has_column('public', 'roadmap_progress', 'user_id', 'progress is keyed on the member');
select has_column('public', 'roadmap_progress', 'item_id', '...and on the item');

-- The assertion the whole decision rests on. A group column here would mean a
-- member in two circles following one programme keeps two ledgers and can
-- answer "have you finished the book" two different ways.
select hasnt_column('public', 'roadmap_progress', 'group_id',
  'roadmap_progress has NO group column — one member, one record, per item');

select col_is_pk('public', 'roadmap_progress', array['user_id', 'item_id'],
  '...and (member, item) is the primary key, so a second record is impossible');

-- ----------------------------------------------------------------------------
-- 2. The catalogue — names are open, content is gated on following
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000e');

select is((select count(*) from public.roadmaps
            where id = 'c5000000-0000-0000-0000-0000000000a1'), 1::bigint,
  'E, whose circle follows nothing, still SEES the published roadmap''s name — '
  'the opt-in picker has to render options it does not yet follow');

select is((select count(*) from public.roadmap_items
            where roadmap_id = 'c5000000-0000-0000-0000-0000000000a1'), 0::bigint,
  '...but reads NONE of its items');

select is((select count(*) from public.roadmap_rewards
            where roadmap_id = 'c5000000-0000-0000-0000-0000000000a1'), 0::bigint,
  '...and none of its rewards — the rewards are the administration''s promises, '
  'and a circle it never enrolled must not be reading what it is offering');

select is((select count(*) from public.roadmaps
            where id = 'c5000000-0000-0000-0000-0000000000a2'), 0::bigint,
  'an UNPUBLISHED roadmap is invisible — that is how next year is staged early');

select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 3. A follower reads the content
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000b');

select is((select count(*) from public.roadmap_items
            where roadmap_id = 'c5000000-0000-0000-0000-0000000000a1'), 2::bigint,
  'B, in a circle that follows R, reads its items');

select is((select count(*) from public.roadmap_rewards
            where roadmap_id = 'c5000000-0000-0000-0000-0000000000a1'), 1::bigint,
  '...and its rewards');

select is((select count(*) from public.roadmap_items
            where roadmap_id = 'c5000000-0000-0000-0000-0000000000a2'), 0::bigint,
  '...and still nothing from the unpublished one');

-- ----------------------------------------------------------------------------
-- 4. The RPC — the only writer, clamped at both ends
-- ----------------------------------------------------------------------------

select is(public.set_roadmap_progress('c5000000-0000-0000-0000-0000000000b1', 2), 2,
  'B records 2 of 3 chapters and gets the stored value back (reconcile, not refetch)');

select is((select done from public.roadmap_progress
            where user_id = 'c5000000-0000-0000-0000-00000000000b'
              and item_id = 'c5000000-0000-0000-0000-0000000000b1'), 2,
  '...and the row holds it');

select is(public.set_roadmap_progress('c5000000-0000-0000-0000-0000000000b1', 99), 3,
  'over-recording clamps to the item''s own target, server-side');

select is(public.set_roadmap_progress('c5000000-0000-0000-0000-0000000000b1', -5), 0,
  '...and under-recording clamps to zero — recording is reversible, never negative');

select is((select count(*) from public.roadmap_progress
            where user_id = 'c5000000-0000-0000-0000-00000000000b'), 1::bigint,
  'three writes to one item leave ONE row, not three');

select pg_temp.reset_role();

-- A circle that does not follow the programme cannot record against it, and the
-- refusal carries no oracle: a missing item and a forbidden one read alike.
select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000e');

select throws_ok(
  $$select public.set_roadmap_progress('c5000000-0000-0000-0000-0000000000b1', 1)$$,
  'roadmap item not found',
  'E cannot record against a programme E''s circle does not follow');

select throws_ok(
  $$select public.set_roadmap_progress('c5000000-0000-0000-0000-0000000000b9', 1)$$,
  'roadmap item not found',
  '...and an unpublished programme''s item fails identically — no oracle');

select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 5. Who reads progress — the member, their circle's admin, a super admin
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000b');
select is((select count(*) from public.roadmap_progress), 1::bigint,
  'B reads B''s own progress');
select pg_temp.reset_role();

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000a');
select is((select count(*) from public.roadmap_progress
            where user_id = 'c5000000-0000-0000-0000-00000000000b'), 1::bigint,
  'A, owner of the circle that follows R and holds B, reads B''s progress — '
  'A is the one handing over the kitab set at the halaqah');
select pg_temp.reset_role();

-- THE NEGATIVE THAT CARRIES THE PRIVACY DECISION.
-- E is an admin. E genuinely shares a circle with B (G2). E must still read
-- nothing, because G2 does not follow R. `shares_group_as_admin` would have
-- returned true here and leaked it.
select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000e');
select is((select count(*) from public.roadmap_progress), 0::bigint,
  'E shares a circle with B and is its admin, but that circle follows NOTHING — '
  'so E reads no roadmap progress at all');
select pg_temp.reset_role();

-- D owns a circle that follows the SAME roadmap, but B is not in it. Following
-- a programme is not membership of every circle on it.
select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000d');
select is((select count(*) from public.roadmap_progress), 0::bigint,
  'D follows the same roadmap but B is not in D''s circle — D reads nothing');
select pg_temp.reset_role();

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000f');
select is((select count(*) from public.roadmap_progress
            where user_id = 'c5000000-0000-0000-0000-00000000000b'), 1::bigint,
  'the super admin reads it — the retreat place and the ijazah sitting are '
  'awarded centrally, and no circle admin can see across circles');

-- ----------------------------------------------------------------------------
-- 6. THE NEGATIVE THAT KEEPS "NO GOD VIEW" (D26/D27)
-- ----------------------------------------------------------------------------
-- Still impersonating the super admin. Reading roadmap progress must open no
-- door onto the private life of a circle. This is the assertion that makes the
-- boundary checkable rather than a promise in a comment.

select is((select count(*) from public.logs
            where user_id = 'c5000000-0000-0000-0000-00000000000b'), 0::bigint,
  'the super admin reads roadmap progress and STILL reaches no logs');

select is((select count(*) from public.streaks
            where user_id = 'c5000000-0000-0000-0000-00000000000b'), 0::bigint,
  '...no streaks');

select is((select count(*) from public.daily_completion
            where user_id = 'c5000000-0000-0000-0000-00000000000b'), 0::bigint,
  '...and no daily_completion. The report is a view over the PROGRAMME, never '
  'over circles');

select is((select count(*) from public.groups
            where id = 'c5000000-0000-0000-0000-0000000000d1'), 0::bigint,
  '...and not even the circle itself — following a roadmap is not a way in');

select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 7. Grants — read-only everywhere, writes only through the RPC
-- ----------------------------------------------------------------------------

select ok(has_table_privilege('authenticated', 'public.roadmaps', 'select'),
  'authenticated may read roadmaps');

select ok(not has_table_privilege('authenticated', 'public.roadmaps', 'insert')
      and not has_table_privilege('authenticated', 'public.roadmaps', 'update')
      and not has_table_privilege('authenticated', 'public.roadmaps', 'delete'),
  'roadmaps are authored by MIGRATION — no client write grant of any kind');

select ok(not has_table_privilege('authenticated', 'public.roadmap_items', 'insert')
      and not has_table_privilege('authenticated', 'public.roadmap_items', 'update')
      and not has_table_privilege('authenticated', 'public.roadmap_items', 'delete'),
  '...same for items');

select ok(not has_table_privilege('authenticated', 'public.roadmap_rewards', 'insert')
      and not has_table_privilege('authenticated', 'public.roadmap_rewards', 'update')
      and not has_table_privilege('authenticated', 'public.roadmap_rewards', 'delete'),
  '...same for rewards');

-- The one that matters most: without this, a member could PostgREST-upsert
-- `done` to anything for any item, including one on a programme they do not
-- follow. The RPC is the only writer precisely because it clamps and checks.
select ok(not has_table_privilege('authenticated', 'public.roadmap_progress', 'insert')
      and not has_table_privilege('authenticated', 'public.roadmap_progress', 'update')
      and not has_table_privilege('authenticated', 'public.roadmap_progress', 'delete'),
  'progress is RPC-only — no direct write grant, so nobody can set an unclamped '
  'value or write a row for an item they do not follow');

select ok(has_function_privilege('authenticated',
  'public.set_roadmap_progress(uuid, integer)', 'execute'),
  'set_roadmap_progress is the sanctioned path');

select ok(not has_function_privilege('anon',
  'public.set_roadmap_progress(uuid, integer)', 'execute'),
  '...and anon holds no execute on it');


-- The opt-in itself: an admin may point their circle at a programme, a member
-- may not. The authority is the existing groups_update_admin policy plus the
-- column grant — no new policy, same shape as renaming a circle.
select ok(has_column_privilege('authenticated', 'public.groups', 'roadmap_id', 'update'),
  'roadmap_id is client-updatable — the opt-in is an ordinary admin act');

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000b');
update public.groups set roadmap_id = null
  where id = 'c5000000-0000-0000-0000-0000000000d1';
select pg_temp.reset_role();

select is((select roadmap_id from public.groups
            where id = 'c5000000-0000-0000-0000-0000000000d1'),
  'c5000000-0000-0000-0000-0000000000a1'::uuid,
  'a MEMBER cannot un-follow the circle''s programme — RLS filters the row, so '
  'the update is a silent no-op rather than an error');

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000a');
update public.groups set roadmap_id = null
  where id = 'c5000000-0000-0000-0000-0000000000d1';
select pg_temp.reset_role();

select is((select roadmap_id from public.groups
            where id = 'c5000000-0000-0000-0000-0000000000d1'), null::uuid,
  '...and the OWNER can');

select * from finish();
rollback;
