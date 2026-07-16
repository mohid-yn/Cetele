-- ============================================================================
-- Migration 0016 — core-loop hardening (full-repo review, 2026-07-16)
-- ----------------------------------------------------------------------------
-- Two defects found by review, both in 0008's core loop:
--
-- (1) THE MIDNIGHT FREEZE RACE. The "never miss twice" freeze was applied only
--     by the hourly rollover job (:05 cron). A member who missed yesterday
--     (freeze in hand) and completed TODAY between their midnight and the next
--     tick — up to ~an hour for :30/:45-offset zones like India/Nepal — hit
--     refresh_streak first: it saw last_active = today-2, reset current to 1,
--     and stamped last_active = today, after which the job's freeze branch
--     (last_active = today-2) could never match. The freeze existed precisely
--     for that member, and showing up early destroyed it.
--     Fix: refresh_streak itself consumes the freeze when continuity is one
--     covered miss away — same net result as job-then-complete (current + 1,
--     freeze re-armed by the kept day), just no longer order-dependent.
--
-- (2) STALE-SESSION GUARDS (0012, finished). increment_count and set_count
--     still guarded only `auth.uid() is null`, so a JWT that outlived its
--     account (deleted user, up to an hour of signature validity) got a
--     misleading 'task not found' on every tap — with no PT401, so the app's
--     signOutIfStaleSession never fired and the member was stuck in a loop the
--     login page's self-heal bounced them straight back into. They now open
--     with private.require_caller_profile(), like every other write RPC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) refresh_streak — freeze-aware continuity
-- ----------------------------------------------------------------------------

create or replace function private.refresh_streak(p_user uuid, p_today date) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  s public.streaks;
  v_has_tasks boolean;
  v_complete  boolean;
  v_new       integer;
begin
  select exists (
    select 1 from public.tasks t
    join public.memberships m on m.group_id = t.group_id
    where m.user_id = p_user
  ) into v_has_tasks;
  if not v_has_tasks then return; end if;

  select not exists (
    select 1 from public.tasks t
    join public.memberships m on m.group_id = t.group_id
    where m.user_id = p_user
      and coalesce((select l.count from public.logs l
                    where l.user_id = p_user and l.task_id = t.id and l.date = p_today), 0)
          < t.target_count
  ) into v_complete;
  if not v_complete then return; end if;

  select * into s from public.streaks where user_id = p_user for update;
  if not found then
    insert into public.streaks (user_id, current, longest, last_active)
    values (p_user, 1, 1, p_today);
    return;
  end if;
  if s.last_active = p_today then return; end if; -- already counted today

  -- Continuity is "last_active = yesterday" (the rollover job normally fills a
  -- freeze-covered miss to make that true). If the job hasn't run yet — the
  -- member completed today between their midnight and the next hourly tick —
  -- apply the freeze HERE for exactly one missed day: the streak continues and
  -- the miss is spent, identical to the job-then-complete ordering.
  v_new := case
    when s.last_active = p_today - 1 then s.current + 1
    when s.last_active = p_today - 2 and s.freezes_left > 0 and s.current > 0
      then s.current + 1
    else 1
  end;

  update public.streaks set
    current      = v_new,
    longest      = greatest(longest, v_new),
    last_active  = p_today,
    freezes_left = 1                 -- refill: a kept day re-arms "never miss twice"
  where user_id = p_user;
end;
$$;

-- ----------------------------------------------------------------------------
-- (2a) increment_count — open with the caller-profile guard (PT401 when the
--      account behind the JWT is gone), body otherwise unchanged from 0008.
-- ----------------------------------------------------------------------------

create or replace function public.increment_count(p_task uuid, p_date date, p_delta integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_target integer;
  v_today  date;
  v_count  integer;
  v_cap    integer;
begin
  if p_delta is null or p_delta < 1 or p_delta > 500 then
    raise exception 'delta out of range (1..500)';
  end if;
  if not private.is_task_group_member(p_task) then
    raise exception 'task not found';    -- no oracle: absent and forbidden look alike
  end if;

  select target_count into v_target from public.tasks where id = p_task;
  v_today := private.user_today(v_uid);
  if p_date is null or p_date > v_today or p_date < v_today - 13 then
    raise exception 'date outside the 14-day logging window';
  end if;

  insert into public.logs (user_id, task_id, date, count)
  values (v_uid, p_task, p_date, p_delta)
  on conflict (user_id, task_id, date)
  do update set count = public.logs.count + excluded.count,
                updated_at = now()
  returning count into v_count;

  v_cap := greatest(v_target * 10, v_target + 1000);
  if v_count > v_cap then
    raise exception 'count exceeds the sanity cap for this task';
  end if;

  if p_date = v_today then
    perform private.refresh_streak(v_uid, v_today);
  end if;

  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- (2b) set_count — same guard, body otherwise unchanged from 0008.
-- ----------------------------------------------------------------------------

create or replace function public.set_count(p_user uuid, p_task uuid, p_date date, p_count integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_self   boolean;
  v_target integer;
  v_today  date;
  v_cap    integer;
begin
  v_self := (p_user = v_uid);
  if not v_self and not private.is_task_group_admin(p_task) then
    raise exception 'only the member or a group admin can set counts';
  end if;
  if v_self and not private.is_task_group_member(p_task) then
    raise exception 'task not found';
  end if;
  -- proxy target must actually be in the task's group
  if not v_self and not exists (
    select 1 from public.tasks tk
    join public.memberships m on m.group_id = tk.group_id
    where tk.id = p_task and m.user_id = p_user
  ) then
    raise exception 'that person is not in this group';
  end if;

  select target_count into v_target from public.tasks where id = p_task;
  v_cap := greatest(v_target * 10, v_target + 1000);
  if p_count is null or p_count < 0 or p_count > v_cap then
    raise exception 'count out of range';
  end if;

  -- 14-day window by the TARGET member's own clock (their day boundaries).
  v_today := private.user_today(p_user);
  if p_date is null or p_date > v_today or p_date < v_today - 13 then
    raise exception 'date outside the 14-day correction window';
  end if;

  insert into public.logs (user_id, task_id, date, count, logged_by)
  values (p_user, p_task, p_date, p_count, case when v_self then null else v_uid end)
  on conflict (user_id, task_id, date)
  do update set count      = excluded.count,
                logged_by  = excluded.logged_by, -- self-edit clears attribution (D29 mock)
                updated_at = now();

  if p_date = v_today then
    perform private.refresh_streak(p_user, v_today);
  end if;

  return p_count;
end;
$$;
