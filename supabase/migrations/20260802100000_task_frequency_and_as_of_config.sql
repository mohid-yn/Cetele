-- ============================================================================
-- Migration 0021 — a task need not be daily, and a past day is judged by the
-- configuration THAT DAY had (not the one it has now)
-- ----------------------------------------------------------------------------
-- Owner: "you should be able to configure the frequency of a task so it doesn't
-- need to be once a day but could be at maximum set to once every 14 days since
-- that's the extent of data we keep", cascaded into the member's own goals.
--
-- Four decisions were taken before writing this, all the owner's:
--
--   1. A day on which nothing is due is SKIPPED — it neither advances nor
--      breaks the chain. A streak is now "consecutive kept OCCASIONS", not
--      consecutive calendar days. The alternative (a day owing nothing counts
--      as kept) is the exact bug 0020's non-empty check exists to stop: it
--      hands a fortnight of streak to anyone who completes a single day.
--   2. The cycle is anchored at the TASK'S CREATION DATE. Every task runs its
--      own cycle from the day the admin made it.
--   3. A member may only make a task MORE frequent, never less — the frequency
--      axis of D51's raise-only floor. Opting DOWN is not a personal setting;
--      it changes what everyone else has to carry.
--   4. The retroactivity family is fixed here rather than left open, because
--      decision 2 forces the `created_at` column that fixing it needs.
--
-- WHY "MORE OFTEN" IS A UNION, NOT A SMALLER NUMBER
--
-- The obvious reading — effective frequency = least(circle, mine) — is WRONG,
-- and quietly so. A circle on every-3 owes days 0,3,6,9; a member who picks
-- every-2 owes 0,2,4,6,8. Day 3 is an occasion the circle asks for and the
-- member's own cycle skips, so "more often" would have silently DROPPED an
-- obligation. A member's occasions are therefore the UNION of the circle's
-- cycle and their own: the circle's days always stand, and the member's add to
-- them. That makes the superset property true by construction for any pair of
-- numbers, which is the only version that cannot lose a day.
--
-- WHAT THIS FIXES ON THE WAY PAST (the retroactivity family, STATUS §2)
--
-- `is_day_complete` judged a past day by the config as it stands NOW, and the
-- config was not versioned, so three edits rewrote history — all measured:
-- joining a circle (10 → 2, fixed in 0020), an admin ADDING A TASK (10 → 1) and
-- an admin RAISING A TARGET (10 → 1). Anchoring an obligation at
-- `tasks.created_at` closes the second: a task that did not exist on day D is
-- not owed on day D, so adding one can no longer collapse everyone's rebuilt
-- chain. The third (target history) is NOT closed here and is still open — see
-- STATUS; it needs a target-history table, not a column, and nothing in this
-- migration forces one.
--
-- BACKFILL — the dangerous part, and why it is safe
--
-- `created_at` defaults to now(), which for EXISTING tasks would mean "created
-- today", so no past day would owe anything, every past day would be
-- obligation-free, and every stored streak would collapse on its next rebuild.
-- Existing rows are therefore backfilled to their GROUP's creation date: a task
-- is treated as having existed since the circle began. That reproduces today's
-- behaviour exactly for all existing data — the as-of bound only starts biting
-- for tasks created after this migration — and it cannot be later than any log,
-- because a log needs a membership and a membership needs the group.
--
-- Direction of change at frequency_days = 1 (the default, and every existing
-- row): a task is due every day from the group's creation, which is precisely
-- the old predicate. Nothing moves until an admin sets a frequency.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- tasks — when it started, and how often it comes round
-- ----------------------------------------------------------------------------

alter table public.tasks
  add column created_at    timestamptz not null default now(),
  add column frequency_days integer    not null default 1
    check (frequency_days between 1 and 14);

-- Existing tasks predate this column: treat them as having existed since the
-- circle did, so no historical day loses an obligation it used to have.
update public.tasks t
   set created_at = g.created_at
  from public.groups g
 where g.id = t.group_id;

comment on column public.tasks.frequency_days is
  'How often this task comes round, in days. 1 = daily. Capped at 14 because '
  'raw logs are pruned at 14 days (D31a) — a longer cycle could not be seen.';

-- created_at is NOT client-writable (the anchor decides which past days were
-- owed; a client that could set it could rewrite its own history). frequency is,
-- for admins — RLS on tasks already restricts writes to group admins.
grant select (created_at, frequency_days) on public.tasks to authenticated;
grant insert (frequency_days)             on public.tasks to authenticated;
grant update (frequency_days)             on public.tasks to authenticated;

-- ----------------------------------------------------------------------------
-- member_task_goals — the member's own frequency, alongside their own count
-- ----------------------------------------------------------------------------
-- `target_count` becomes nullable: a member may now override the frequency
-- ALONE, and a row that carries only a frequency has no count to store. The
-- CHECK keeps a row from existing with nothing in it — an empty row is dead
-- data that reads as a setting.

alter table public.member_task_goals
  alter column target_count drop not null,
  add column frequency_days integer
    check (frequency_days between 1 and 14),
  add constraint member_task_goals_not_empty
    check (target_count is not null or frequency_days is not null);

grant select (frequency_days) on public.member_task_goals to authenticated;

-- ----------------------------------------------------------------------------
-- private.task_due_on — the whole schedule, in one expression
-- ----------------------------------------------------------------------------
-- IMMUTABLE and parameter-only so it can be inlined into every predicate below
-- and used in an index later if this ever needs one.

create or replace function private.task_due_on(
  p_created  date,
  p_freq     integer,
  p_my_freq  integer,   -- the member's override, or NULL
  p_day      date
) returns boolean
  language sql immutable set search_path = '' as $$
  select p_day >= p_created
     and (
           (p_day - p_created) % p_freq = 0
           -- The member's own cycle ADDS occasions; it never removes one (see
           -- the header — least() would drop days the circle still asks for).
        or (p_my_freq is not null and (p_day - p_created) % p_my_freq = 0)
         );
$$;

revoke all on function private.task_due_on(date, integer, integer, date)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- private.obligations — what this member owes on this day, and how much
-- ----------------------------------------------------------------------------
-- ONE definition of "owed", because this predicate has now been duplicated
-- twice in this repo's history and both copies drifted (0019's reminder guard,
-- and refresh_streak's inline copy in 0016). Everything below calls this.
--
-- Three bounds, each load-bearing:
--   * membership — 0020's rule, kept verbatim: I was in the circle that day, OR
--     I have logged in it that day (D48 lets a new member back-fill days from
--     before they joined, and a bare membership bound broke three of its
--     assertions).
--   * task age — new here: a task that did not exist on that day is not owed.
--   * the schedule — the task's cycle, plus mine if I have one.

-- THE CIRCLE'S NUMBERS ONLY — never the member's own (D51). Both of the
-- member's overrides are deliberately absent here:
--
--   * the count goal, because this feeds day-completion, the streak and the
--     rollup, and a member who raises their bar three-fold and then has an
--     ordinary day must not lose a streak a lazier member keeps;
--   * the frequency override, for exactly the same reason one step along. A
--     member who chooses to come round MORE often has added occasions to their
--     own aim, not to what the circle asks of them. Judging them on their extra
--     days would break a streak for the crime of doing more, which is the shape
--     D8 forbids and the precise failure D51 was written to prevent.
--
-- The overrides drive what the member AIMS at — their rings, and their
-- reminder, which is the one mechanism the stretch has behind it. Nothing here.

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
             )
        )
    -- Due that day by the CIRCLE's cycle (NULL override — the member's own is
    -- an aim, not an obligation) — OR the member logged THIS TASK that day.
    --
    -- The second half is the D48 escape hatch, and it has to be per-TASK where
    -- the membership bound above is per-GROUP. Both halves are load-bearing and
    -- they pull in opposite directions:
    --
    --   * without it, a BRAND-NEW circle cannot be back-filled at all — its
    --     tasks did not exist on the days D48 explicitly lets a member repair,
    --     so the whole back-fill window would silently count for nothing. This
    --     is the collision STATUS predicted when the retroactivity family was
    --     first written up, and it broke 3 e2e specs when tried without it.
    --   * making it per-GROUP instead would undo the retroactivity fix: a task
    --     added today would become owed on every past day the member happened
    --     to log anything in that circle — which is precisely the 10 → 1
    --     collapse this migration exists to stop.
    --
    -- Per-task threads both: a task you actually logged on a day counted that
    -- day; a task you did not is judged only by whether it was due.
    and (
          private.task_due_on(
            t.created_at::date, t.frequency_days, null, p_day
          )
          or exists (
               select 1 from public.logs l3
               where l3.user_id = p_user
                 and l3.task_id = t.id
                 and l3.date    = p_day
             )
        );
$$;

revoke all on function private.obligations(uuid, date)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- is_day_complete — unchanged contract, obligations now decide the set
-- ----------------------------------------------------------------------------
-- Still FALSE on a day that owes nothing: `not exists` over an empty set is
-- vacuously true, and a day you owed nothing is not a day you kept. Callers
-- that need to tell "nothing due" from "due and missed" ask `owes_on` too.

create or replace function private.is_day_complete(p_user uuid, p_day date)
  returns boolean
  language sql security definer stable set search_path = '' as $$
  select count(*) > 0
     and count(*) filter (
           where coalesce((
                   select l.count from public.logs l
                   where l.user_id = p_user
                     and l.task_id = o.task_id
                     and l.date    = p_day
                 ), 0) < o.target
         ) = 0
  from private.obligations(p_user, p_day) o;
$$;

revoke all on function private.is_day_complete(uuid, date)
  from public, anon, authenticated;

create or replace function private.owes_on(p_user uuid, p_day date)
  returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (select 1 from private.obligations(p_user, p_day));
$$;

revoke all on function private.owes_on(uuid, date) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- private.due_days — the member's occasions in a window, ascending
-- ----------------------------------------------------------------------------

create or replace function private.due_days(p_user uuid, p_from date, p_to date)
  returns setof date
  language sql security definer stable set search_path = '' as $$
  select d::date
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  where private.owes_on(p_user, d::date)
  order by 1;
$$;

revoke all on function private.due_days(uuid, date, date)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- refresh_streak — the same present-anchored walk, over OCCASIONS
-- ----------------------------------------------------------------------------
-- Every "yesterday" in 0017 became "the previous due day", and the walk skips
-- days that owe nothing instead of stopping at them. With every task daily —
-- the default and every pre-existing row — the due-day array is just the
-- calendar and this reduces exactly to 0017's behaviour.

create or replace function private.refresh_streak(p_user uuid, p_date date)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  s        public.streaks;
  v_today  date;
  v_days   date[];
  n        integer;
  i        integer;
  v_endi   integer;
  v_end    date;
  v_walk   integer := 0;
  v_hole   date;      -- the occasion just below the walked segment
  v_prev   date;      -- the occasion below THAT (for the freeze bridge)
  v_new    integer;
  v_gap    integer;
begin
  v_today := private.user_today(p_user);

  -- The member's occasions inside the log-retention window, ascending. Empty
  -- means nothing has ever been owed in the window — there is no chain to
  -- recompute, and (unlike 0017's has-tasks guard) this also covers a member
  -- whose every task is on a long cycle that simply has not come round.
  v_days := array(select private.due_days(p_user, v_today - 13, v_today));
  n := coalesce(array_length(v_days, 1), 0);
  if n = 0 then return; end if;

  -- A streak is alive only if it reaches the present. "The present" is the most
  -- recent OCCASION, not today: on a 3-day cycle, the day after a kept occasion
  -- owes nothing and must not read as a lapse. The one before it is allowed too,
  -- because the latest occasion may still be in progress.
  if private.is_day_complete(p_user, v_days[n]) then
    v_end := v_days[n]; v_endi := n;
  elsif n >= 2 and private.is_day_complete(p_user, v_days[n - 1]) then
    v_end := v_days[n - 1]; v_endi := n - 1;
  else
    return;   -- present not kept in logs — misses are the rollover job's business
  end if;

  i := v_endi;
  while i >= 1 and private.is_day_complete(p_user, v_days[i]) loop
    v_walk := v_walk + 1;
    i := i - 1;
  end loop;

  -- Below the segment: the first occasion NOT kept, or the window floor when the
  -- whole window is kept (which bounds every range computed from it to 14 days).
  v_hole := case when i >= 1 then v_days[i] else v_today - 14 end;

  select * into s from public.streaks where user_id = p_user for update;
  if not found then
    insert into public.streaks (user_id, current, longest, last_active)
    values (p_user, v_walk, v_walk, v_end);
    return;
  end if;

  -- Stored state ahead of what the logs support (e.g. a self-correct below
  -- target after the day already counted) — never demote implicitly.
  if s.last_active is not null and s.last_active > v_end then return; end if;

  v_new := v_walk;
  if s.current > 0 and s.last_active is not null then
    if s.last_active >= v_hole then
      -- The stored chain overlaps/abuts the walked segment. Add only the
      -- OCCASIONS above it — 0017 added calendar days, which on a cycle would
      -- credit every quiet day in between as a kept one.
      select count(*) into v_gap
        from private.due_days(p_user, s.last_active + 1, v_end);
      v_new := greatest(v_new, s.current + v_gap);
    else
      -- Exactly one uncovered MISSED OCCASION between the stored chain and the
      -- walked segment, freeze in hand → bridge it (continuity, not a kept day).
      select max(d) into v_prev
        from private.due_days(p_user, v_hole - 14, v_hole - 1) d;
      if v_prev is not null and s.last_active = v_prev and s.freezes_left > 0 then
        v_new := greatest(v_new, s.current + v_walk);
      end if;
    end if;
  end if;

  if v_new = s.current and s.last_active = v_end then return; end if; -- no news

  update public.streaks set
    current      = v_new,
    longest      = greatest(longest, v_new),
    last_active  = v_end,
    freezes_left = 1                 -- a kept occasion re-arms "never miss twice"
  where user_id = p_user;
end;
$$;

revoke all on function private.refresh_streak(uuid, date)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- process_streak_rollovers — misses judged on occasions, not calendar days
-- ----------------------------------------------------------------------------
-- The old job read `last_active = today - 2` as "exactly one missed day". On a
-- cycle that is wrong in both directions: it would spend a freeze for a quiet
-- day nobody owed, and it would reset a member two days after an occasion they
-- kept. Both now resolve through the member's own occasion list.
--
-- A LOOP, not the old set-based pair. `update ... from lateral (...)` cannot
-- reference the update target, and every bound here is per-member (each has
-- their own occasion list and their own midnight), so the set-based form would
-- need the same subquery three times over. At halaqah scale an hourly loop over
-- members with a LIVE streak is nothing.

create or replace function private.process_streak_rollovers() returns void
  language plpgsql security definer set search_path = '' as $$
declare
  r        record;
  v_today  date;
  v_closed date;   -- the most recent occasion that has fully closed
  v_prev   date;   -- the occasion before it
begin
  for r in select * from public.streaks where current > 0 loop
    v_today := private.user_today(r.user_id);

    -- The last occasion whose day is over. NULL = nothing has come round in the
    -- window (no tasks, or a long cycle mid-gap) — there is nothing to judge,
    -- which also subsumes 0008's has-tasks guard.
    select max(d) into v_closed
      from private.due_days(r.user_id, v_today - 14, v_today - 1) d;
    if v_closed is null then continue; end if;

    -- Already counted that occasion (or later) — nothing owed.
    if r.last_active is not null and r.last_active >= v_closed then continue; end if;

    select max(d) into v_prev
      from private.due_days(r.user_id, v_closed - 14, v_closed - 1) d;

    if r.freezes_left > 0 and v_prev is not null and r.last_active = v_prev then
      -- Exactly one missed OCCASION, freeze in hand → cover it and spend it.
      update public.streaks
         set freezes_left = freezes_left - 1, last_active = v_closed
       where user_id = r.user_id;
    else
      update public.streaks set current = 0 where user_id = r.user_id;
    end if;
  end loop;
end;
$$;

revoke all on function private.process_streak_rollovers()
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- run_daily_rollup — a day's percentage is over what was DUE that day
-- ----------------------------------------------------------------------------
-- A day that owed nothing produces NO ROW, exactly like a day before the member
-- joined. Writing 0 for a quiet day would drag consistency (D21), steadfastness
-- (D31) and the garden's height (D49) down for days nobody was asked to do
-- anything — a punishment mechanic for keeping a 3-day cycle correctly (D8).
--
-- The window and prune boundaries are UNCHANGED and must stay aligned (the
-- idempotence argument in 0009's header still holds verbatim).

create or replace function private.run_daily_rollup() returns void
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.daily_completion (user_id, group_id, date, completion_pct)
  select
    m.user_id,
    m.group_id,
    d::date,
    round(100.0 * avg(
      least(coalesce(l.count, 0), o.target)::numeric / o.target
    ), 2)
  from public.memberships m
  cross join lateral generate_series(
    greatest(m.created_at::date, current_date - 14)::timestamp,
    (current_date - 1)::timestamp,
    interval '1 day'
  ) as d
  -- INNER join: a day with no obligations contributes no row at all.
  join lateral private.obligations(m.user_id, d::date) o on o.group_id = m.group_id
  left join public.logs l
    on l.user_id = m.user_id and l.task_id = o.task_id and l.date = d::date
  where o.target > 0
  group by m.user_id, m.group_id, d::date
  on conflict (user_id, group_id, date)
  do update set completion_pct = excluded.completion_pct;

  delete from public.logs where date < current_date - 14;
  delete from public.daily_completion where date < current_date - 90;
end;
$$;

revoke all on function private.run_daily_rollup() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- due_reminders — never nag about a task that is not due today
-- ----------------------------------------------------------------------------
-- The one addition is the due check; 0019's membership guard and everything
-- else is kept verbatim. A reminder on a 3-day task now fires on its occasions
-- and is silent between them, which is the whole point of the setting.

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
    -- Due today, in the member's own day (D34).
    and private.task_due_on(
          t.created_at::date, t.frequency_days, g.frequency_days,
          private.user_today(r.user_id)
        )
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
-- set_task_goal — unchanged rule, but it must not delete a frequency override
-- ----------------------------------------------------------------------------

create or replace function public.set_task_goal(p_task uuid, p_target integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_target integer;
  v_cap    integer;
begin
  if not private.is_task_group_member(p_task) then
    raise exception 'task not found';
  end if;

  select target_count into v_target from public.tasks where id = p_task;

  if p_target is null or p_target <= v_target then
    -- Clear the COUNT override only — deleting the row outright would silently
    -- take the member's frequency with it.
    --
    -- DELETE first, then UPDATE. The other order fails: `set target_count =
    -- null` on a row with no frequency override leaves both columns null, and
    -- the not-empty CHECK is evaluated on that statement, before any follow-up
    -- delete can tidy it away.
    delete from public.member_task_goals
     where user_id = v_uid and task_id = p_task and frequency_days is null;
    update public.member_task_goals
       set target_count = null, updated_at = now()
     where user_id = v_uid and task_id = p_task;
    return v_target;
  end if;

  v_cap := greatest(v_target * 10, v_target + 1000);
  if p_target > v_cap then
    raise exception 'goal exceeds the sanity cap for this task';
  end if;

  insert into public.member_task_goals (user_id, task_id, target_count)
  values (v_uid, p_task, p_target)
  on conflict (user_id, task_id)
  do update set target_count = excluded.target_count, updated_at = now();

  return p_target;
end;
$$;

revoke all on function public.set_task_goal(uuid, integer) from public, anon;
grant execute on function public.set_task_goal(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- set_task_frequency — my own cycle, and only ever a denser one
-- ----------------------------------------------------------------------------
-- Returns the EFFECTIVE frequency after the change, so the client reconciles
-- from the write (D45) — including the clear case, where what comes back is the
-- circle's own number.

create or replace function public.set_task_frequency(p_task uuid, p_days integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := private.require_caller_profile();
  v_freq integer;
begin
  if not private.is_task_group_member(p_task) then
    raise exception 'task not found';
  end if;

  select frequency_days into v_freq from public.tasks where id = p_task;

  -- At or above the circle's interval is a CLEAR, not a looser cycle: a member
  -- may only ever come round more often than the circle asks (D51, frequency
  -- axis). Anything else is opting down, which changes what everyone carries.
  if p_days is null or p_days >= v_freq then
    -- DELETE before UPDATE, for the CHECK-constraint reason in set_task_goal.
    delete from public.member_task_goals
     where user_id = v_uid and task_id = p_task and target_count is null;
    update public.member_task_goals
       set frequency_days = null, updated_at = now()
     where user_id = v_uid and task_id = p_task;
    return v_freq;
  end if;

  if p_days < 1 then
    raise exception 'frequency out of range (1..14)';
  end if;

  insert into public.member_task_goals (user_id, task_id, frequency_days)
  values (v_uid, p_task, p_days)
  on conflict (user_id, task_id)
  do update set frequency_days = excluded.frequency_days, updated_at = now();

  return p_days;
end;
$$;

revoke all on function public.set_task_frequency(uuid, integer) from public, anon;
grant execute on function public.set_task_frequency(uuid, integer) to authenticated;
