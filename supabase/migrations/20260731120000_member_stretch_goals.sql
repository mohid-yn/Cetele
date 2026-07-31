-- ============================================================================
-- Migration 0018 — member_task_goals: a member may raise their OWN bar (D51)
-- ----------------------------------------------------------------------------
-- Owner: "people should be able to increase their goals within a group if they
-- desire to." Until now `tasks.target_count` was the only target there was —
-- one number per task, set by the admin (D5/D6), shared by everyone.
--
-- The rule this table encodes, and the reason it is only a table plus one RPC:
--
--   effective target = greatest(tasks.target_count, coalesce(override, 0))
--
-- An override can therefore only ever RAISE the bar. Two consequences fall out
-- of that expression for free, which is why it is written this way rather than
-- as a constraint:
--
--   * A member cannot quietly owe the circle less than the circle asked. The
--     cetele is a shared goal split between people; opting down is not a
--     personal setting, it is a change to what everyone else has to carry.
--   * When an admin later raises the group target ABOVE somebody's override,
--     the group target simply wins. No clamping trigger, no backfill migration,
--     no stale row that silently lowers someone's bar months later. A CHECK
--     constraint could not have done this anyway — it cannot see another table.
--
-- WHAT READS THE OVERRIDE, AND WHAT DELIBERATELY DOES NOT
--
-- The personal goal is a STRETCH: it changes what the member is aiming at, and
-- nothing about what the app records or judges. It is read by exactly two
-- things — the member's own rings (client-side) and `claim_due_reminders`
-- below, which is the only mechanism that supports the stretch once it is set.
--
-- It is NOT read by `private.is_day_complete` / `refresh_streak`, by
-- `private.run_daily_rollup` (→ consistency, steadfastness D31, garden height
-- D49), or by the group's collective goal. Those all stay on the group target,
-- on purpose. If the personal goal drove them, then raising your goal would
-- make your own streak breakable, your consistency percentage lower and your
-- plant in the garden shorter than a member who never raised theirs — an
-- ambitious member would be punished for the ambition, which is the exact
-- shape D8 forbids. Extra counts still flow into the circle's numerator (they
-- always did — it is an uncapped sum), so a member taking more of the load
-- still visibly covers a member who fell short. That is the cetele.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- member_task_goals — one optional row per (member, task)
-- ----------------------------------------------------------------------------

create table public.member_task_goals (
  user_id      uuid not null references public.profiles on delete cascade,
  task_id      uuid not null references public.tasks    on delete cascade,
  target_count integer not null check (target_count > 0),
  updated_at   timestamptz not null default now(),
  primary key (user_id, task_id)
);

-- The PK covers user_id-led lookups (the member reading their own goals). The
-- task_id side needs its own index for the FK (the B7 lesson, 0005).
create index member_task_goals_task_id_idx on public.member_task_goals (task_id);

alter table public.member_task_goals enable row level security;

-- Read: your own rows, and nobody else's — not peers', not an admin's.
--
-- Note there is no group-membership check here, unlike `logs`. A row holds one
-- number belonging to one person, so own-row scoping already makes a leak
-- impossible, and this policy is evaluated on every Today render — adding a
-- SECURITY DEFINER membership call per row would buy nothing but latency. A
-- member who has left a circle keeps a dangling goal for a task they can no
-- longer see, which is inert (the task read that would surface it is itself
-- gated) and disappears with the task or the account.
--
-- Keeping the override private is also what stops it leaking into a collective
-- figure by accident: the group screens cannot read it, so they cannot use it.
create policy member_task_goals_select_own on public.member_task_goals
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Writes are RPC-only (B4), like every other write with a rule attached: the
-- raise-only floor and the sanity cap both need `tasks.target_count`, which a
-- client-side upsert cannot be trusted to have consulted.
grant select on public.member_task_goals to authenticated;

-- ----------------------------------------------------------------------------
-- set_task_goal — raise my bar for one task, or drop back to the circle's
-- ----------------------------------------------------------------------------

create or replace function public.set_task_goal(p_task uuid, p_target integer)
  returns integer   -- the EFFECTIVE target after the change
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_target integer;
  v_cap    integer;
begin
  if not private.is_task_group_member(p_task) then
    raise exception 'task not found';   -- no oracle: absent and forbidden look alike
  end if;

  select target_count into v_target from public.tasks where id = p_task;

  -- NULL, or anything at or below the circle's share, CLEARS the override
  -- rather than storing it. Storing a lower number would be dead data — the
  -- greatest() above already ignores it — and dead data that looks meaningful
  -- is how a "my goal is 50" bug gets reported against a group target of 100.
  if p_target is null or p_target <= v_target then
    delete from public.member_task_goals
     where user_id = v_uid and task_id = p_task;
    return v_target;
  end if;

  -- The same sanity cap `increment_count`/`set_count` enforce on the COUNT
  -- (D36a), against the same group target. A goal above it would be one the
  -- member could never legally reach: every write closing on it would be
  -- refused by the count cap, so the ring could not be closed at all.
  v_cap := greatest(v_target * 10, v_target + 1000);
  if p_target > v_cap then
    raise exception 'goal exceeds the sanity cap for this task';
  end if;

  insert into public.member_task_goals (user_id, task_id, target_count)
  values (v_uid, p_task, p_target)
  on conflict (user_id, task_id)
  do update set target_count = excluded.target_count,
                updated_at   = now();

  return p_target;
end;
$$;

revoke all on function public.set_task_goal(uuid, integer) from public, anon;
grant execute on function public.set_task_goal(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- claim_due_reminders — nag toward the EFFECTIVE target
-- ----------------------------------------------------------------------------
-- Unchanged except for the target: the closed-ring filter and the payload now
-- both read greatest(group target, my override).
--
-- This is the one place the stretch is enforced rather than merely displayed,
-- and it is a deliberate choice: the reminder is the only mechanism the goal
-- has behind it. A member who sets a bigger number and then stops hearing
-- about it at the circle's share has been given a decoration, not a goal. It
-- cannot become a nag someone is stuck with, because the member chose the
-- number themselves and can drop back to the circle's share in one tap.
-- ----------------------------------------------------------------------------

create or replace function public.claim_due_reminders()
  returns table (
    reminder_id   uuid,
    user_id       uuid,
    group_id      uuid,
    task_id       uuid,
    task_label    text,
    target_count  integer,
    current_count integer,
    endpoint      text,
    p256dh        text,
    auth          text
  )
  language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select r.id, r.user_id, r.task_id, private.user_today(r.user_id) as local_date
    from public.reminders r
    join public.profiles p on p.id = r.user_id
    join public.tasks    t on t.id = r.task_id
    left join public.member_task_goals g
      on g.user_id = r.user_id and g.task_id = r.task_id
    where r.enabled
      -- A 5-minute window, not an exact minute: pg_cron can slip, and
      -- last_sent_on already makes a repeat send impossible. (A time near
      -- midnight simply gets a shorter window — the local date has rolled by
      -- then, which is the right behaviour anyway.)
      and (now() at time zone p.timezone)::time >= r.time_of_day
      and (now() at time zone p.timezone)::time <  r.time_of_day + interval '5 minutes'
      -- not already sent today, in the member's own day
      and (r.last_sent_on is null or r.last_sent_on <> private.user_today(r.user_id))
      -- don't nag a ring that's already closed (D8: no shame, no noise) —
      -- closed at the member's OWN goal when they have raised it (D51)
      and coalesce((
            select l.count from public.logs l
            where l.user_id = r.user_id
              and l.task_id = r.task_id
              and l.date    = private.user_today(r.user_id)
          ), 0) < greatest(t.target_count, coalesce(g.target_count, 0))
      -- nothing to send to → don't burn the day's one send
      and exists (
            select 1 from public.push_subscriptions s where s.user_id = r.user_id
          )
  ),
  claimed as (
    update public.reminders r
       set last_sent_on = d.local_date
      from due d
     where r.id = d.id
    returning r.id, r.user_id, r.task_id
  )
  select
    c.id,
    c.user_id,
    t.group_id,
    c.task_id,
    t.label,
    greatest(t.target_count, coalesce(g.target_count, 0)),
    coalesce(l.count, 0),
    s.endpoint,
    s.p256dh,
    s.auth
  from claimed c
  join public.tasks t on t.id = c.task_id
  join public.push_subscriptions s on s.user_id = c.user_id
  left join public.member_task_goals g
    on g.user_id = c.user_id and g.task_id = c.task_id
  left join public.logs l
    on l.user_id = c.user_id
   and l.task_id = c.task_id
   and l.date    = private.user_today(c.user_id);
end;
$$;

revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;
