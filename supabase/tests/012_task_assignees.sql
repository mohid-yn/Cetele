-- ============================================================================
-- Logic + grants test suite — 0023 (member-specific tasks)
-- ----------------------------------------------------------------------------
-- Covers:
--   * the default: every task is for everyone, from a trigger, anchored at its
--     own creation — so nothing about an unscoped circle moves
--   * scoping: a task assigned to one member is owed by that member and by
--     nobody else, everywhere obligations reaches
--   * THE TWO NEGATIVES THAT CARRY THE FEATURE — assigning today does not make
--     the task owed on a PAST day, and unassigning does not un-own the past
--     days already carried. Both are the 10 -> 1 retroactivity family (0020,
--     0021) in a new place, and both fail against a plain set-shaped table
--   * intervals: unassign closes, re-assign opens a NEW one, the gap stays a gap
--   * anchor preservation: re-saving a set does not move an existing assignee's
--     start date
--   * reminders are bounded by assignment too (0019's bug, one step along)
--   * RLS + grants: readable by the circle, writable by nobody except the RPC
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture: one circle, an owner (A) and two members (B, C), all joined 40 days
-- ago. One DAILY task anchored 30 days back, so every day in the window is an
-- occasion and the schedule never masks an assignment effect.
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('a2000000-0000-0000-0000-00000000000a', 'a@assign.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('a2000000-0000-0000-0000-00000000000b', 'b@assign.test', '{"name":"B"}', 'authenticated', 'authenticated'),
  ('a2000000-0000-0000-0000-00000000000c', 'c@assign.test', '{"name":"C"}', 'authenticated', 'authenticated'),
  ('a2000000-0000-0000-0000-00000000000e', 'e@assign.test', '{"name":"E"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('a2000000-0000-0000-0000-00000000d001', 'Assign Circle', 'a2000000-0000-0000-0000-00000000000a');

insert into public.memberships (user_id, group_id, role, created_at) values
  ('a2000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-00000000d001', 'owner',  now() - interval '40 days'),
  ('a2000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000d001', 'member', now() - interval '40 days'),
  ('a2000000-0000-0000-0000-00000000000c', 'a2000000-0000-0000-0000-00000000d001', 'member', now() - interval '40 days');

insert into public.tasks (id, group_id, label, target_count, frequency_days, created_at) values
  ('a2000000-0000-0000-0000-00000000e001', 'a2000000-0000-0000-0000-00000000d001', 'Ratib', 1, 1, current_date - 30);

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
-- 1. The default — every task is for everyone, and the trigger says so
-- ----------------------------------------------------------------------------

select is((select count(*) from public.task_assignments
            where task_id = 'a2000000-0000-0000-0000-00000000e001'), 1::bigint,
  'a new task gets exactly one assignment row, from the trigger');

select ok((select user_id is null from public.task_assignments
            where task_id = 'a2000000-0000-0000-0000-00000000e001'),
  '...and it is the everyone-row, not one row per member');

select is((select assigned_at::date from public.task_assignments
            where task_id = 'a2000000-0000-0000-0000-00000000e001'),
  current_date - 30,
  '...anchored at the TASK''s creation, not now() — else every past day loses its obligation');

select ok(private.assigned_on('a2000000-0000-0000-0000-00000000e001',
                              'a2000000-0000-0000-0000-00000000000b', current_date - 20),
  'an unscoped task was owed by an ordinary member on a past day');

select is((select count(*) from private.obligations(
             'a2000000-0000-0000-0000-00000000000c', current_date)), 1::bigint,
  'every member owes an unscoped task today');

-- ----------------------------------------------------------------------------
-- 2. Scoping it to ONE member
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('a2000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.set_task_assignees(
    'a2000000-0000-0000-0000-00000000e001',
    array['a2000000-0000-0000-0000-00000000000b']::uuid[])$$,
  'the owner can scope a task to one member');
select pg_temp.reset_role();

select is((select count(*) from private.obligations(
             'a2000000-0000-0000-0000-00000000000b', current_date)), 1::bigint,
  'the assigned member still owes it today');

select is((select count(*) from private.obligations(
             'a2000000-0000-0000-0000-00000000000c', current_date)), 0::bigint,
  'a member NOT assigned owes nothing today — the whole feature, in one row');

select ok(not private.is_day_complete('a2000000-0000-0000-0000-00000000000c', current_date),
  '...and owing nothing is still not a day KEPT (vacuous truth would gift a streak)');

-- ----------------------------------------------------------------------------
-- 3. NEGATIVE ONE — assigning today does not reach into the past
-- ----------------------------------------------------------------------------
-- This is the assertion that fails against a plain `task_assignees(task, user)`
-- set: a set has no notion of WHEN, so a member named today would retroactively
-- owe the task on every past day, each one unmet, and their rebuilt chain would
-- collapse — measured at 10 -> 1 for the sibling cases in 0020 (joining a
-- circle) and 0021 (an admin adding a task).
--
-- Testing it needs a member who was genuinely NOT covered before, which the
-- fixture above cannot express: e001 belonged to the whole circle for its first
-- 30 days, so B really did owe it five days ago — via the everyone-row, not via
-- today's assignment. Nothing was added retroactively there, and asserting
-- otherwise would pin the wrong behaviour.
--
-- So e002 gets a history written directly, since this section is testing
-- `assigned_on`/`obligations` rather than the RPC: everyone until 20 days ago,
-- C alone since then, and B added TODAY. Days -19..-1 are a gap for B.

insert into public.tasks (id, group_id, label, target_count, frequency_days, created_at) values
  ('a2000000-0000-0000-0000-00000000e002', 'a2000000-0000-0000-0000-00000000d001', 'Yasin', 1, 1, current_date - 30);

update public.task_assignments
   set unassigned_at = current_date - 20
 where task_id = 'a2000000-0000-0000-0000-00000000e002' and user_id is null;

insert into public.task_assignments (task_id, user_id, assigned_at) values
  ('a2000000-0000-0000-0000-00000000e002', 'a2000000-0000-0000-0000-00000000000c', current_date - 20),
  ('a2000000-0000-0000-0000-00000000e002', 'a2000000-0000-0000-0000-00000000000b', current_date);

select ok(not private.assigned_on('a2000000-0000-0000-0000-00000000e002',
                                  'a2000000-0000-0000-0000-00000000000b', current_date - 5),
  'a member assigned TODAY did not owe the task five days ago');

select is((select count(*) from private.obligations(
             'a2000000-0000-0000-0000-00000000000b', current_date - 5)
           where task_id = 'a2000000-0000-0000-0000-00000000e002'), 0::bigint,
  '...so no past-day obligation appears out of nowhere');

select ok(private.assigned_on('a2000000-0000-0000-0000-00000000e002',
                              'a2000000-0000-0000-0000-00000000000b', current_date),
  '...while today, when they WERE assigned, it is theirs');

select ok(private.assigned_on('a2000000-0000-0000-0000-00000000e002',
                              'a2000000-0000-0000-0000-00000000000b', current_date - 25),
  'and the days before the everyone-row closed are still B''s — the gap is a gap, not a truncation');

-- Closing an everyone-row must not reach backwards either: C carried e001 for
-- the 30 days it was the whole circle's, and that has to stay true.
select ok(private.assigned_on('a2000000-0000-0000-0000-00000000e001',
                              'a2000000-0000-0000-0000-00000000000c', current_date - 5),
  'closing the everyone-row leaves the days it covered ALONE (negative one, other side)');

-- ----------------------------------------------------------------------------
-- 4. NEGATIVE TWO — unassigning does not un-own days already carried
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('a2000000-0000-0000-0000-00000000000a');
select public.set_task_assignees('a2000000-0000-0000-0000-00000000e001',
    array['a2000000-0000-0000-0000-00000000000c']::uuid[]);
select pg_temp.reset_role();

select ok(not private.assigned_on('a2000000-0000-0000-0000-00000000e001',
                                  'a2000000-0000-0000-0000-00000000000b', current_date),
  'a member taken off the task does not owe it today');

select ok(private.assigned_on('a2000000-0000-0000-0000-00000000e001',
                              'a2000000-0000-0000-0000-00000000000c', current_date - 5),
  'a day carried under the old everyone-row is still carried after a reshuffle');

select is((select count(*) from public.task_assignments
            where task_id = 'a2000000-0000-0000-0000-00000000e001'
              and user_id = 'a2000000-0000-0000-0000-00000000000b'
              and unassigned_at is not null), 1::bigint,
  'unassigning CLOSES the interval — the row is never deleted');

-- ----------------------------------------------------------------------------
-- 5. Re-assigning opens a NEW interval; the gap stays a gap
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('a2000000-0000-0000-0000-00000000000a');
select public.set_task_assignees('a2000000-0000-0000-0000-00000000e001',
    array['a2000000-0000-0000-0000-00000000000b',
          'a2000000-0000-0000-0000-00000000000c']::uuid[]);
select pg_temp.reset_role();

select is((select count(*) from public.task_assignments
            where task_id = 'a2000000-0000-0000-0000-00000000e001'
              and user_id = 'a2000000-0000-0000-0000-00000000000b'), 2::bigint,
  'B now has TWO intervals — re-assignment never revives the closed one');

select is((select count(*) from public.task_assignments
            where task_id = 'a2000000-0000-0000-0000-00000000e001'
              and user_id = 'a2000000-0000-0000-0000-00000000000b'
              and unassigned_at is null), 1::bigint,
  '...exactly one of them open');

-- ----------------------------------------------------------------------------
-- 6. An unchanged assignee keeps their anchor
-- ----------------------------------------------------------------------------
-- C was in the set before this save and after it. A delete-all-then-insert-all
-- implementation would look identical on screen and would silently move C's
-- start date to today, un-owning every past day C had already carried.

select is((select count(*) from public.task_assignments
            where task_id = 'a2000000-0000-0000-0000-00000000e001'
              and user_id = 'a2000000-0000-0000-0000-00000000000c'), 1::bigint,
  'C, in the set both before and after, still has exactly ONE interval');

-- ----------------------------------------------------------------------------
-- 7. Back to everyone, and the uniqueness guarantees
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('a2000000-0000-0000-0000-00000000000a');
select public.set_task_assignees('a2000000-0000-0000-0000-00000000e001', null);
select pg_temp.reset_role();

select is((select count(*) from public.task_assignments
            where task_id = 'a2000000-0000-0000-0000-00000000e001'
              and unassigned_at is null), 1::bigint,
  'back to everyone leaves exactly one open row');

select ok((select user_id is null from public.task_assignments
            where task_id = 'a2000000-0000-0000-0000-00000000e001'
              and unassigned_at is null),
  '...and it is the everyone-row');

select throws_ok($$insert into public.task_assignments (task_id, user_id)
                   values ('a2000000-0000-0000-0000-00000000e001', null)$$,
  '23505',
  null,
  'a second OPEN everyone-row is refused by the partial unique index');

-- ----------------------------------------------------------------------------
-- 8. The RPC refuses what it should
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('a2000000-0000-0000-0000-00000000000b');
select throws_ok($$select public.set_task_assignees(
    'a2000000-0000-0000-0000-00000000e001',
    array['a2000000-0000-0000-0000-00000000000b']::uuid[])$$,
  'task not found',
  'an ordinary member cannot assign — and gets no oracle either');
select pg_temp.reset_role();

select pg_temp.impersonate('a2000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.set_task_assignees(
    'a2000000-0000-0000-0000-00000000e001', array[]::uuid[])$$,
  'a task needs at least one person',
  'an empty set is refused — a task nobody carries is dead data');

select throws_ok($$select public.set_task_assignees(
    'a2000000-0000-0000-0000-00000000e001',
    array['a2000000-0000-0000-0000-00000000000e']::uuid[])$$,
  'every assignee must be a member of this circle',
  'a stranger cannot be pinned to a task they would silently pick up on joining');
select pg_temp.reset_role();

-- ----------------------------------------------------------------------------
-- 9. Reminders are bounded by assignment too (0019, one step along)
-- ----------------------------------------------------------------------------
-- Without this a member taken off a task keeps being pushed about it forever,
-- with no control anywhere in the app — /profile builds its rows from the tasks
-- in circles you are IN, so the row would be invisible there.

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values ('a2000000-0000-0000-0000-00000000000b', 'https://push.test/b', 'k', 'a');

insert into public.reminders (user_id, task_id, time_of_day, enabled)
values ('a2000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000e001',
        (now() at time zone 'UTC')::time, true);

select is((select count(*) from private.due_reminders()
            where user_id = 'a2000000-0000-0000-0000-00000000000b'), 1::bigint,
  'while the task is everyone''s, B is due a reminder');

select pg_temp.impersonate('a2000000-0000-0000-0000-00000000000a');
select public.set_task_assignees('a2000000-0000-0000-0000-00000000e001',
    array['a2000000-0000-0000-0000-00000000000c']::uuid[]);
select pg_temp.reset_role();

select is((select count(*) from private.due_reminders()
            where user_id = 'a2000000-0000-0000-0000-00000000000b'), 0::bigint,
  '...and once taken off it, B is not pushed about it again');

-- ----------------------------------------------------------------------------
-- 10. RLS + grants
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('a2000000-0000-0000-0000-00000000000c');
select is((select count(*) from public.task_assignments
            where task_id = 'a2000000-0000-0000-0000-00000000e001') > 0, true,
  'a member of the circle can read who a task is for (the group screen needs it)');
select pg_temp.reset_role();

select pg_temp.impersonate('a2000000-0000-0000-0000-00000000000e');
select is((select count(*) from public.task_assignments
            where task_id = 'a2000000-0000-0000-0000-00000000e001'), 0::bigint,
  'someone outside the circle sees nothing at all');
select pg_temp.reset_role();

select ok(has_table_privilege('authenticated', 'public.task_assignments', 'SELECT'),
  'authenticated may read assignments');
select ok(not has_table_privilege('authenticated', 'public.task_assignments', 'INSERT'),
  'authenticated may NOT insert — assignment is RPC-only (D42)');
select ok(not has_table_privilege('authenticated', 'public.task_assignments', 'UPDATE'),
  '...nor update, which is what stops an anchor being rewritten by hand');
select ok(not has_table_privilege('authenticated', 'public.task_assignments', 'DELETE'),
  '...nor delete, which is what keeps history from being erased');

select ok(not pg_catalog.has_function_privilege(
  'anon', 'public.set_task_assignees(uuid, uuid[])', 'EXECUTE'),
  'anon cannot assign anything');

select * from finish();
rollback;
