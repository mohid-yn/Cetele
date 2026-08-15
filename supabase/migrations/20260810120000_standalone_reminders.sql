-- ============================================================================
-- 0033 — a reminder is the MEMBER'S OWN: a name and a time, not a task (D62)
-- ============================================================================
--
-- Until now a reminder WAS a task: `unique (user_id, task_id)`, one row per
-- task, and the Profile screen listed every task in every circle the member
-- belonged to. That does not scale in the one direction this app is built to
-- grow — a member of three circles carrying five tasks each met fifteen time
-- pickers and could receive fifteen separate notifications in one evening. The
-- unit of a reminder was chosen by the circle's admin, not by the person being
-- reminded, and the person being reminded is the only one who knows that their
-- evening dhikr is ONE sitting.
--
-- So a reminder is now the member's own object: a label they write and a time
-- they pick. It belongs to no group and points at no task.
--
-- WHAT THIS DELIBERATELY GIVES UP (owner's call, 2026-08-10).
-- The old predicate fired only when the task was assigned to you, DUE that day,
-- and you were still SHORT of your target — 0032 had just taught it to read a
-- member's share as well. None of that survives, because none of it is knowable
-- about "Evening dhikr": a standalone reminder has nothing to compare a count
-- against. The reminder is a CLOCK, not a judge. It fires at the time it was
-- set for, on the days it is enabled, whether or not the member has already
-- finished — the cost is a notification on a day you were done by noon, and the
-- benefit is a rule a member can hold in their head, which is what makes them
-- leave reminders switched on at all.
--
-- The share-aware machinery `private.effective_target` gained in 0032 is
-- untouched and still carries day-completion, the streak and the collective —
-- it simply no longer has a reminder caller.
--
-- START CLEAN (owner's call). Existing rows are dropped rather than converted.
-- A per-task row cannot become a member-authored one without inventing the one
-- thing that matters — the name — and the feature is young enough that asking
-- the handful of people using it to set theirs up again is the honest trade.
-- ============================================================================

-- Return signatures change, so these are drops rather than replaces. Order
-- matters: the claim wraps the predicate, the predicate reads the table.
drop function if exists public.claim_due_reminders();
drop function if exists private.due_reminders();
drop function if exists public.set_reminder(uuid, time, boolean);
drop table if exists public.reminders;

create table public.reminders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles on delete cascade,
  -- The member's own words. Trimmed and bounded: it is rendered as a push
  -- NOTIFICATION TITLE, where the OS truncates without mercy and an empty
  -- string produces a notification that appears to come from nothing.
  label        text not null,
  time_of_day  time not null,
  enabled      boolean not null default true,
  -- The member's LOCAL date this reminder last went out — the dedup key. Job-
  -- written only (never client-writable), so a client can't re-arm a send.
  last_sent_on date,
  created_at   timestamptz not null default now(),
  constraint reminders_label_len
    check (length(btrim(label)) between 1 and 60)
);

-- The dispatcher sweeps by user; the member's own screen lists by user.
create index reminders_user_id_idx on public.reminders (user_id);

comment on table public.reminders is
  'A member''s own reminder: a label they wrote and a time they picked (D62). '
  'Belongs to no group and points at no task — it is a clock, not a judge.';

alter table public.reminders enable row level security;

-- Yours alone — a reminder is a private setting, invisible even to a group
-- admin. No INSERT/UPDATE policy: writes go through set_reminder() below, so
-- there is no direct client write path to police.
create policy reminders_select_self on public.reminders
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy reminders_delete_self on public.reminders
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Grants (standard #6). Reads + delete are direct; WRITES ARE RPC-ONLY, for the
-- reasons 0013 gave and one new one:
--   * atomicity — the row saves on each interaction (edit the name, pick a
--     time, flip the toggle), so two saves can be in flight at once;
--   * last_sent_on is the job's alone. It is never granted, so no client can
--     re-arm a send;
--   * the per-member CAP below is only a cap if every insert goes through it.
grant select, delete on public.reminders to authenticated;

-- ----------------------------------------------------------------------------
-- set_reminder — the ONLY write path. Insert when p_id is null, update when it
-- is given, and never touch a row belonging to somebody else.
-- ----------------------------------------------------------------------------
create or replace function public.set_reminder(
  p_id      uuid,
  p_label   text,
  p_time    time,
  p_enabled boolean
) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_caller_profile();
  v_label text := btrim(coalesce(p_label, ''));
  v_id    uuid;
  v_count integer;
begin
  -- Said out loud rather than silently clamped, which is this repo's standing
  -- rule for a refused write (D51, D61): a member who typed only spaces has to
  -- learn why nothing was saved.
  if length(v_label) = 0 then
    raise exception 'a reminder needs a name';
  end if;
  if length(v_label) > 60 then
    raise exception 'that name is too long (60 characters at most)';
  end if;

  if p_id is null then
    -- A ceiling, not a judgement about how many is sensible: without one, a
    -- single account can grow the dispatcher's per-minute sweep without bound.
    select count(*) into v_count from public.reminders where user_id = v_uid;
    if v_count >= 20 then
      raise exception 'that is as many reminders as one account can have (20)';
    end if;

    insert into public.reminders (user_id, label, time_of_day, enabled)
    values (v_uid, v_label, p_time, coalesce(p_enabled, true))
    returning id into v_id;
  else
    -- The user_id predicate is the ownership check. A DEFINER function runs as
    -- postgres and bypasses RLS, so the select policy above protects nothing
    -- here — this WHERE clause is the only thing standing between a guessed id
    -- and somebody else's reminder.
    -- MOVING THE TIME RE-ARMS TODAY, and this is a fix, not a nicety.
    --
    -- `claim_due_reminders` only fires when `last_sent_on <> today` (see it
    -- below), and nothing here used to clear that stamp — inherited from 0013,
    -- which had the same hole. So a reminder that fired at 07:00 and was then
    -- moved to 20:00 sat silent until tomorrow, and from the outside that is
    -- indistinguishable from a dropped invocation. It is the in-app twin of
    -- "the platform skipped an execution" and cost a real investigation.
    --
    -- Cleared only when the new time has NOT yet passed on the MEMBER's own
    -- clock (D34). Clearing unconditionally would make a move from 07:00 to
    -- 06:00 — both already gone — fire within the minute, which is a nag the
    -- member did not ask for and precisely what D8 rules out. A rename or a
    -- toggle never re-arms: neither changes the moment being asked for.
    update public.reminders
       set label       = v_label,
           time_of_day = p_time,
           enabled     = coalesce(p_enabled, enabled),
           last_sent_on = case
             when p_time is distinct from time_of_day
              and p_time > (now() at time zone coalesce(
                    (select timezone from public.profiles where id = v_uid),
                    'UTC'))::time
             then null
             else last_sent_on
           end
     where id = p_id and user_id = v_uid
    returning id into v_id;

    if v_id is null then
      raise exception 'no such reminder';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.set_reminder(uuid, text, time, boolean)
  from public, anon;
grant execute on function public.set_reminder(uuid, text, time, boolean)
  to authenticated;

comment on function public.set_reminder(uuid, text, time, boolean) is
  'Create (p_id null) or update one of the caller''s own reminders. The only '
  'write path: enforces the name, the 20-per-account cap, and ownership.';

-- ----------------------------------------------------------------------------
-- due_reminders — what is ripe RIGHT NOW, on each member's own clock (D34).
--
-- Far smaller than the predicate it replaces, and that IS the change: what is
-- left is a time window, a dedup key, and somewhere to deliver to. There is no
-- task to be assigned, due, or short of.
--
-- The five-minute window is unchanged (0013): pg_cron ticks every minute, and a
-- window wider than the tick means a single slow minute cannot skip a send,
-- while `last_sent_on` keeps the repeat from double-firing.
-- ----------------------------------------------------------------------------
create or replace function private.due_reminders()
  returns table (reminder_id uuid, user_id uuid, local_date date)
  language sql security definer set search_path = '' as $$
  select r.id, r.user_id, private.user_today(r.user_id)
  from public.reminders r
  join public.profiles p on p.id = r.user_id
  where r.enabled
    and (now() at time zone p.timezone)::time >= r.time_of_day
    and (now() at time zone p.timezone)::time <  r.time_of_day + interval '5 minutes'
    and (r.last_sent_on is null or r.last_sent_on <> private.user_today(r.user_id))
    and exists (
          select 1 from public.push_subscriptions s where s.user_id = r.user_id
        );
$$;

revoke all on function private.due_reminders() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- claim_due_reminders — stamp and return in ONE statement, so an overlapping
-- tick cannot double-send. Service role only; the sender holds the VAPID key.
-- ----------------------------------------------------------------------------
create or replace function public.claim_due_reminders()
  returns table (
    reminder_id uuid,
    user_id     uuid,
    label       text,
    endpoint    text,
    p256dh      text,
    auth        text
  )
  language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select d.reminder_id, d.user_id, d.local_date
    from private.due_reminders() d
  ),
  claimed as (
    update public.reminders r
       set last_sent_on = d.local_date
      from due d
     where r.id = d.reminder_id
    returning r.id, r.user_id, r.label
  )
  select
    c.id,
    c.user_id,
    c.label,
    s.endpoint,
    s.p256dh,
    s.auth
  from claimed c
  join public.push_subscriptions s on s.user_id = c.user_id;
end;
$$;

revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;

comment on function public.claim_due_reminders() is
  'Claim and return every reminder ripe now, one row per (reminder × device). '
  'Stamps last_sent_on in the same statement, so an overlapping tick cannot '
  'double-send.';
