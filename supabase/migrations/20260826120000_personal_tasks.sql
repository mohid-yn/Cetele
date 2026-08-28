-- ============================================================================
-- Migration 0036 — a member may add a task for THEMSELVES (D70)
-- ----------------------------------------------------------------------------
-- Owner: "students should be able to add tasks for only themselves through the
-- my tasks tab since logic already exists to add tasks for specific people."
--
-- The second half is right, and it is why this migration is small. 0023 chose
-- ONE task list per circle with per-task assignees over a parallel "personal
-- tasks" table, precisely so that "a task assigned to exactly one person IS a
-- personal task" — one concept, one predicate, and every mechanic the app
-- judges a member by (day-completion, the streak, the rollup, consistency,
-- steadfastness D31, the garden D49) inherits it from `private.obligations` for
-- free. Nothing in that machinery moves here. A self-added task is an ordinary
-- single-assignee task and every one of those six reads it the day it is made.
--
-- WHAT THIS DOES REVERSE is 0023's fourth decision, and it should be read as
-- reversed rather than quietly widened:
--
--     "4. Members do not assign themselves. Assignment is an admin act, exactly
--         like the task list itself (D5/D26). The member's own axis is
--         unchanged: raise my count, tighten my frequency (D51, 0021) — never
--         change what the circle asks of whom."
--
-- The clause after the dash still stands, and `personal_for` is what keeps it
-- standing. A member still cannot touch what the circle asks of anyone,
-- themselves included: the circle's tasks stay admin-authored, admin-assigned
-- and admin-targeted. What they gain is the ability to add something the circle
-- never asked for, carried by nobody but them. That is a THIRD thing beside
-- "what the circle asks" (0023/0032) and "what I privately aim at" (D51/0018),
-- and conflating it with either is how this column would go wrong.
--
-- ONE COLUMN, NOT A FLAG PLUS AN OWNER. `personal_for` is nullable and carries
-- the whole meaning: NULL is an ordinary circle task, set names the member
-- whose own task it is. A `personal boolean` beside a `created_by uuid` can
-- disagree with itself — a personal task with no owner, an owner on a circle
-- task — and there is no state where the two are both needed.
--
-- IT IS NOT AN ASSIGNMENT, and that distinction is load-bearing.
-- `task_assignments` remains the only answer to "was this task mine on that
-- day", because that question is historical and this column is not versioned.
-- `personal_for` says whose task it IS; `assigned_on` says whose it WAS. If
-- this column ever starts being read to decide a past day's obligation, it will
-- have reintroduced the retroactivity bug 0020/0021/0023/0024/0032 each paid
-- for once. It is read for exactly three things: who may edit it, whether the
-- CIRCLE's shared figures count it, and how the row is labelled on screen.
--
-- WHAT IT IS KEPT OUT OF (owner's call): the collective goal and the weekly
-- standings, both of which live in app code (`collectiveGoal`, and the
-- standings reducer on the group page). A cetele's shared bar is what the
-- circle agreed to split; a member who adds three tasks for themselves must not
-- be able to move it, and a ranking a member can climb by inventing work for
-- themselves is not a ranking. It stays in everything that judges the member
-- alone — their rings, their day, their streak, their garden — which is the
-- whole point of adding it.
--
-- WHAT IT IS NOT KEPT OUT OF: the circle can SEE it (owner's call). It is
-- listed on the group screen with the member's name against it, exactly as any
-- single-assignee task has been since 0023 — no new arm on
-- `tasks_select_member`, and no secret work.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- tasks.personal_for
-- ----------------------------------------------------------------------------

alter table public.tasks
  add column personal_for uuid references public.profiles on delete cascade;

-- Partial: the overwhelming majority of rows are NULL, and every read of this
-- column is "is it set, and to whom".
create index tasks_personal_for_idx on public.tasks (personal_for)
  where personal_for is not null;

comment on column public.tasks.personal_for is
  'NULL = an ordinary task of the circle. Set = a task this member added for '
  'themselves (0036, D70) — carried by nobody else, editable by them, and '
  'EXCLUDED from the circle''s collective goal and standings. It is not an '
  'assignment: task_assignments still answers "was this mine on that day", '
  'because that question is historical and this column is not versioned.';

-- No grant, in either direction. `authenticated` cannot set or change this
-- column by any client path — not on insert, not on update — so a task cannot
-- become personal, stop being personal, or change hands after it is made. The
-- only writer is `add_personal_task` below, which is SECURITY DEFINER.
--
-- Read is granted, because every screen that lists tasks needs to label it.
grant select (personal_for) on public.tasks to authenticated;

-- ----------------------------------------------------------------------------
-- The default assignment — one line, and it is the whole integration
-- ----------------------------------------------------------------------------
-- 0023 put this in the DB rather than in `addTask` so that a task inserted by
-- ANY path is carried by somebody: a task with no assignment row applies to
-- nobody and shows up on no screen, which is the worst default available and
-- the easiest to ship by accident. That argument holds here unchanged — so a
-- personal task gets its assignment from the same trigger, on the same anchor,
-- and there is still exactly one place a new task is first assigned.
--
-- The alternative was to let the trigger open the everyone-row as before and
-- have the RPC close it a microsecond later. That leaves a zero-width interval
-- (`assigned_at = unassigned_at`, which the table's own check permits) sitting
-- in the history of every personal task, for `assigned_on` to have an opinion
-- about on the boundary. There is no reason to create one.

create or replace function private.task_assign_everyone() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  -- NULL user_id = every member of the circle, resolved at read time (0023).
  -- A personal task opens the same interval for its one owner instead, so
  -- `new.personal_for` passes straight through as the assignee.
  insert into public.task_assignments (task_id, user_id, assigned_at)
  values (new.id, new.personal_for, new.created_at);
  return new;
end;
$$;

revoke all on function private.task_assign_everyone() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- public.add_personal_task — the only way a member adds one
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER because `tasks_insert_admin` stays exactly as it was: a
-- direct INSERT into `tasks` is still an admin act, and this function is the
-- single, named, audited hole in it rather than a widened policy that would
-- also let a member add a task for the whole circle.
--
-- Validation is here rather than in the server action for the reason D42 gives
-- every RPC in this repo: the action is a convenience, the function is the
-- rule. The bounds are the ones the table already keeps (`target_count > 0`,
-- `frequency_days between 1 and 14`) plus a non-empty label, checked here so
-- the member gets a sentence rather than a constraint violation.
--
-- Returns the row so the client can append it optimistically without a refetch
-- — `addTask`'s contract (CET-30) and D45's rule, on the screen where the
-- member has just typed it.

create or replace function public.add_personal_task(
  p_group     uuid,
  p_label     text,
  p_subtitle  text,
  p_target    integer,
  p_frequency integer
) returns public.tasks
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_caller_profile();
  v_label text := btrim(coalesce(p_label, ''));
  v_task  public.tasks;
begin
  -- Absent and forbidden look alike — no oracle for a circle the caller is not
  -- in (the increment_count convention, and set_task_assignees').
  if not private.is_group_member(p_group) then
    raise exception 'group not found';
  end if;

  if v_label = '' then
    raise exception 'a task needs a name';
  end if;

  if p_target is null or p_target < 1 then
    raise exception 'the target must be at least 1';
  end if;

  if p_frequency is null or p_frequency < 1 or p_frequency > 14 then
    raise exception 'how often must be between 1 and 14 days';
  end if;

  insert into public.tasks (
    group_id, label, subtitle, target_count, frequency_days, sort_order,
    personal_for
  )
  values (
    p_group,
    v_label,
    nullif(btrim(coalesce(p_subtitle, '')), ''),
    p_target,
    p_frequency,
    -- Append. `coalesce` covers the empty circle, which has no max at all.
    coalesce((select max(sort_order) + 1 from public.tasks where group_id = p_group), 0),
    v_uid
  )
  returning * into v_task;

  -- The assignment row is the trigger's, not ours (see above).
  return v_task;
end;
$$;

revoke all on function public.add_personal_task(uuid, text, text, integer, integer)
  from public, anon;
grant execute on function public.add_personal_task(uuid, text, text, integer, integer)
  to authenticated;

comment on function public.add_personal_task(uuid, text, text, integer, integer) is
  'Add a task the caller carries alone, in a circle they belong to (0036, D70). '
  'The single named exception to tasks_insert_admin: a member may add work for '
  'themselves and for nobody else. `personal_for` is set here and can never be '
  'changed afterwards — authenticated holds no write grant on that column.';

-- ----------------------------------------------------------------------------
-- Who may change one — the member, and the circle's admins (owner's call)
-- ----------------------------------------------------------------------------
-- Both, fully. The member owns what they added; the circle's owner and
-- co-admins keep the reach they have over every other row in their own task
-- list, including the ability to remove something that does not belong there.
--
-- The member's arm requires LIVE MEMBERSHIP as well as ownership. `personal_for`
-- outlives a membership — nothing revokes it when someone leaves — and 0019's
-- rule (applied again in 0034) is that the row survives while the CHECK happens
-- at the point of use. Someone who has left the circle keeps their history and
-- loses the ability to edit its task list, which is the same answer they get
-- for everything else in there.
--
-- INSERT is untouched: still `private.is_group_admin`. The RPC above is the
-- only way a member creates one.

drop policy tasks_update_admin on public.tasks;
create policy tasks_update_admin_or_own_personal on public.tasks
  for update to authenticated
  using (
    private.is_group_admin(group_id)
    or (personal_for = (select auth.uid()) and private.is_group_member(group_id))
  )
  with check (
    private.is_group_admin(group_id)
    or (personal_for = (select auth.uid()) and private.is_group_member(group_id))
  );

drop policy tasks_delete_admin on public.tasks;
create policy tasks_delete_admin_or_own_personal on public.tasks
  for delete to authenticated
  using (
    private.is_group_admin(group_id)
    or (personal_for = (select auth.uid()) and private.is_group_member(group_id))
  );

-- ----------------------------------------------------------------------------
-- set_task_assignees — a personal task's assignee is not up for discussion
-- ----------------------------------------------------------------------------
-- Unchanged except for the new guard. Without it an admin could hand somebody
-- else's personal task to the whole circle, and `personal_for` would go on
-- naming a member who no longer carries it — the column and the interval table
-- disagreeing about the same task, which is exactly the state the "it is not an
-- assignment" note in the header exists to prevent. Deleting the task is the
-- honest act, and an admin can do that.

create or replace function public.set_task_assignees(
  p_task     uuid,
  p_user_ids uuid[]
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := private.require_caller_profile();
  v_group    uuid;
  v_personal uuid;
begin
  select group_id, personal_for into v_group, v_personal
  from public.tasks where id = p_task;

  -- Absent and forbidden look alike — no oracle for a task in a circle the
  -- caller cannot see (the increment_count convention).
  if v_group is null or not private.is_group_admin(v_group) then
    raise exception 'task not found';
  end if;

  -- 0036: a personal task belongs to one member by construction.
  if v_personal is not null then
    raise exception 'a personal task is carried by the member who added it';
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

comment on function public.set_task_assignees(uuid, uuid[]) is
  'Set who a task is for (0023). NULL = everyone, an array = exactly those '
  'members, empty = refused, a PERSONAL task = refused (0036). Admin-only. '
  'Preserves the interval of anyone who is in the set both before and after, so '
  'a save cannot rewrite who owed what on a past day. `authenticated` holds no '
  'write grant on public.task_assignments.';
