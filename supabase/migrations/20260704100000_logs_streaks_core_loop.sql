-- ============================================================================
-- CET-6/CET-8 · Migration 0008 — M3: the core loop (logs, streaks, timezone)
-- ----------------------------------------------------------------------------
-- The product: tap → count persists → ring fills → streak advances.
--
--   * profiles.timezone (D34) — each member's day closes at their OWN midnight;
--     auto-detected client-side, validated by trigger (invalid names throw).
--   * logs — the 14-day raw tally (D28/D31 retention; the prune itself is M6,
--     strictly after the rollup exists). `logged_by` = D29 attribution
--     (null = self; an admin proxy-log carries the admin's id).
--   * streaks — per user; advances THE MOMENT the day completes (all tasks in
--     all the user's groups hit target), for immediate feedback.
--   * "Never miss twice" (D8): freezes_left refills to 1 on every completed
--     day — a single missed day is always forgiven if you come back the next;
--     two consecutive misses reset. (The mock never refilled the freeze — a
--     demo artifact; a one-shot lifetime freeze would defeat D8's purpose.)
--   * Count-integrity (B4, D34-3 — PROPOSED DEFAULTS, owner approves in test):
--       1. logs writes are RPC-ONLY (like memberships) — no client DML, so the
--          bounds can't be bypassed.
--       2. increment_count: 1 ≤ delta ≤ 500 per call (a debounced client flush
--          of human tapping; ~10 taps/s ⇒ 500 covers any honest burst).
--       3. resulting count ≤ greatest(target × 10, target + 1000) — counting
--          PAST the target stays welcome (extra dhikr is normal; the mock kept
--          manual taps uncapped), forgery is capped.
--       4. date window: today back to 13 days ago, in the USER'S timezone —
--          the D8/D29 14-day back-fill + self-correct window; never future.
--   * set_count (D29): exact-set for admin proxy-log (attributed) and
--     self-correct (attribution cleared). Same cap + window.
--   * pg_cron hourly rollover — judges each user's just-closed day within an
--     hour of THEIR midnight (freeze or reset). Completion-side updates happen
--     inline in the RPCs, so the job only handles misses.
--
-- Client-callable SECURITY DEFINER RPCs grow to 6 (increment_count, set_count
-- join the 4 accepted advisor WARNs — all internally auth.uid()-guarded).
-- Explicit grants ship with each table (cross-cutting standard #6).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles.timezone (D34)
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column timezone text not null default 'UTC';

-- Invalid names would break the rollover job; `now() at time zone <tz>`
-- throws on garbage, which is exactly the validation we want. Guard fires on
-- client and server writes alike (defense-in-depth beyond the column grant).
create or replace function public.guard_profile_timezone() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.timezone is distinct from old.timezone then
    perform now() at time zone new.timezone;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_profile_timezone() from public, anon, authenticated;

create trigger guard_profile_timezone
  before insert or update on public.profiles
  for each row execute function public.guard_profile_timezone();

-- 0006's column-scoped grants must learn the new column (its comment said so).
grant insert (timezone) on public.profiles to authenticated;
grant update (timezone) on public.profiles to authenticated;

-- The user's "today", by their own clock. Everything date-windowed keys off it.
create or replace function private.user_today(u uuid) returns date
  language sql security definer stable set search_path = '' as $$
  select (now() at time zone coalesce(
    (select timezone from public.profiles where id = u), 'UTC'))::date;
$$;

-- ----------------------------------------------------------------------------
-- logs — the raw daily tally (kept 14 days once M6's rollup+prune lands)
-- ----------------------------------------------------------------------------

create table public.logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  task_id    uuid not null references public.tasks on delete cascade,
  date       date not null,
  count      integer not null default 0 check (count >= 0),
  logged_by  uuid references public.profiles on delete set null, -- D29: admin who proxy-logged; null = self
  updated_at timestamptz not null default now(),
  unique (user_id, task_id, date)              -- enables the increment upsert
);
create index logs_task_date_idx on public.logs (task_id, date);   -- collective counter
create index logs_user_date_idx on public.logs (user_id, date);   -- consistency / breakdown scans
create index logs_logged_by_idx on public.logs (logged_by);       -- FK hygiene (B7 lesson)

-- Membership checks that route through the task's group.
create or replace function private.is_task_group_member(t uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.tasks tk
    join public.memberships m on m.group_id = tk.group_id
    where tk.id = t and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_task_group_admin(t uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.tasks tk
    join public.memberships m on m.group_id = tk.group_id
    where tk.id = t and m.user_id = (select auth.uid())
      and m.role in ('owner','admin')
  );
$$;

alter table public.logs enable row level security;

-- Read: the whole group (peers' logs power the live counter + oversight, per
-- the locked D34 read-scope). Write: NOBODY directly — RPC-only (B4).
create policy logs_select_group_member on public.logs
  for select to authenticated
  using (private.is_task_group_member(task_id));

grant select on public.logs to authenticated;   -- and nothing else, ever

-- ----------------------------------------------------------------------------
-- streaks — one row per user, auto-created with the profile
-- ----------------------------------------------------------------------------

create table public.streaks (
  user_id      uuid primary key references public.profiles on delete cascade,
  current      integer not null default 0,
  longest      integer not null default 0,
  freezes_left integer not null default 1,      -- "never miss twice" (D8)
  last_active  date                              -- last day counted as kept (completed or freeze-covered)
);

alter table public.streaks enable row level security;

-- Read: self, or an owner/co-admin of a group you share (oversight surfaces).
create or replace function private.shares_group_as_admin(peer uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.memberships me
    join public.memberships them on them.group_id = me.group_id
    where me.user_id = (select auth.uid())
      and me.role in ('owner','admin')
      and them.user_id = peer
  );
$$;

create policy streaks_select_self_or_admin on public.streaks
  for select to authenticated
  using (user_id = (select auth.uid()) or private.shares_group_as_admin(user_id));

grant select on public.streaks to authenticated; -- writes: RPCs + the cron job only

-- Auto-create the streak row with each profile (and backfill existing ones).
create or replace function public.handle_new_profile() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.streaks (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_profile() from public, anon, authenticated;

create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.handle_new_profile();

insert into public.streaks (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- ----------------------------------------------------------------------------
-- Streak refresh — fires inside the counting RPCs when TODAY (the user's tz)
-- becomes fully complete. "Complete" = every task in every group the user
-- belongs to hit its target that day (identical to the mock for the
-- single-group flagship case).
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

  -- The rollover job "fills" a freeze-covered miss by setting last_active to
  -- the missed day, so continuity is always "last_active = yesterday".
  v_new := case when s.last_active = p_today - 1 then s.current + 1 else 1 end;

  update public.streaks set
    current      = v_new,
    longest      = greatest(longest, v_new),
    last_active  = p_today,
    freezes_left = 1                 -- refill: a kept day re-arms "never miss twice"
  where user_id = p_user;
end;
$$;

-- ----------------------------------------------------------------------------
-- increment_count — the tap path (self only; admin flows use set_count)
-- ----------------------------------------------------------------------------

create or replace function public.increment_count(p_task uuid, p_date date, p_delta integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_target integer;
  v_today  date;
  v_count  integer;
  v_cap    integer;
begin
  if v_uid is null then
    raise exception 'must be authenticated to count';
  end if;
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

revoke all on function public.increment_count(uuid, date, integer) from public, anon;
grant execute on function public.increment_count(uuid, date, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- set_count — exact-set: admin proxy-log (attributed, D29) or self-correct
-- ----------------------------------------------------------------------------

create or replace function public.set_count(p_user uuid, p_task uuid, p_date date, p_count integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_self   boolean;
  v_target integer;
  v_today  date;
  v_cap    integer;
begin
  if v_uid is null then
    raise exception 'must be authenticated';
  end if;
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

revoke all on function public.set_count(uuid, uuid, date, integer) from public, anon;
grant execute on function public.set_count(uuid, uuid, date, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- Rollover job — hourly, because midnights differ per timezone (D34). Only
-- handles the MISS side (completion updates inline above): within an hour of
-- each user's midnight, a missed yesterday consumes the freeze (streak lives,
-- the day is marked covered) or resets the streak.
-- ----------------------------------------------------------------------------

create or replace function private.process_streak_rollovers() returns void
  language plpgsql security definer set search_path = '' as $$
begin
  update public.streaks s
  set freezes_left = s.freezes_left - 1,
      last_active  = private.user_today(s.user_id) - 1
  where s.current > 0
    and s.freezes_left > 0
    and s.last_active = private.user_today(s.user_id) - 2  -- exactly one missed day
    and exists (select 1 from public.tasks t
                join public.memberships m on m.group_id = t.group_id
                where m.user_id = s.user_id);

  update public.streaks s
  set current = 0
  where s.current > 0
    and (s.last_active is null or s.last_active < private.user_today(s.user_id) - 1)
    and exists (select 1 from public.tasks t
                join public.memberships m on m.group_id = t.group_id
                where m.user_id = s.user_id);
end;
$$;
-- job-only: no client may call it
revoke all on function private.process_streak_rollovers() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.schedule(
  'streak-rollover-hourly',
  '5 * * * *',
  $$select private.process_streak_rollovers()$$
);
