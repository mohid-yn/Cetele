-- ============================================================================
-- Migration 0023 — a task can belong to specific members, not the whole circle
-- ----------------------------------------------------------------------------
-- Owner: "i want the ability for admins and co-admins to be able to give member
-- specific tasks… the architecture we chose was based off google drive and that
-- also lets you granulate access within folders so it makes sense."
--
-- Four decisions were taken before writing this, all the owner's:
--
--   1. ONE task list per circle, with per-task assignees — not a second,
--      parallel "personal tasks" table. A task assigned to exactly one person
--      IS a personal task, so this buys both shapes with one concept and, more
--      importantly, ONE predicate. Everything the app judges a member by
--      (day-completion, streaks, the rollup, consistency, steadfastness D31,
--      the garden D49) already reads `private.obligations`, so scoping there
--      scopes all six at once and they cannot drift apart.
--   2. A task you are not assigned to is ABSENT from your Today and still
--      LISTED on the group screen with who it is for. The circle keeps one
--      shared picture; your own screen only ever shows rings you can close.
--   3. The admin sets it on the task ("who is this for?"), which is where the
--      task list is already edited.
--   4. Members do not assign themselves. Assignment is an admin act, exactly
--      like the task list itself (D5/D26). The member's own axis is unchanged:
--      raise my count, tighten my frequency (D51, 0021) — never change what the
--      circle asks of whom.
--
-- WHY THIS IS AN INTERVAL TABLE AND NOT A SET
--
-- The obvious build is `task_assignees(task_id, user_id)` — a plain set, with
-- unassign as a DELETE. That is the retroactivity bug this repo has already
-- paid for twice, in a new place. `private.obligations` answers "what did this
-- member owe on THIS DAY", for any day in the 14-day window, and a set has no
-- notion of when. So:
--
--   * assigning a task today would make the member owe it LAST TUESDAY, and
--     every unmet past day would collapse their rebuilt chain — measured at
--     10 → 1 for the sibling cases in 0020 (joining a circle) and 0021 (adding
--     a task);
--   * unassigning would erase the fact they ever carried it, so days they
--     genuinely kept would stop being occasions at all and the walk would
--     shorten.
--
-- Rows are therefore never deleted: unassigning CLOSES an interval, and
-- re-assigning later opens a NEW one rather than reviving the old. The gap
-- stays a gap. A past day is judged by who the task belonged to on that day.
--
-- "EVERYONE" IS A ROW, NOT A FLAG
--
-- The first cut of this put `tasks.assigned_to_all boolean` alongside the
-- table. That reintroduces the same bug one level up: the boolean is a single
-- unversioned value, so an admin narrowing a circle-wide task to one person
-- would silently un-owe it for everybody else on every past day too.
--
-- Instead a row with `user_id IS NULL` means "every member of this circle",
-- resolved dynamically — which is also the only version that gets the joiner
-- case right, because materialising one row per member would leave whoever
-- joins next week carrying none of the circle's shared tasks. The everyone-row
-- lives on the same timeline as the per-member rows, so switching between the
-- two shapes is just closing one interval and opening another, and history is
-- preserved for free.
--
-- BACKFILL — the dangerous part, and why it is safe
--
-- Every existing task gets one open everyone-row anchored at `tasks.created_at`
-- (NOT now(), which is 0021's lesson verbatim: anchoring at now() would mean no
-- past day was ever assigned, every past day would become obligation-free, and
-- every stored streak would collapse on its next rebuild). A NEW task gets the
-- same row from a trigger rather than from application code — a task with no
-- assignment row at all would silently apply to NOBODY, which is a failure the
-- UI cannot be trusted to prevent and RLS cannot express.
--
-- Direction of change: with one open everyone-row per task anchored at
-- creation, the new predicate is exactly the old one. Nothing moves until an
-- admin actually scopes a task.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- task_assignments — who a task belonged to, and when
-- ----------------------------------------------------------------------------

create table public.task_assignments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks on delete cascade,
  -- NULL = every member of the circle, resolved at read time (see the header).
  user_id       uuid references public.profiles on delete cascade,
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz,
  check (unassigned_at is null or unassigned_at >= assigned_at)
);

-- The predicate below is always task-led, and both FK sides need an index of
-- their own (the B7 lesson, 0005).
create index task_assignments_task_id_idx on public.task_assignments (task_id);
create index task_assignments_user_id_idx on public.task_assignments (user_id);

-- At most ONE open assignment per (task, member), and at most ONE open
-- everyone-row per task. Two indexes rather than one `nulls not distinct`, so
-- the guarantee does not depend on the server's Postgres version.
create unique index task_assignments_one_open_per_member
  on public.task_assignments (task_id, user_id)
  where unassigned_at is null and user_id is not null;

create unique index task_assignments_one_open_everyone
  on public.task_assignments (task_id)
  where unassigned_at is null and user_id is null;

comment on table public.task_assignments is
  'Who a task belongs to, over time (0023). One row per assignment INTERVAL: '
  'unassigning closes it, re-assigning opens a new one. user_id NULL = every '
  'member of the circle. Never deleted — private.obligations judges a past day '
  'by who carried the task on that day.';

comment on column public.task_assignments.user_id is
  'NULL means every member of the circle, resolved at read time so a member who '
  'joins later picks up the circle''s shared tasks automatically.';

alter table public.task_assignments enable row level security;

-- Read: any member of the circle the task belongs to. The group screen lists
-- every task with who it is for (decision 2), so this is deliberately NOT
-- own-row — a member seeing that a task is Ahmet's is the point, and it leaks
-- nothing a member cannot already see on the members list.
create policy task_assignments_select_member on public.task_assignments
  for select to authenticated
  using (private.is_task_group_member(task_id));

-- No insert/update/delete policy and no write grant, in either direction:
-- assignment is membership-shaped, so it is RPC-only (D42/D35/D43). The RPC
-- below has to close and open intervals together, and it has to leave an
-- UNCHANGED assignee's anchor alone — a delete-all-then-insert-all save would
-- reset every existing assignee's assigned_at to today and quietly un-own every
-- past day they had already carried.
grant select on public.task_assignments to authenticated;

-- ----------------------------------------------------------------------------
-- Backfill + the default for every future task
-- ----------------------------------------------------------------------------
-- Anchored at the task's own creation, so no historical day loses an
-- obligation it used to have (0021's backfill lesson, verbatim).

insert into public.task_assignments (task_id, user_id, assigned_at)
select t.id, null, t.created_at from public.tasks t;

create or replace function private.task_assign_everyone() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.task_assignments (task_id, user_id, assigned_at)
  values (new.id, null, new.created_at);
  return new;
end;
$$;

revoke all on function private.task_assign_everyone() from public, anon, authenticated;

-- In the DB, not in `addTask`: a task inserted by any path — the manage screen,
-- a future importer, psql — is for everyone until an admin says otherwise. A
-- task carrying no assignment row would apply to nobody and show up on no
-- screen, which is the worst possible default and the easiest one to ship by
-- accident.
create trigger tasks_default_assignment
  after insert on public.tasks
  for each row execute function private.task_assign_everyone();

-- ----------------------------------------------------------------------------
-- private.assigned_on — the one definition of "this task was mine that day"
-- ----------------------------------------------------------------------------
-- Split out so the obligation predicate and the reminder predicate cannot
-- drift. They already did once: 0019 found `claim_due_reminders` and the pg_cron
-- tick carrying two copies of the membership check, one of them unguarded.
--
-- Bounds match `tasks.created_at`'s exactly (0021), on purpose:
--   * assigned_at::date <= day — an assignment made today counts today, the
--     same way a task created today is due today. The alternative (start
--     tomorrow) would be kinder but would disagree with the sibling rule.
--   * day < unassigned_at::date — the day you are unassigned is already NOT
--     yours. Being taken off a task at 3pm must not leave you owing it until
--     midnight (D8).

create or replace function private.assigned_on(
  p_task uuid,
  p_user uuid,
  p_day  date
) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.task_assignments a
    where a.task_id = p_task
      and (a.user_id = p_user or a.user_id is null)
      and a.assigned_at::date <= p_day
      and (a.unassigned_at is null or p_day < a.unassigned_at::date)
  );
$$;

revoke all on function private.assigned_on(uuid, uuid, date)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- private.obligations — now bounded by assignment as well
-- ----------------------------------------------------------------------------
-- Unchanged from 0021 except for the final clause. Repeated verbatim rather
-- than patched, because `create or replace function` needs the whole body and
-- this is the one predicate the entire app is judged by.
--
-- The assignment clause carries the SAME per-task log-claim escape as the
-- task-age clause above it, and for the same reason. The first cut of this
-- migration left it out, reasoning that assignments are versioned from birth so
-- there is no unversioned past to rescue. That was wrong, and e2e caught it: the
-- everyone-row is anchored at `tasks.created_at`, so in a BRAND-NEW circle the
-- entire 14-day back-fill window predates every assignment — and D48 exists
-- precisely to let a new member repair those days. Without the escape, closing
-- yesterday's ring in a new circle left the streak at 1.
--
-- It is safe for the same reason it is safe one clause up: the escape requires a
-- COMPLETED log (`count >= target_count`), so it can only ever pull in an
-- obligation that is already satisfied. A day can still only become MORE
-- complete, never less — which means assigning a task today STILL cannot make a
-- member owe it last Tuesday, unless they actually completed it last Tuesday.

create or replace function private.obligations(p_user uuid, p_day date)
  returns table (task_id uuid, group_id uuid, target integer)
  language sql security definer stable set search_path = '' as $$
  select t.id,
         t.group_id,
         t.target_count
  from public.tasks t
  join public.memberships m on m.group_id = t.group_id and m.user_id = p_user
  where (
          m.created_at::date <= p_day
          or exists (
               select 1 from public.logs l2
               join public.tasks t2 on t2.id = l2.task_id
               where l2.user_id = p_user
                 and l2.date    = p_day
                 and t2.group_id = t.group_id
                 and l2.count >= t2.target_count
             )
        )
    and (
          private.task_due_on(
            t.created_at::date, t.frequency_days, null, p_day
          )
          or exists (
               select 1 from public.logs l3
               where l3.user_id = p_user
                 and l3.task_id = t.id
                 and l3.date    = p_day
                 and l3.count >= t.target_count
             )
        )
    -- 0023: and it was actually mine that day — or I completed it that day,
    -- which is the D48 escape (see the header).
    and (
          private.assigned_on(t.id, p_user, p_day)
          or exists (
               select 1 from public.logs l4
               where l4.user_id = p_user
                 and l4.task_id = t.id
                 and l4.date    = p_day
                 and l4.count >= t.target_count
             )
        );
$$;

revoke all on function private.obligations(uuid, date)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- private.due_reminders — the same bound, for the same reason as 0019
-- ----------------------------------------------------------------------------
-- Without this, a member taken off a task keeps being pushed about it, with no
-- control anywhere in the app: /profile builds its reminder rows from the tasks
-- in circles you are in, so a row for a task you are no longer assigned would
-- be invisible there. That is 0019's bug exactly — the worst shape a
-- notification bug can take, because the UI looks correct.
--
-- Today's date is used rather than the reminder's target day: a reminder is
-- about the day it fires on.

create or replace function private.due_reminders()
  returns table (reminder_id uuid, user_id uuid, task_id uuid, local_date date)
  language sql security definer set search_path = '' as $$
  select r.id, r.user_id, r.task_id, private.user_today(r.user_id)
  from public.reminders r
  join public.profiles p on p.id = r.user_id
  join public.tasks    t on t.id = r.task_id
  left join public.member_task_goals g
    on g.user_id = r.user_id and g.task_id = r.task_id
  where r.enabled
    and exists (
          select 1 from public.memberships m
          where m.group_id = t.group_id and m.user_id = r.user_id
        )
    -- 0023: and the task is still theirs to do.
    and private.assigned_on(r.task_id, r.user_id, private.user_today(r.user_id))
    and (now() at time zone p.timezone)::time >= r.time_of_day
    and (now() at time zone p.timezone)::time <  r.time_of_day + interval '5 minutes'
    and (r.last_sent_on is null or r.last_sent_on <> private.user_today(r.user_id))
    and coalesce((
          select l.count from public.logs l
          where l.user_id = r.user_id
            and l.task_id = r.task_id
            and l.date    = private.user_today(r.user_id)
        ), 0) < greatest(t.target_count, coalesce(g.target_count, 0))
    and exists (
          select 1 from public.push_subscriptions s where s.user_id = r.user_id
        );
$$;

revoke all on function private.due_reminders() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- public.set_task_assignees — the only way to write an assignment
-- ----------------------------------------------------------------------------
-- p_user_ids IS NULL  → everyone
-- p_user_ids = {a,b}  → exactly those members
-- p_user_ids = {}     → refused (a task nobody carries is dead data that reads
--                       like a setting; removing the task is the honest act)
--
-- The load-bearing detail is what it does NOT touch: a member who is in the set
-- both before and after keeps their existing interval, anchor and all. Closing
-- and reopening every row on each save would look identical on screen and would
-- silently move every assignee's start date to today, un-owning the past days
-- they had already carried — the same class of silent history rewrite this
-- whole migration exists to prevent.

create or replace function public.set_task_assignees(
  p_task     uuid,
  p_user_ids uuid[]
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_caller_profile();
  v_group uuid;
begin
  select group_id into v_group from public.tasks where id = p_task;

  -- Absent and forbidden look alike — no oracle for a task in a circle the
  -- caller cannot see (the increment_count convention).
  if v_group is null or not private.is_group_admin(v_group) then
    raise exception 'task not found';
  end if;

  if p_user_ids is not null and cardinality(p_user_ids) = 0 then
    raise exception 'a task needs at least one person';
  end if;

  -- Every named person must actually be in this circle. Without this an admin
  -- could pin a task to a stranger's id, and the row would sit there inert
  -- until that person happened to join.
  if p_user_ids is not null and exists (
       select 1 from unnest(p_user_ids) as u(id)
       where not exists (
         select 1 from public.memberships m
         where m.group_id = v_group and m.user_id = u.id
       )
     ) then
    raise exception 'every assignee must be a member of this circle';
  end if;

  if p_user_ids is null then
    -- → everyone. Close any per-member intervals; open the everyone-row only if
    -- one is not already open (so re-saving "everyone" is a genuine no-op).
    update public.task_assignments
       set unassigned_at = now()
     where task_id = p_task and unassigned_at is null and user_id is not null;

    if not exists (
      select 1 from public.task_assignments
      where task_id = p_task and unassigned_at is null and user_id is null
    ) then
      insert into public.task_assignments (task_id, user_id) values (p_task, null);
    end if;
  else
    -- → a named set. Close the everyone-row and anyone dropped from it.
    -- `user_id is null or` is required: `null <> all(array)` is NULL, not true,
    -- so the everyone-row would survive the comparison on its own.
    update public.task_assignments
       set unassigned_at = now()
     where task_id = p_task
       and unassigned_at is null
       and (user_id is null or user_id <> all(p_user_ids));

    -- Open one for anyone newly named. Anyone already open is skipped, which is
    -- what preserves their anchor.
    insert into public.task_assignments (task_id, user_id)
    select p_task, u.id
    from unnest(p_user_ids) as u(id)
    where not exists (
      select 1 from public.task_assignments a
      where a.task_id = p_task and a.user_id = u.id and a.unassigned_at is null
    );
  end if;
end;
$$;

revoke all on function public.set_task_assignees(uuid, uuid[]) from public, anon;
grant execute on function public.set_task_assignees(uuid, uuid[]) to authenticated;

comment on function public.set_task_assignees(uuid, uuid[]) is
  'Set who a task is for (0023). NULL = everyone, an array = exactly those '
  'members, empty = refused. Admin-only. Preserves the interval of anyone who '
  'is in the set both before and after, so a save cannot rewrite who owed what '
  'on a past day. `authenticated` holds no write grant on public.task_assignments.';
