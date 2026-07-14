-- ============================================================================
-- RLS + grants + logic test suite — the v2 retention layer (CET-17…22, 0015)
-- ----------------------------------------------------------------------------
-- Covers:
--   * grant/RLS posture: reactions are RPC-only writes, readable ONLY inside
--     the circle they were sent in; badge_awards are read-only to every client
--     (an award you could INSERT yourself would not be "earned"); dismissals
--     are self-only and stamp their own timestamp; anon gets nothing
--   * toggle_reaction: sends · un-sends on a second tap (the unique key IS the
--     toggle) · refuses a self-reaction · refuses a non-member peer · refuses a
--     circle you are not in · stamps the SENDER's local date (not a client one)
--   * badge awards: evaluated against the real thresholds · idempotent ·
--     PERMANENT — a badge survives the consistency that earned it collapsing
--     (D43: un-earning a badge would be a punishment mechanic, against D8/D28)
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture: a + b share circle g1. c sits in a SEPARATE circle g2 (the isolation
-- probe). t1 is g1's only task (target 100).
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('c9000000-0000-0000-0000-00000000000a', 'a@v2.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('c9000000-0000-0000-0000-00000000000b', 'b@v2.test', '{"name":"B"}', 'authenticated', 'authenticated'),
  ('c9000000-0000-0000-0000-00000000000c', 'c@v2.test', '{"name":"C"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('c9000000-0000-0000-0000-00000000d001', 'V2 Circle',  'c9000000-0000-0000-0000-00000000000a'),
  ('c9000000-0000-0000-0000-00000000d002', 'Other Circle','c9000000-0000-0000-0000-00000000000c');

insert into public.memberships (user_id, group_id, role) values
  ('c9000000-0000-0000-0000-00000000000a', 'c9000000-0000-0000-0000-00000000d001', 'owner'),
  ('c9000000-0000-0000-0000-00000000000b', 'c9000000-0000-0000-0000-00000000d001', 'member'),
  ('c9000000-0000-0000-0000-00000000000c', 'c9000000-0000-0000-0000-00000000d002', 'owner');

insert into public.tasks (id, group_id, label, target_count) values
  ('c9000000-0000-0000-0000-00000000e001', 'c9000000-0000-0000-0000-00000000d001', 'Tasbih', 100);

create function pg_temp.impersonate(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.unimpersonate() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ----------------------------------------------------------------------------
-- Grant posture (standard #6)
-- ----------------------------------------------------------------------------
select ok(has_table_privilege('authenticated','public.reactions','select'),
  'reactions readable (RLS-scoped to the circle)');
-- The toggle is a read-then-insert-or-delete: a client cannot do that atomically
-- (a double-tap races into a duplicate or a lost undo), and `date` must be
-- stamped from the sender's timezone rather than trusted.
select ok(not has_table_privilege('authenticated','public.reactions','insert'),
  'reactions INSERT is RPC-only');
select ok(not has_table_privilege('authenticated','public.reactions','update'),
  'reactions are immutable (no UPDATE)');
select ok(has_function_privilege('authenticated','public.toggle_reaction(uuid,uuid,text)','execute'),
  'toggle_reaction is the write path');
select ok(not has_table_privilege('anon','public.reactions','select'),
  'anon has no reactions read');

select ok(has_table_privilege('authenticated','public.badge_awards','select'),
  'my badges are readable');
select ok(not has_table_privilege('authenticated','public.badge_awards','insert'),
  'a badge cannot be self-awarded (INSERT is not granted to anyone)');
select ok(not has_table_privilege('authenticated','public.badge_awards','delete'),
  'a badge cannot be deleted away (D43: earned is permanent)');
select ok(not has_function_privilege('authenticated','private.evaluate_badges(uuid,uuid)','execute'),
  'the evaluator is job/definer-only');
select ok(has_function_privilege('authenticated','public.sync_badges(uuid)','execute'),
  'sync_badges is the client entry point');

select ok(has_table_privilege('authenticated','public.badges','select'),
  'the badge catalog is readable (locked badges show as aspirations)');
select ok(not has_table_privilege('authenticated','public.badges','insert'),
  'the catalog is not client-writable');

select ok(has_column_privilege('authenticated','public.banner_dismissals','key','insert'),
  'a member can dismiss a banner');
select ok(not has_column_privilege('authenticated','public.banner_dismissals','dismissed_at','insert'),
  'dismissed_at is stamped by the DB, never by the client');
select ok(not has_table_privilege('authenticated','public.banner_dismissals','delete'),
  'a dismissal is a fact, not a setting (no DELETE)');

-- ----------------------------------------------------------------------------
-- toggle_reaction — the send/undo path
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('c9000000-0000-0000-0000-00000000000a');

select is(
  public.toggle_reaction('c9000000-0000-0000-0000-00000000000b',
                         'c9000000-0000-0000-0000-00000000d001', 'dua'),
  true, 'a sends b a dua → it now stands');

select is(
  (select count(*)::int from public.reactions
    where from_user_id = 'c9000000-0000-0000-0000-00000000000a'
      and to_user_id   = 'c9000000-0000-0000-0000-00000000000b'),
  1, 'exactly one reaction row');

-- The date is the SENDER's local today, stamped server-side — not passed in.
select is(
  (select date from public.reactions
    where from_user_id = 'c9000000-0000-0000-0000-00000000000a' limit 1),
  private.user_today('c9000000-0000-0000-0000-00000000000a'),
  'the reaction is stamped with the sender''s own local date');

-- Tapping the same glyph again takes it back (the unique key is the toggle).
select is(
  public.toggle_reaction('c9000000-0000-0000-0000-00000000000b',
                         'c9000000-0000-0000-0000-00000000d001', 'dua'),
  false, 'tapping dua again undoes it');

select is(
  (select count(*)::int from public.reactions),
  0, 'the undo removed the row');

-- A different kind is a different reaction — you may send several.
select is(
  public.toggle_reaction('c9000000-0000-0000-0000-00000000000b',
                         'c9000000-0000-0000-0000-00000000d001', 'heart'),
  true, 'a different kind sends independently');
select is(
  public.toggle_reaction('c9000000-0000-0000-0000-00000000000b',
                         'c9000000-0000-0000-0000-00000000d001', 'fire'),
  true, 'and another');
select is((select count(*)::int from public.reactions), 2, 'two kinds stand');

-- Refusals.
select throws_ok(
  $$ select public.toggle_reaction('c9000000-0000-0000-0000-00000000000a',
                                   'c9000000-0000-0000-0000-00000000d001', 'dua') $$,
  'you cannot react to yourself',
  'a member cannot cheer themselves');

select throws_ok(
  $$ select public.toggle_reaction('c9000000-0000-0000-0000-00000000000c',
                                   'c9000000-0000-0000-0000-00000000d001', 'dua') $$,
  'not a member of this circle',
  'cannot react to someone outside the circle');

select throws_ok(
  $$ select public.toggle_reaction('c9000000-0000-0000-0000-00000000000c',
                                   'c9000000-0000-0000-0000-00000000d002', 'dua') $$,
  'group not found',
  'cannot react inside a circle I am not in (no oracle)');

select throws_ok(
  $$ select public.toggle_reaction('c9000000-0000-0000-0000-00000000000b',
                                   'c9000000-0000-0000-0000-00000000d001', 'sparkle') $$,
  'unknown reaction kind',
  'an unknown kind is refused');

-- ----------------------------------------------------------------------------
-- reactions RLS — visible in-circle, invisible outside it
-- ----------------------------------------------------------------------------
select pg_temp.impersonate('c9000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.reactions), 2,
  'b sees the encouragement sent to them');

select pg_temp.impersonate('c9000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.reactions), 0,
  'c, in another circle, sees nothing (reactions are group-scoped)');

-- ----------------------------------------------------------------------------
-- badge awards — earned against the real thresholds, idempotent, PERMANENT
-- ----------------------------------------------------------------------------
select pg_temp.unimpersonate();

-- a has a 7-day streak → 'spark' (streakLongest 7) but not 'steadfast' (30).
insert into public.streaks (user_id, current, longest, last_active)
values ('c9000000-0000-0000-0000-00000000000a', 7, 7, current_date)
on conflict (user_id) do update set current = 7, longest = 7;

select lives_ok(
  $$ select private.evaluate_badges('c9000000-0000-0000-0000-00000000000a',
                                    'c9000000-0000-0000-0000-00000000d001') $$,
  'the evaluator runs');

select bag_eq(
  $$ select badge_id from public.badge_awards
      where user_id = 'c9000000-0000-0000-0000-00000000000a' $$,
  $$ values ('spark') $$,
  'a 7-day streak earns exactly the 7-day badge');

-- Idempotent: a second pass awards nothing new and rewrites no dates.
select private.evaluate_badges('c9000000-0000-0000-0000-00000000000a',
                               'c9000000-0000-0000-0000-00000000d001');
select is((select count(*)::int from public.badge_awards
            where user_id = 'c9000000-0000-0000-0000-00000000000a'),
  1, 'evaluating twice awards the badge once');

-- Consistency badge: 'consistent' needs 80% of the last 30 days fully complete.
-- 25 full days out of 30 = 83% → earned.
insert into public.daily_completion (user_id, group_id, date, completion_pct)
select 'c9000000-0000-0000-0000-00000000000a',
       'c9000000-0000-0000-0000-00000000d001',
       current_date - g, 100
from generate_series(1, 25) g;

select private.evaluate_badges('c9000000-0000-0000-0000-00000000000a',
                               'c9000000-0000-0000-0000-00000000d001');
select bag_eq(
  $$ select badge_id from public.badge_awards
      where user_id = 'c9000000-0000-0000-0000-00000000000a' $$,
  $$ values ('spark'), ('consistent') $$,
  '25 of the last 30 days fully done earns the consistency badge');

-- D43 — THE POINT OF THE TABLE. Wipe the record that earned it: the badge must
-- survive. The mock re-derived this every render, so a dip silently un-earned a
-- badge the member had genuinely earned — a loss/punishment mechanic (D8, D28).
delete from public.daily_completion
 where user_id = 'c9000000-0000-0000-0000-00000000000a';
update public.streaks set current = 0, longest = 0
 where user_id = 'c9000000-0000-0000-0000-00000000000a';

select private.evaluate_badges('c9000000-0000-0000-0000-00000000000a',
                               'c9000000-0000-0000-0000-00000000d001');
select bag_eq(
  $$ select badge_id from public.badge_awards
      where user_id = 'c9000000-0000-0000-0000-00000000000a' $$,
  $$ values ('spark'), ('consistent') $$,
  'an earned badge SURVIVES the streak and consistency that earned it collapsing');

-- badge_awards RLS: mine alone — badges are intrinsic, not a leaderboard (D31).
select pg_temp.impersonate('c9000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.badge_awards), 0,
  'a peer cannot enumerate the badges I have earned');

select pg_temp.impersonate('c9000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.badge_awards), 2,
  'I see my own badges');

-- sync_badges is membership-gated like every other group RPC.
select throws_ok(
  $$ select public.sync_badges('c9000000-0000-0000-0000-00000000d002') $$,
  'group not found',
  'sync_badges refuses a circle I am not in');

-- ----------------------------------------------------------------------------
-- banner_dismissals — self-only
-- ----------------------------------------------------------------------------
insert into public.banner_dismissals (user_id, key)
values ('c9000000-0000-0000-0000-00000000000a', 'week:2026-W29');
select is((select count(*)::int from public.banner_dismissals), 1,
  'a dismisses this week''s banner');

select throws_ok(
  $$ insert into public.banner_dismissals (user_id, key)
     values ('c9000000-0000-0000-0000-00000000000b', 'week:2026-W29') $$,
  '42501', null,
  'a cannot dismiss a banner on b''s behalf');

select pg_temp.impersonate('c9000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.banner_dismissals), 0,
  'b does not see a''s dismissals');

select * from finish();
rollback;
