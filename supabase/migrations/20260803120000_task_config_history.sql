-- ============================================================================
-- Migration 0024 — a past day is judged by the TARGET and CYCLE that day had
-- ----------------------------------------------------------------------------
-- The last third of the retroactivity family, open since 2026-08-01 and written
-- up in STATUS §2. 0020 fixed joining a circle (measured 10 -> 2), 0021 fixed an
-- admin ADDING a task (10 -> 1) by anchoring an obligation at `tasks.created_at`,
-- and 0023 fixed assignment by making it an interval instead of a set. Each time
-- the mechanism was identical: `private.obligations` answered "what did this
-- member owe on THIS DAY" out of a value that has no notion of when.
--
-- Two such values were left, and both sit on `tasks`:
--
--   * `target_count` — an admin raising 100 -> 500 makes every past day owe 500,
--     so a day genuinely kept at 100 becomes a miss and a rebuilt chain
--     collapses. Measured at 10 -> 1, for every member of the circle at once.
--   * `frequency_days` (0021) — the same bug one column along, and it moves in
--     BOTH directions: making a task rarer deletes occasions a member actually
--     kept, making it denser invents occasions they were never asked for and
--     could not have met.
--
-- `daily_completion` is hit differently and worse, because it is not a rebuild:
-- the nightly rollup recomputes `[today-15, today-1]` against whatever the
-- target is NOW, so a target rise silently rewrites the last fortnight of
-- consistency downward while every older row keeps the number it was written
-- with. The 90-day band therefore contains two incompatible measurements with
-- nothing marking the seam. That is fixed here for free — the rollup reads
-- `obligations`, so as soon as the target is as-of, a recompute reproduces the
-- number it wrote the first time. Idempotence was always the property the
-- rollup's header claimed; until now it did not have it.
--
-- WHY ONE TABLE FOR BOTH COLUMNS
--
-- They are the same fact — "what this task asked of you" — and they are read by
-- the same predicate on the same day. Versioning the target alone would leave a
-- second unversioned value inside the very expression this migration exists to
-- make as-of, which is 0023's "'everyone' is a row, not a flag" argument
-- verbatim: fix the family, not the instance.
--
-- WHY A TRIGGER AND NOT AN RPC
--
-- `grant update (label, subtitle, target_count, sort_order) on public.tasks to
-- authenticated` (0007) — an admin edits a task through PostgREST under RLS,
-- not through a function. There is no chokepoint to put this in, and adding one
-- would leave the direct UPDATE path silently unversioned. The trigger is the
-- only place that cannot be bypassed, which is the same reason 0023 puts the
-- default assignment in one.
--
-- BACKFILL — the dangerous part, and why it is safe
--
-- Every existing task gets ONE open version carrying its CURRENT target and
-- frequency, anchored at `tasks.created_at`. So the config it has now is treated
-- as the config it has always had, which reproduces today's behaviour exactly
-- for every existing row and every existing day. Anchoring at now() instead
-- would leave every day before this migration with no version in force — 0021's
-- and 0023's backfill lesson, for the third time.
--
-- Direction of change: nothing moves until an admin actually edits a task. From
-- then on, only days AFTER the edit see the new number, and no past day's
-- verdict can ever change again.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- task_config_versions — what a task asked for, and when
-- ----------------------------------------------------------------------------

create table public.task_config_versions (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.tasks on delete cascade,
  target_count   integer not null check (target_count > 0),
  frequency_days integer not null check (frequency_days between 1 and 14),
  effective_from timestamptz not null default now(),
  effective_to   timestamptz,
  check (effective_to is null or effective_to >= effective_from)
);

-- The lookup is always (task, day) and lands on the version list for one task.
create index task_config_versions_task_idx
  on public.task_config_versions (task_id, effective_from);

-- Exactly one OPEN version per task. This is what makes "the current config is
-- the current row" unfalsifiable rather than a convention the trigger happens
-- to keep.
create unique index task_config_versions_one_open
  on public.task_config_versions (task_id)
  where effective_to is null;

comment on table public.task_config_versions is
  'What a task asked for, over time (0024). One row per configuration INTERVAL: '
  'an admin edit closes the open row and opens a new one. Never deleted — '
  'private.obligations judges a past day by the target and cycle in force on '
  'that day, so raising a target cannot un-keep a day already kept.';

alter table public.task_config_versions enable row level security;

-- Read: any member of the circle the task belongs to — the same posture as
-- task_assignments, and for the same reason. The screens render a fortnight of
-- past days and have to agree with the engine about what each one asked for; a
-- history they cannot read is a history they would have to guess at.
create policy task_config_versions_select_member on public.task_config_versions
  for select to authenticated
  using (private.is_task_group_member(task_id));

-- No insert/update/delete policy and no write grant. History is written by the
-- trigger below and by nothing else: a client that could write here could
-- rewrite the days its own streak is computed from.
grant select on public.task_config_versions to authenticated;

-- ----------------------------------------------------------------------------
-- Backfill + the version every future task opens with
-- ----------------------------------------------------------------------------

insert into public.task_config_versions
  (task_id, target_count, frequency_days, effective_from)
select t.id, t.target_count, t.frequency_days, t.created_at
from public.tasks t;

create or replace function private.task_version_open() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.task_config_versions
    (task_id, target_count, frequency_days, effective_from)
  values (new.id, new.target_count, new.frequency_days, new.created_at);
  return new;
end;
$$;

revoke all on function private.task_version_open() from public, anon, authenticated;

create or replace function private.task_version_roll() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  -- Close the open interval and open the next one at the SAME instant, so the
  -- timeline has no hole. The as-of predicate is half-open on the upper bound
  -- (`day < effective_to::date`), so an edit made today leaves today governed by
  -- the new row and every completed day before it governed by the old one.
  update public.task_config_versions
     set effective_to = now()
   where task_id = new.id and effective_to is null;

  insert into public.task_config_versions
    (task_id, target_count, frequency_days, effective_from)
  values (new.id, new.target_count, new.frequency_days, now());

  return new;
end;
$$;

revoke all on function private.task_version_roll() from public, anon, authenticated;

create trigger tasks_open_config_version
  after insert on public.tasks
  for each row execute function private.task_version_open();

-- Only when one of the two versioned columns actually moves. A rename or a
-- re-order must not mint a version — the history would fill with rows that say
-- nothing, and "when did the target change?" would stop being answerable from it.
create trigger tasks_roll_config_version
  after update on public.tasks
  for each row
  when (
    old.target_count   is distinct from new.target_count
    or old.frequency_days is distinct from new.frequency_days
  )
  execute function private.task_version_roll();

-- ----------------------------------------------------------------------------
-- private.user_date — a timestamp, on the calendar the MEMBER is living in
-- ----------------------------------------------------------------------------
-- Every predicate in this engine takes `p_day` as the member's OWN local date
-- (D34) and then compared it against `some_timestamp::date`, which Postgres
-- resolves in the DATABASE's zone — UTC. Those are different calendars, and
-- the gap between them is a whole day for a large part of every day.
--
-- Measured, on this stack, with a member in Australia/Sydney: at 14:29 UTC it
-- is already 00:29 the next day in Sydney, so an admin raising a target "now"
-- writes `effective_from` on a UTC date that is the member's YESTERDAY — and
-- yesterday was then re-judged at the new target. That is the exact history
-- rewrite this migration exists to stop, sneaking back in through the date
-- cast. It fires for any member east of UTC during their morning, and for any
-- member west of it during their evening: roughly `abs(offset)/24` of all edits,
-- which for the +3 circles this app was built for is one edit in eight, and for
-- +10 is nearly half.
--
-- The same cast appears in three places, so this is one defect with three
-- instances, not three bugs: `tasks.created_at` (0021), `task_assignments`
-- (0023) and `task_config_versions` (here). All three now resolve through this.
--
-- SECURITY DEFINER + a profiles lookup per call is deliberate over passing the
-- zone in: two of the three callers already hold `p_user` and none holds a
-- timezone, and a second parameter that every caller must remember to fill
-- correctly is how the two copies of the reminder predicate drifted in 0019.

create or replace function private.user_date(p_user uuid, p_at timestamptz)
  returns date
  language sql security definer stable set search_path = '' as $$
  select (p_at at time zone coalesce(p.timezone, 'UTC'))::date
  from public.profiles p
  where p.id = p_user;
$$;

revoke all on function private.user_date(uuid, timestamptz)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- private.assigned_on — 0023's predicate, on the member's calendar
-- ----------------------------------------------------------------------------
-- Unchanged in meaning; both bounds simply stop being read in UTC. Without
-- this, a task assigned at 08:00 in Sydney is assigned "yesterday" as far as
-- the engine is concerned, and a member taken off one at 08:00 stops owing it
-- a day before they were told — which is the D8 failure 0023's own header
-- promises not to commit ("being taken off a task at 3pm must not leave you
-- owing it until midnight" — nor un-owing it since the previous midnight).

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
      and private.user_date(p_user, a.assigned_at) <= p_day
      and (a.unassigned_at is null
           or p_day < private.user_date(p_user, a.unassigned_at))
  );
$$;

revoke all on function private.assigned_on(uuid, uuid, date)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- private.task_config_on — the one definition of "what it asked for that day"
-- ----------------------------------------------------------------------------
-- TOTAL by construction: it always returns exactly one row for a task that has
-- any version at all, including for a day that PRECEDES the first version.
--
-- That fallback is not defensive tidiness, it is load-bearing. The D48 escape in
-- `obligations` deliberately reaches days before a task existed — a brand-new
-- circle's whole 14-day repair window predates its tasks (0021's header, and
-- the bug 0023 shipped and had to fix) — so a lookup that returned no row for
-- such a day would drop the task out of the join and silently delete the escape.
-- A pre-creation day is judged by the task's ORIGINAL configuration, which is
-- the only answer that does not depend on what an admin does later.
--
-- The ordering does the whole job: the version in force that day sorts first if
-- there is one (boolean DESC puts true above false), and the earliest version
-- wins otherwise.

-- The tie-break is on the raw TIMESTAMP, never on the reduced date: a task
-- created and then edited on the same day has two versions whose dates are
-- equal, and ordering by the date would pick between them arbitrarily.

create or replace function private.task_config_on(
  p_task uuid,
  p_user uuid,
  p_day  date
) returns table (target integer, frequency integer)
  language sql security definer stable set search_path = '' as $$
  select v.target_count, v.frequency_days
  from public.task_config_versions v
  where v.task_id = p_task
  order by (
             private.user_date(p_user, v.effective_from) <= p_day
             and (v.effective_to is null
                  or p_day < private.user_date(p_user, v.effective_to))
           ) desc,
           v.effective_from asc
  limit 1;
$$;

revoke all on function private.task_config_on(uuid, uuid, date)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- private.obligations — every number in it now comes from the day, not from now
-- ----------------------------------------------------------------------------
-- Unchanged from 0023 except that `t.target_count` and `t.frequency_days` are
-- gone from every clause. Repeated verbatim rather than patched, because
-- `create or replace function` needs the whole body and this is the one
-- predicate the entire app is judged by.
--
-- All FOUR references had to move together, and the three inside the escapes are
-- the easy ones to miss:
--
--   * the returned `target` — what day-completion and the rollup measure against;
--   * the membership escape's "I completed something in this circle that day";
--   * the task-age escape's "I completed THIS task that day";
--   * the assignment escape's, likewise.
--
-- Leaving an escape on the live target would mean a raised target retroactively
-- REVOKES a member's D48 repair: the day they closed at 100 stops counting as
-- completed the moment the circle asks for 500, which is the same history
-- rewrite wearing the escape's hat.
--
-- LEFT join, not inner. The trigger above guarantees a version for every task,
-- and the unique index guarantees exactly one is open — but if a row ever went
-- missing, an inner join would make the task vanish from every member's
-- obligations at once (owed by nobody, on no screen, with every streak silently
-- recomputing around the hole). Falling back to the task's live columns instead
-- degrades to the pre-0024 behaviour, which is wrong in a way that is visible.

create or replace function private.obligations(p_user uuid, p_day date)
  returns table (task_id uuid, group_id uuid, target integer)
  language sql security definer stable set search_path = '' as $$
  select t.id,
         t.group_id,
         coalesce(c.target, t.target_count)
  from public.tasks t
  join public.memberships m on m.group_id = t.group_id and m.user_id = p_user
  left join lateral private.task_config_on(t.id, p_user, p_day) c on true
  where (
          private.user_date(p_user, m.created_at) <= p_day
          or exists (
               select 1 from public.logs l2
               join public.tasks t2 on t2.id = l2.task_id
               left join lateral private.task_config_on(t2.id, p_user, p_day) c2 on true
               where l2.user_id = p_user
                 and l2.date    = p_day
                 and t2.group_id = t.group_id
                 and l2.count >= coalesce(c2.target, t2.target_count)
             )
        )
    and (
          private.task_due_on(
            private.user_date(p_user, t.created_at),
            coalesce(c.frequency, t.frequency_days),
            null,
            p_day
          )
          or exists (
               select 1 from public.logs l3
               where l3.user_id = p_user
                 and l3.task_id = t.id
                 and l3.date    = p_day
                 and l3.count >= coalesce(c.target, t.target_count)
             )
        )
    and (
          private.assigned_on(t.id, p_user, p_day)
          or exists (
               select 1 from public.logs l4
               where l4.user_id = p_user
                 and l4.task_id = t.id
                 and l4.date    = p_day
                 and l4.count >= coalesce(c.target, t.target_count)
             )
        );
$$;

revoke all on function private.obligations(uuid, date)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- private.due_reminders — the cycle anchor, on the member's calendar too
-- ----------------------------------------------------------------------------
-- Repeated from 0023 with one change: the schedule anchor is `user_date`, not
-- `created_at::date`. Everything else is kept verbatim.
--
-- The TARGET stays the live `tasks.target_count`, and that is correct rather
-- than an oversight: a reminder is about the day it fires on, which is always
-- today, and the version in force today IS the live row (an edit opens its
-- interval at now()). Routing it through `task_config_on` would compute the
-- identical answer through one more join per candidate reminder, every minute,
-- forever. The ANCHOR is different — it decides whether today is an occasion at
-- all, and reading it in UTC shifts a member's whole cycle by a day, so a
-- 3-day task would nag them on the two days it is resting and stay silent on
-- the day it is due.

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
    and private.assigned_on(r.task_id, r.user_id, private.user_today(r.user_id))
    and private.task_due_on(
          private.user_date(r.user_id, t.created_at),
          t.frequency_days, g.frequency_days,
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
-- What deliberately does NOT change
-- ----------------------------------------------------------------------------
--
-- `increment_count` / `set_count` likewise keep the live target for the D36a
-- sanity cap. The cap is a bound on what a client may write NOW; it is not a
-- verdict on a past day, and pinning it to a lowered historical target would
-- refuse a member the correction window they are entitled to.
--
-- Everything that IS a verdict — is_day_complete, owes_on, due_days,
-- refresh_streak, process_streak_rollovers, run_daily_rollup, and through the
-- rollup the 30-day band (D21), steadfastness (D31) and the garden (D49) —
-- reads `obligations` and inherits the as-of rule without a line changing.
