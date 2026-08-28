-- ============================================================================
-- Logic + grants test suite — 0036 (a member's own task, D70)
-- ----------------------------------------------------------------------------
-- The decision this reverses is 0023's fourth ("members do not assign
-- themselves"), so what is asserted here is mostly the SHAPE of the reversal —
-- how far it goes and, more importantly, where it stops:
--
--   * a member may add one, and it lands assigned to THEM — not to everyone.
--     That is the trigger's single line, and getting it wrong would silently
--     give the whole circle a task one person invented
--   * `personal_for` is the CALLER's, whatever the caller does. There is no
--     write grant on the column, so this is asserted as a grant, not as an
--     argument the RPC happens to ignore
--   * a member may NOT add one to a circle they are not in
--   * a member may edit and delete THEIR OWN, and neither a circle task nor
--     another member's own task
--   * an admin keeps full reach over both (the owner's call), except that
--     `set_task_assignees` REFUSES a personal task — its carrier is not a
--     setting, and `personal_for` must never disagree with the interval
--   * `tasks_insert_admin` is untouched: a plain INSERT is still admin-only, so
--     the RPC is the single named hole in it
--   * THE INTEGRATION THAT MATTERS — `private.obligations` picks it up the day
--     it is made. Everything the member is judged by reads that predicate, so
--     this one assertion stands for day-completion, the streak, the rollup,
--     consistency, steadfastness and the garden all at once
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select no_plan();

-- ----------------------------------------------------------------------------
-- Fixture
-- ----------------------------------------------------------------------------
--   G1 — owner A, member B, member C
--   G2 — owner E                        ← B is NOT in it
-- Plus one ordinary circle task in G1, carried by everyone.

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('d1000000-0000-0000-0000-00000000000a', 'a@own.test', '{"name":"A"}', 'authenticated', 'authenticated'),
  ('d1000000-0000-0000-0000-00000000000b', 'b@own.test', '{"name":"B"}', 'authenticated', 'authenticated'),
  ('d1000000-0000-0000-0000-00000000000c', 'c@own.test', '{"name":"C"}', 'authenticated', 'authenticated'),
  ('d1000000-0000-0000-0000-00000000000e', 'e@own.test', '{"name":"E"}', 'authenticated', 'authenticated');

insert into public.groups (id, name, created_by) values
  ('d1000000-0000-0000-0000-0000000000d1', 'Ratib Circle', 'd1000000-0000-0000-0000-00000000000a'),
  ('d1000000-0000-0000-0000-0000000000d2', 'Elsewhere',    'd1000000-0000-0000-0000-00000000000e');

insert into public.memberships (user_id, group_id, role) values
  ('d1000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-0000000000d1', 'owner'),
  ('d1000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-0000000000d1', 'member'),
  ('d1000000-0000-0000-0000-00000000000c', 'd1000000-0000-0000-0000-0000000000d1', 'member'),
  ('d1000000-0000-0000-0000-00000000000e', 'd1000000-0000-0000-0000-0000000000d2', 'owner');

insert into public.tasks (id, group_id, label, target_count, frequency_days) values
  ('d1000000-0000-0000-0000-0000000000e1', 'd1000000-0000-0000-0000-0000000000d1', 'Salawat', 100, 1);

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
-- 1. The column, and the fact that no client can write it
-- ----------------------------------------------------------------------------

select has_column('public', 'tasks', 'personal_for',
  'tasks carries personal_for');

select col_is_null('public', 'tasks', 'personal_for',
  '...nullable — NULL is an ordinary task of the circle, which is most of them');

select is((select personal_for from public.tasks
            where id = 'd1000000-0000-0000-0000-0000000000e1'), null::uuid,
  '...and an existing circle task is unaffected by the backfill (there is none)');

-- The guarantee behind "personal_for is the CALLER's". If a client could write
-- this column, every argument in the migration header would rest on the RPC
-- being the only caller, which nothing enforces.
select column_privs_are('public', 'tasks', 'personal_for', 'authenticated',
  array['SELECT'],
  'authenticated may READ personal_for and may not write it — not on insert, '
  'not on update, so a task cannot become personal or change hands');

-- ----------------------------------------------------------------------------
-- 2. A member adds one — and it is theirs, not everyone's
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000b');

select lives_ok(
  $$ select public.add_personal_task(
       'd1000000-0000-0000-0000-0000000000d1', 'Qur''an', 'A page after Fajr', 5, 1) $$,
  'B, a plain MEMBER, may add a task for themselves (D70 reverses 0023''s #4)');

select is((select count(*) from public.tasks
            where group_id = 'd1000000-0000-0000-0000-0000000000d1'
              and personal_for = 'd1000000-0000-0000-0000-00000000000b'), 1::bigint,
  '...and personal_for names B');

-- THE TRIGGER'S ONE LINE. An everyone-row here would hand B's private tracker
-- to the whole circle, and every other member would silently start owing it.
select is(
  (select count(*) from public.task_assignments a
   join public.tasks t on t.id = a.task_id
   where t.personal_for = 'd1000000-0000-0000-0000-00000000000b'
     and a.user_id is null),
  0::bigint,
  'the default assignment is NOT the everyone-row — nobody else is given it');

select is(
  (select a.user_id from public.task_assignments a
   join public.tasks t on t.id = a.task_id
   where t.personal_for = 'd1000000-0000-0000-0000-00000000000b'),
  'd1000000-0000-0000-0000-00000000000b'::uuid,
  '...it is one open interval for B alone');

-- ----------------------------------------------------------------------------
-- 3. THE INTEGRATION — it is an obligation the day it is made
-- ----------------------------------------------------------------------------
-- `private.obligations` is what day-completion, the streak, the rollup,
-- consistency, steadfastness (D31) and the garden (D49) all read, so this
-- single assertion stands for all six. It is also the claim that made this
-- migration small: nothing downstream had to learn a new concept.

select pg_temp.reset_role();

select is(
  (select count(*) from private.obligations(
     'd1000000-0000-0000-0000-00000000000b', current_date)
   where task_id in (select id from public.tasks
                     where personal_for = 'd1000000-0000-0000-0000-00000000000b')),
  1::bigint,
  'B owes their own task today — private.obligations reads it like any other');

select is(
  (select count(*) from private.obligations(
     'd1000000-0000-0000-0000-00000000000c', current_date)
   where task_id in (select id from public.tasks
                     where personal_for = 'd1000000-0000-0000-0000-00000000000b')),
  0::bigint,
  '...and C, in the same circle, owes nothing of the sort');

-- ----------------------------------------------------------------------------
-- 4. The negatives on adding
-- ----------------------------------------------------------------------------

select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000b');

select throws_ok(
  $$ select public.add_personal_task(
       'd1000000-0000-0000-0000-0000000000d2', 'Elsewhere', null, 1, 1) $$,
  'group not found',
  'B cannot add one to a circle they are not in — and "absent" and "forbidden" '
  'read alike, so the id is not an oracle');

select throws_ok(
  $$ select public.add_personal_task(
       'd1000000-0000-0000-0000-0000000000d1', '   ', null, 1, 1) $$,
  'a task needs a name',
  'a blank name is refused out loud');

select throws_ok(
  $$ select public.add_personal_task(
       'd1000000-0000-0000-0000-0000000000d1', 'Zero', null, 0, 1) $$,
  'the target must be at least 1',
  '...as is a target of nothing');

select throws_ok(
  $$ select public.add_personal_task(
       'd1000000-0000-0000-0000-0000000000d1', 'Fortnightly', null, 1, 15) $$,
  'how often must be between 1 and 14 days',
  '...and a cycle past the 14-day log window (0021''s bound)');

-- A DIRECT insert is still admin-only. The RPC is the single named hole in
-- tasks_insert_admin, not a widening of it.
-- FOUR arguments, and the NULL is load-bearing: with a 5-character SQLSTATE in
-- the second slot, pgTAP reads a three-argument call as (sql, errcode, errmsg)
-- and compares the description against the message Postgres actually raised.
-- NULL says "any message with this code", which is the assertion wanted here —
-- the RLS refusal is the thing being pinned, not its wording.
select throws_ok(
  $$ insert into public.tasks (group_id, label, target_count)
     values ('d1000000-0000-0000-0000-0000000000d1', 'Sneaked in', 1) $$,
  '42501',
  null,
  'a plain INSERT is still refused for a member — tasks_insert_admin is intact');

-- ----------------------------------------------------------------------------
-- 5. Who may change one
-- ----------------------------------------------------------------------------

select is(
  (select count(*) from public.tasks
   where personal_for = 'd1000000-0000-0000-0000-00000000000b'
     and label = 'Qur''an'), 1::bigint,
  'B''s own task is there to be edited');

update public.tasks set target_count = 10
  where personal_for = 'd1000000-0000-0000-0000-00000000000b';
select is((select target_count from public.tasks
            where personal_for = 'd1000000-0000-0000-0000-00000000000b'), 10,
  'B may change their own task''s target');

-- The circle's own task is not theirs, and RLS makes the UPDATE a no-op rather
-- than an error — which is why this is asserted on the VALUE, not with throws_ok.
update public.tasks set target_count = 1
  where id = 'd1000000-0000-0000-0000-0000000000e1';
select is((select target_count from public.tasks
            where id = 'd1000000-0000-0000-0000-0000000000e1'), 100,
  '...and may not touch the CIRCLE''s task — still 100');

-- C is in the same circle and it is still not their task.
select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000c');
delete from public.tasks where personal_for = 'd1000000-0000-0000-0000-00000000000b';
select is((select count(*) from public.tasks
            where personal_for = 'd1000000-0000-0000-0000-00000000000b'), 1::bigint,
  'C, a peer, cannot delete B''s own task');

-- The admin CAN — the owner's call: it is their circle's task list.
select pg_temp.impersonate('d1000000-0000-0000-0000-00000000000a');
update public.tasks set label = 'Qur''an (daily)'
  where personal_for = 'd1000000-0000-0000-0000-00000000000b';
select is((select label from public.tasks
            where personal_for = 'd1000000-0000-0000-0000-00000000000b'),
  'Qur''an (daily)',
  'A, the circle''s owner, may edit a member''s own task');

-- ----------------------------------------------------------------------------
-- 6. ...but its carrier is not a setting
-- ----------------------------------------------------------------------------
-- The one thing an admin may NOT do. Handing it to the circle would leave
-- `personal_for` naming a member who no longer carries it — the column and the
-- interval table disagreeing about the same task, which is the state 0036's
-- header exists to prevent. Deleting it is the honest act, and A can do that.

select throws_ok(
  format($$ select public.set_task_assignees(%L, null) $$,
         (select id from public.tasks
          where personal_for = 'd1000000-0000-0000-0000-00000000000b')),
  'a personal task is carried by the member who added it',
  'A may not hand B''s own task to the whole circle');

select throws_ok(
  format($$ select public.set_task_assignees(%L, array['%s']::uuid[]) $$,
         (select id from public.tasks
          where personal_for = 'd1000000-0000-0000-0000-00000000000b'),
         'd1000000-0000-0000-0000-00000000000c'),
  'a personal task is carried by the member who added it',
  '...nor to C');

-- The ordinary path still works, so the guard has not broken 0023.
select lives_ok(
  $$ select public.set_task_assignees(
       'd1000000-0000-0000-0000-0000000000e1',
       array['d1000000-0000-0000-0000-00000000000b']::uuid[]) $$,
  'a CIRCLE task can still be scoped to one member — 0023 is unchanged');

-- ----------------------------------------------------------------------------
-- 7. Grants
-- ----------------------------------------------------------------------------

select pg_temp.reset_role();

select function_privs_are('public', 'add_personal_task',
  array['uuid', 'text', 'text', 'integer', 'integer'],
  'authenticated', array['EXECUTE'],
  'a signed-in member may add one');

select function_privs_are('public', 'add_personal_task',
  array['uuid', 'text', 'text', 'integer', 'integer'],
  'anon', array[]::text[],
  '...and anon may not');

select * from finish();
rollback;
