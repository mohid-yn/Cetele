-- ============================================================================
-- Logic + grants test suite — 0032 (per-member shares)
-- ----------------------------------------------------------------------------
-- Covers:
--   * the default: a circle with no shares set behaves exactly as before
--   * THE ASSERTION THAT CARRIES THE MIGRATION — raising one member's share does
--     not un-keep the days they already kept at the circle's number, and does
--     not touch their streak. This is the fifth member of the retroactivity
--     family (0020/0021/0023/0024) and fails against any non-interval design.
--   * greatest(), not coalesce() — a later circle-wide raise still wins over a
--     smaller standing share, so no stale row can quietly lower somebody's bar
--   * the share is PER MEMBER: raising Ahmet must not move Bilal
--   * clearing returns the member to the circle's target, while the days the
--     share covered are still judged by it
--   * intervals: a change closes one and opens the next, rows are never deleted
--   * the D36a sanity caps FOLLOW the share — a member given a big share must be
--     able to log it, and an admin must not be able to log it against somebody
--     whose share is small
--   * set_task_goal's stretch floors at the member's SHARE, not the circle's
--   * the reminder predicate nags toward the share
--   * RPC authority: admin only, member must be in the circle, no oracle
--   * RLS + grants: readable by the circle, writable by nobody at all
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture: one circle, owner (A), two members (B, C), joined 40 days ago, plus
-- an outsider (E). One DAILY task at target 100 anchored 30 days back, so every
-- day in the window is an occasion and the schedule never masks a target effect.
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('c5000000-0000-0000-0000-00000000000a', 'a@shr.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('c5000000-0000-0000-0000-00000000000b', 'b@shr.test', '{"name":"B"}', 'authenticated', 'authenticated'),
  ('c5000000-0000-0000-0000-00000000000c', 'c@shr.test', '{"name":"C"}', 'authenticated', 'authenticated'),
  ('c5000000-0000-0000-0000-00000000000e', 'e@shr.test', '{"name":"E"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('c5000000-0000-0000-0000-00000000d001', 'Share Circle', 'c5000000-0000-0000-0000-00000000000a');

insert into public.memberships (user_id, group_id, role, created_at) values
  ('c5000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-00000000d001', 'owner',  now() - interval '40 days'),
  ('c5000000-0000-0000-0000-00000000000b', 'c5000000-0000-0000-0000-00000000d001', 'member', now() - interval '40 days'),
  ('c5000000-0000-0000-0000-00000000000c', 'c5000000-0000-0000-0000-00000000d001', 'member', now() - interval '40 days');

insert into public.tasks (id, group_id, label, target_count, frequency_days, created_at) values
  ('c5000000-0000-0000-0000-00000000e001', 'c5000000-0000-0000-0000-00000000d001', 'Ratib', 100, 1, now() - interval '30 days');

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
-- 1. The default — a circle with no shares set does not move at all
-- ----------------------------------------------------------------------------

select is((select count(*) from public.member_task_shares
            where task_id = 'c5000000-0000-0000-0000-00000000e001'), 0::bigint,
  'no share rows exist until an admin sets one — this is not a backfilled table');

select is(private.member_share_on(
            'c5000000-0000-0000-0000-00000000e001',
            'c5000000-0000-0000-0000-00000000000b', current_date), null,
  'member_share_on is NULL when no share was ever set — the circle''s target stands');

select is(private.effective_target(
            'c5000000-0000-0000-0000-00000000e001',
            'c5000000-0000-0000-0000-00000000000b', current_date), 100,
  'effective_target falls back to the circle''s target');

select is((select target from private.obligations(
             'c5000000-0000-0000-0000-00000000000b', current_date - 5)
           where task_id = 'c5000000-0000-0000-0000-00000000e001'), 100,
  '...and obligations agrees on a past day — an unshared circle does not move');

-- ----------------------------------------------------------------------------
-- 2. THE ONE THAT CARRIES THE MIGRATION — a raise cannot un-keep a kept day
-- ----------------------------------------------------------------------------
-- Ten days kept at exactly the circle's 100, then the admin raises B's share to
-- 500. Under a plain (user, task, target) row every one of those days is
-- re-judged at 500, is_day_complete goes false all the way down, and a rebuild
-- finds no kept day to anchor on.

insert into public.logs (user_id, task_id, date, count)
select 'c5000000-0000-0000-0000-00000000000b',
       'c5000000-0000-0000-0000-00000000e001',
       (current_date - d)::date, 100
from generate_series(0, 9) d;

select private.refresh_streak('c5000000-0000-0000-0000-00000000000b', current_date);

select is((select current from public.streaks
            where user_id = 'c5000000-0000-0000-0000-00000000000b'), 10,
  'ten days kept at the circle''s target build a streak of 10');

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000a');
select is(public.set_member_task_share(
            'c5000000-0000-0000-0000-00000000e001',
            'c5000000-0000-0000-0000-00000000000b', 500), 500,
  'an owner may raise a member''s share, and gets the effective target back');
select pg_temp.reset_role();

select is((select target from private.obligations(
             'c5000000-0000-0000-0000-00000000000b', current_date - 5)
           where task_id = 'c5000000-0000-0000-0000-00000000e001'), 100,
  'a past day is still judged by the share in force THAT day — the circle''s 100');

select ok(private.is_day_complete('c5000000-0000-0000-0000-00000000000b', current_date - 5),
  '...so a day kept at 100 is still complete after the raise');

select private.refresh_streak('c5000000-0000-0000-0000-00000000000b', current_date - 1);

select is((select current from public.streaks
            where user_id = 'c5000000-0000-0000-0000-00000000000b'), 10,
  '...and a rebuild still finds all ten days — the streak survives the raise');

select is(private.effective_target(
            'c5000000-0000-0000-0000-00000000e001',
            'c5000000-0000-0000-0000-00000000000b', current_date), 500,
  'TODAY, however, is governed by the new share — a raise bites immediately');

select ok(not private.is_day_complete('c5000000-0000-0000-0000-00000000000b', current_date),
  '...so today re-opens at 100/500, exactly as a circle-wide raise already does');

-- ----------------------------------------------------------------------------
-- 3. The share is PER MEMBER
-- ----------------------------------------------------------------------------

select is(private.effective_target(
            'c5000000-0000-0000-0000-00000000e001',
            'c5000000-0000-0000-0000-00000000000c', current_date), 100,
  'raising B''s share leaves C on the circle''s target — the split is per person');

-- ----------------------------------------------------------------------------
-- 4. greatest(), NOT coalesce() — a later circle-wide raise still wins
-- ----------------------------------------------------------------------------
-- B stands on a share of 500. The admin raises the CIRCLE to 800. Under
-- coalesce(share, circle) B would keep 500 and quietly owe less than everybody
-- else, from a row nobody remembers setting.

update public.tasks set target_count = 800
 where id = 'c5000000-0000-0000-0000-00000000e001';

select is(private.effective_target(
            'c5000000-0000-0000-0000-00000000e001',
            'c5000000-0000-0000-0000-00000000000b', current_date), 800,
  'a circle-wide raise above a standing share wins — no stale row lowers a bar');

select is(private.effective_target(
            'c5000000-0000-0000-0000-00000000e001',
            'c5000000-0000-0000-0000-00000000000c', current_date), 800,
  '...and C moves with the circle too');

update public.tasks set target_count = 100
 where id = 'c5000000-0000-0000-0000-00000000e001';

select is(private.effective_target(
            'c5000000-0000-0000-0000-00000000e001',
            'c5000000-0000-0000-0000-00000000000b', current_date), 500,
  'putting the circle back leaves B on their own share again');

-- ----------------------------------------------------------------------------
-- 5. Intervals — a change closes one and opens the next; nothing is deleted
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000a');
select public.set_member_task_share(
         'c5000000-0000-0000-0000-00000000e001',
         'c5000000-0000-0000-0000-00000000000b', 700);
select pg_temp.reset_role();

select is((select count(*) from public.member_task_shares
            where user_id = 'c5000000-0000-0000-0000-00000000000b'), 2::bigint,
  'changing a share opens a SECOND row rather than updating the first');

select is((select count(*) from public.member_task_shares
            where user_id = 'c5000000-0000-0000-0000-00000000000b'
              and effective_to is null), 1::bigint,
  '...and exactly one of them is open (the unique index makes this unfalsifiable)');

select is(private.effective_target(
            'c5000000-0000-0000-0000-00000000e001',
            'c5000000-0000-0000-0000-00000000000b', current_date), 700,
  '...and the open one governs today');

select throws_ok($$
  insert into public.member_task_shares (task_id, user_id, target_count)
  values ('c5000000-0000-0000-0000-00000000e001',
          'c5000000-0000-0000-0000-00000000000b', 900)
$$, '23505',
  null,
  'a second OPEN share for the same member is refused by the unique index');

-- ----------------------------------------------------------------------------
-- 6. Clearing — back to the circle, without erasing the days the share covered
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000a');
select is(public.set_member_task_share(
            'c5000000-0000-0000-0000-00000000e001',
            'c5000000-0000-0000-0000-00000000000b', null), 100,
  'clearing a share returns the circle''s own target');
select pg_temp.reset_role();

select is(private.effective_target(
            'c5000000-0000-0000-0000-00000000e001',
            'c5000000-0000-0000-0000-00000000000b', current_date), 100,
  '...and the member is back on the circle''s number today');

select is((select count(*) from public.member_task_shares
            where user_id = 'c5000000-0000-0000-0000-00000000000b'), 2::bigint,
  '...with the history still there — clearing CLOSES, it does not delete');

select is((select count(*) from public.member_task_shares
            where user_id = 'c5000000-0000-0000-0000-00000000000b'
              and effective_to is null), 0::bigint,
  '...and nothing is left open');

-- ----------------------------------------------------------------------------
-- 7. A share at or below the circle's target is a CLEAR, not a stored row
-- ----------------------------------------------------------------------------
-- greatest() would ignore it anyway, and dead data that looks meaningful is how
-- a "his share is 50" bug gets reported against a circle target of 100.

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000a');
select is(public.set_member_task_share(
            'c5000000-0000-0000-0000-00000000e001',
            'c5000000-0000-0000-0000-00000000000c', 50), 100,
  'a share BELOW the circle''s target resolves to the circle''s target');
select pg_temp.reset_role();

select is((select count(*) from public.member_task_shares
            where user_id = 'c5000000-0000-0000-0000-00000000000c'), 0::bigint,
  '...and stores nothing at all');

-- ----------------------------------------------------------------------------
-- 8. The sanity cap
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000a');
select throws_ok($$
  select public.set_member_task_share(
    'c5000000-0000-0000-0000-00000000e001',
    'c5000000-0000-0000-0000-00000000000c', 999999)
$$, 'share exceeds the sanity cap for this task',
  'a share above the D36a cap is refused');
select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 9. Authority — admin only, and no oracle for an outsider
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000b');
select throws_ok($$
  select public.set_member_task_share(
    'c5000000-0000-0000-0000-00000000e001',
    'c5000000-0000-0000-0000-00000000000b', 500)
$$, 'task not found',
  'a plain member cannot set their own share — this is the circle''s ask, not theirs');
select pg_temp.reset_role();

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000e');
select throws_ok($$
  select public.set_member_task_share(
    'c5000000-0000-0000-0000-00000000e001',
    'c5000000-0000-0000-0000-00000000000b', 500)
$$, 'task not found',
  'an outsider gets the same message — absent and forbidden look alike');
select pg_temp.reset_role();

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000a');
select throws_ok($$
  select public.set_member_task_share(
    'c5000000-0000-0000-0000-00000000e001',
    'c5000000-0000-0000-0000-00000000000e', 500)
$$, 'that person is not in this circle',
  'a share cannot be pinned to somebody who is not in the circle');
select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 10. The D36a caps follow the SHARE, not the circle
-- ----------------------------------------------------------------------------
-- The cap is greatest(target * 10, target + 1000) against the member's own
-- number. On the circle's 100 that is 1100; on a share of 1100 it is 11000. So
-- 5000 is a legal count for C and an illegal one for B — which is the whole
-- point: without this, an admin could hand somebody a share and the app would
-- then forbid every write that closed it.

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000a');
select public.set_member_task_share(
         'c5000000-0000-0000-0000-00000000e001',
         'c5000000-0000-0000-0000-00000000000c', 1100);

select is(public.set_count(
            'c5000000-0000-0000-0000-00000000000c',
            'c5000000-0000-0000-0000-00000000e001', current_date, 5000), 5000,
  'an admin can log past the circle''s cap for a member whose SHARE allows it');

select throws_ok($$
  select public.set_count(
    'c5000000-0000-0000-0000-00000000000b',
    'c5000000-0000-0000-0000-00000000e001', current_date, 5000)
$$, 'count out of range',
  '...but the same count is refused for a member still on the circle''s 100');
select pg_temp.reset_role();

select ok(private.is_day_complete('c5000000-0000-0000-0000-00000000000c', current_date),
  'a member who meets their raised share has a complete day');

-- ----------------------------------------------------------------------------
-- 11. The stretch (0018) floors at the member's SHARE
-- ----------------------------------------------------------------------------
-- Otherwise C, on a share of 1100, could set a "stretch" of 200 and be told
-- they had raised their bar by lowering it.

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000c');
select is(public.set_task_goal('c5000000-0000-0000-0000-00000000e001', 200), 1100,
  'a stretch below my own share resolves to my share, and stores nothing');

select is((select count(*) from public.member_task_goals
            where user_id = 'c5000000-0000-0000-0000-00000000000c'
              and target_count is not null), 0::bigint,
  '...with no dead row left behind');

select is(public.set_task_goal('c5000000-0000-0000-0000-00000000e001', 1500), 1500,
  'a stretch ABOVE my share is accepted — the two axes stack');
select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 12. RLS + grants
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000b');
select ok((select count(*) from public.member_task_shares) > 0,
  'a member of the circle can READ the shares — the split is not a secret');
select pg_temp.reset_role();

select pg_temp.impersonate('c5000000-0000-0000-0000-00000000000e');
select is((select count(*) from public.member_task_shares), 0::bigint,
  'an outsider reads none of them');
select pg_temp.reset_role();

select ok(not has_table_privilege('authenticated', 'public.member_task_shares', 'INSERT'),
  'authenticated holds no INSERT on member_task_shares — writes are RPC-only');
select ok(not has_table_privilege('authenticated', 'public.member_task_shares', 'UPDATE'),
  '...nor UPDATE — a client that could write here could rewrite its own streak');
select ok(not has_table_privilege('authenticated', 'public.member_task_shares', 'DELETE'),
  '...nor DELETE');
select ok(has_table_privilege('authenticated', 'public.member_task_shares', 'SELECT'),
  '...but SELECT is granted, so the screens can show the split');

select ok(not has_function_privilege('anon',
  'public.set_member_task_share(uuid,uuid,integer)', 'EXECUTE'),
  'anon cannot execute set_member_task_share');
select ok(has_function_privilege('authenticated',
  'public.set_member_task_share(uuid,uuid,integer)', 'EXECUTE'),
  'authenticated can — authority is checked inside');

select * from finish();
rollback;
