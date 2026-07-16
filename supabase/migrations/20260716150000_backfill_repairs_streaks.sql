-- ============================================================================
-- Migration 0017 — back-filling a day now FEEDS the streak (D48)
-- ----------------------------------------------------------------------------
-- Owner decision (2026-07-16): D8 makes back-fill a primary action ("come
-- back, don't quit"), but the streak engine ignored it — refresh_streak only
-- ran for p_date = today, so completing YESTERDAY via the DayStrip neither
-- prevented tonight's reset nor repaired one. The forgiveness UX and the
-- streak engine disagreed; D48 says the engine follows the UX.
--
-- HOW: refresh_streak no longer asks "did today just complete?" — it RECOMPUTES
-- the live chain, anchored at the present:
--
--   * the chain END is today (if kept) else yesterday (if kept) — a streak is
--     only alive if it reaches the present, so back-filling an isolated old
--     day changes nothing;
--   * WALK backwards over log-complete days (bounded by the 14-day retention
--     window, which equals the RPCs' write window);
--   * the STORED state still matters where logs can't see: a freeze-covered
--     day has no logs (the rollover job records it only as last_active), and a
--     chain longer than the window has no logs either. If the stored chain
--     overlaps/abuts the walked segment it extends it; one recorded miss away
--     with a freeze in hand, it bridges (continuity, not +1 — a covered day
--     marks the chain unbroken, it is not itself a kept day).
--   * `current` never silently decreases (a self-correct below target after
--     completing leaves the stored streak alone, as before).
--
-- The counting RPCs now call refresh_streak on EVERY successful write, not
-- just today's — a back-fill that completes a day inside the window repairs
-- the chain the moment it lands. The rollover job is unchanged (misses are
-- still its business).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- is_day_complete — one day's "every task in every group hit target" check.
-- TRUE for a user with no tasks; callers guard has-tasks first (as 0008 did).
-- ----------------------------------------------------------------------------

create or replace function private.is_day_complete(p_user uuid, p_day date) returns boolean
  language sql security definer stable set search_path = '' as $$
  select not exists (
    select 1 from public.tasks t
    join public.memberships m on m.group_id = t.group_id
    where m.user_id = p_user
      and coalesce((select l.count from public.logs l
                    where l.user_id = p_user and l.task_id = t.id and l.date = p_day), 0)
          < t.target_count
  );
$$;
revoke all on function private.is_day_complete(uuid, date) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- refresh_streak — present-anchored recompute (see header). The second
-- parameter is kept for interface stability but the walk ignores it: the
-- write that triggered us matters only through the logs it already changed.
-- (drop + recreate: `create or replace` cannot rename 0008's p_today param)
-- ----------------------------------------------------------------------------

drop function private.refresh_streak(uuid, date);
create function private.refresh_streak(p_user uuid, p_date date) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  s           public.streaks;
  v_has_tasks boolean;
  v_today     date;
  v_end       date;             -- chain end: today if kept, else yesterday
  v_hole      date;             -- first day below the walked segment
  v_walk      integer := 0;     -- log-complete days ending at v_end
  v_new       integer;
begin
  select exists (
    select 1 from public.tasks t
    join public.memberships m on m.group_id = t.group_id
    where m.user_id = p_user
  ) into v_has_tasks;
  if not v_has_tasks then return; end if;

  v_today := private.user_today(p_user);

  -- A streak is alive only if it reaches the present.
  if private.is_day_complete(p_user, v_today) then
    v_end := v_today;
  elsif private.is_day_complete(p_user, v_today - 1) then
    v_end := v_today - 1;
  else
    return;   -- present not kept in logs — misses are the rollover job's business
  end if;

  v_hole := v_end;
  while v_hole >= v_today - 13 and private.is_day_complete(p_user, v_hole) loop
    v_walk := v_walk + 1;
    v_hole := v_hole - 1;
  end loop;

  select * into s from public.streaks where user_id = p_user for update;
  if not found then
    insert into public.streaks (user_id, current, longest, last_active)
    values (p_user, v_walk, v_walk, v_end);
    return;
  end if;

  -- Stored state is ahead of what the logs support (e.g. a self-correct below
  -- target after the day already counted) — never demote implicitly.
  if s.last_active is not null and s.last_active > v_end then return; end if;

  v_new := v_walk;
  if s.current > 0 and s.last_active is not null then
    if s.last_active >= v_hole then
      -- The stored chain overlaps/abuts the walked segment (this also covers a
      -- freeze-covered day the job stamped as last_active, and a chain longer
      -- than the log window): count only the walked days ABOVE it.
      v_new := greatest(v_new, s.current + (v_end - s.last_active));
    elsif s.last_active = v_hole - 1 and s.freezes_left > 0 then
      -- Exactly one uncovered miss between the stored chain and the walked
      -- segment, freeze in hand → bridge it (continuity, not a kept day).
      v_new := greatest(v_new, s.current + v_walk);
    end if;
  end if;

  if v_new = s.current and s.last_active = v_end then return; end if; -- no news

  update public.streaks set
    current      = v_new,
    longest      = greatest(longest, v_new),
    last_active  = v_end,
    freezes_left = 1                 -- a kept day re-arms "never miss twice"
  where user_id = p_user;
end;
$$;

-- ----------------------------------------------------------------------------
-- The counting RPCs refresh on EVERY successful write (was: today only).
-- Bodies otherwise unchanged from 0016.
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

  perform private.refresh_streak(v_uid, p_date);   -- D48: back-fills repair too

  return v_count;
end;
$$;

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

  perform private.refresh_streak(p_user, p_date);   -- D48: back-fills repair too

  return p_count;
end;
$$;
