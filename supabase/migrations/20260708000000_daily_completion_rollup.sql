-- ============================================================================
-- CET-16 · Migration 0010 — M6: the daily_completion rollup (B9, D31/D34)
-- ----------------------------------------------------------------------------
-- The longitudinal engine. Raw `logs` are pruned to 14 days (D28/D31); anything
-- that looks back further — the 30-day band, the 90-day group North Star,
-- steadfastness — reads a compact rollup instead of raw logs.
--
--   * memberships.created_at — a STABLE enrolment date. Steadfastness averages
--     a member's recent days from when they joined; the mock guessed this from
--     "earliest activity" (unstable once logs prune), so the real schema stores
--     it. Days before a member joined never drag their rate down (D31).
--   * daily_completion(user_id, group_id, date, completion_pct) — one small row
--     per member/group/day, kept 90 days. completion_pct = mean ring-fill
--     (partial credit, D31): avg over the group's tasks of least(count,target)
--     / target, ×100. A FULL day (every ring closed) ⇒ exactly 100.00; the
--     30-day band + group-90 count full days (completion_pct = 100),
--     steadfastness averages completion_pct itself.
--   * private.run_daily_rollup() — nightly pg_cron (D34, in-DB). Ordering the
--     whole retention split depends on: (1) WRITE the rollup for the recent
--     window FIRST, (2) THEN prune raw logs to 14 days, (3) THEN prune the
--     rollup to 90 days. IDEMPOTENT: the rollup window's oldest day equals the
--     prune boundary, so every recomputed day still has its raw logs — a
--     re-run / cron double-fire is a no-op (a wider window would recompute a
--     just-pruned day as 0). Must still run ~nightly: a day is rolled up on
--     each of its ~14 days in the window, then pruned; a long outage could let
--     a day age out before its final rollup — fine for a longitudinal metric.
--   * public.group_consistency(group, days) — the members-facing collective
--     figure (the North Star made visible). SECURITY DEFINER so a plain member
--     can see the group aggregate without reading peers' individual rows
--     (which RLS forbids). Joins the accepted client-callable RPC advisor WARNs
--     (→ 7). The 30-day band + steadfastness board read daily_completion
--     directly under RLS (self / same-group-admin) — no RPC needed.
--
-- Divergence from the mock (deliberate): the band + steadfastness measure
-- COMPLETED days only (exclude today, still in progress) — the rollup has no
-- row for today. The mock counted today; counting an in-progress day as
-- not-full would unfairly dip the number mid-day (D8).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- memberships.created_at — the enrolment date steadfastness spans from
-- ----------------------------------------------------------------------------

alter table public.memberships
  add column created_at timestamptz not null default now();

-- Not client-writable: 0006 scoped the INSERT grant to (user_id, group_id,
-- role), so created_at always takes its default. Table-level SELECT already
-- covers the new column. Nothing to grant.

-- ----------------------------------------------------------------------------
-- daily_completion — the 90-day rollup
-- ----------------------------------------------------------------------------

create table public.daily_completion (
  user_id        uuid not null references public.profiles on delete cascade,
  group_id       uuid not null references public.groups   on delete cascade,
  date           date not null,
  completion_pct numeric(5,2) not null check (completion_pct between 0 and 100),
  primary key (user_id, group_id, date)
);
-- group + date: the group-90 rollup and steadfastness board scan by group.
create index daily_completion_group_date_idx on public.daily_completion (group_id, date);

alter table public.daily_completion enable row level security;

-- Read: own rows (personal 30-day band) or a group you own/co-admin (the
-- admin-only steadfastness board + oversight). Same-group admin only — tighter
-- than shares_group_as_admin: an admin sees rows for groups THEY manage.
-- Peers' individual rows are never member-readable (privacy; the collective
-- figure comes through group_consistency instead). Writes: the job only.
create policy daily_completion_select_self_or_admin on public.daily_completion
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_group_admin(group_id)
  );

grant select on public.daily_completion to authenticated;  -- and nothing else

-- ----------------------------------------------------------------------------
-- The nightly rollup + prune (write-before-prune is the retention guarantee)
-- ----------------------------------------------------------------------------

create or replace function private.run_daily_rollup() returns void
  language plpgsql security definer set search_path = '' as $$
begin
  -- (1) WRITE the rollup for the recent completed-day window FIRST. The window
  -- [today-15, today-1] equals the raw range still present before step (2)
  -- prunes it — every day is rolled up (with any D29 proxy/self-corrections
  -- applied) before its raw logs are removed. Missed days within a member's
  -- enrolled span roll up as 0 (rewards frequency); days before they joined,
  -- or before any tasks exist, produce no row.
  insert into public.daily_completion (user_id, group_id, date, completion_pct)
  select
    m.user_id,
    m.group_id,
    d::date,
    round(100.0 * avg(
      least(coalesce(l.count, 0), t.target_count)::numeric / t.target_count
    ), 2)
  from public.memberships m
  join public.tasks t
    on t.group_id = m.group_id and t.target_count > 0
  -- The window START equals the prune boundary (current_date - 14) below, so
  -- every day it recomputes still has its raw logs — the rollup is IDEMPOTENT
  -- (a re-run, manual trigger, or cron double-fire yields the same value). A
  -- wider window that reached a day the prune removes would recompute that day
  -- as 0 the second time (its logs gone) — so window and prune MUST align.
  cross join lateral generate_series(
    greatest(m.created_at::date, current_date - 14)::timestamp,
    (current_date - 1)::timestamp,
    interval '1 day'
  ) as d
  left join public.logs l
    on l.user_id = m.user_id and l.task_id = t.id and l.date = d::date
  group by m.user_id, m.group_id, d::date
  on conflict (user_id, group_id, date)
  do update set completion_pct = excluded.completion_pct;

  -- (2) Prune raw logs older than the rollup window — now that everything in
  -- the window is rolled up. Keeps [current_date-14, today] (15 date-values,
  -- a day of tz slack over the 14-day correction window). A day leaves the
  -- window and is pruned only AFTER its final rollup on a prior run.
  delete from public.logs where date < current_date - 14;

  -- (3) Prune the rollup to 90 days (steadfastness / group-90 horizon).
  delete from public.daily_completion where date < current_date - 90;
end;
$$;
-- job-only: no client may call it
revoke all on function private.run_daily_rollup() from public, anon, authenticated;

-- pg_cron already enabled by 0008. Nightly at 02:00 UTC: the window recomputes
-- completed UTC-days with a day of slack, so a single daily run covers every
-- timezone (a member far ahead of UTC sees at most a <24h lag on these
-- longitudinal figures; the live counter uses raw logs, not the rollup).
select cron.schedule(
  'daily-completion-rollup',
  '0 2 * * *',
  $$select private.run_daily_rollup()$$
);

-- ----------------------------------------------------------------------------
-- group_consistency — the members-facing collective figure (North Star).
-- Mean over the group's members of each member's "% of the last N days fully
-- completed" (matches the mock's groupConsistency: mean of per-member
-- consistency). A member with no rows counts as 0% (they've completed no full
-- days), and the denominator is the fixed window N, so it reads as "the group
-- is at X% of steadfast days" — PRD §9's 70%/90-day North Star.
-- ----------------------------------------------------------------------------

create or replace function public.group_consistency(p_group uuid, p_days integer)
  returns integer
  language plpgsql security definer stable set search_path = '' as $$
declare
  v integer;
begin
  if not private.is_group_member(p_group) then
    raise exception 'group not found';   -- no oracle: absent and forbidden alike
  end if;
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'days out of range (1..90)';
  end if;

  select round(avg(member_pct))::integer into v
  from (
    select
      100.0 * count(*) filter (
        where dc.completion_pct = 100 and dc.date >= current_date - p_days
      ) / p_days as member_pct
    from public.memberships m
    left join public.daily_completion dc
      on dc.user_id = m.user_id and dc.group_id = m.group_id
    where m.group_id = p_group
    group by m.user_id
  ) x;

  return coalesce(v, 0);
end;
$$;
revoke all on function public.group_consistency(uuid, integer) from public, anon;
grant execute on function public.group_consistency(uuid, integer) to authenticated;
