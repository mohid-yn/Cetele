-- ============================================================================
-- Migration 0019 — a reminder only fires while you are still in the circle
-- ----------------------------------------------------------------------------
-- Found auditing 0018: `claim_due_reminders` never checked membership, and
-- leaving a circle deletes neither the `reminders` row nor the subscription. So
-- a member who left kept being pushed about that circle's tasks — forever.
--
-- It is the worst shape a notification bug can take, because the UI is already
-- correct: /profile builds its reminder rows from tasks in the circles you are
-- CURRENTLY in, so the orphaned row is invisible there. The member is therefore
-- pushed about a circle they left, with no control anywhere in the app to turn
-- it off, and nothing on screen even acknowledging it exists.
--
-- THE ROW IS KEPT, NOT DELETED. Deleting reminders when a membership goes was
-- the other candidate and is worse on the case that actually happens: an admin
-- removes someone by mistake, or a member leaves and rejoins, and their times
-- are gone. A reminder is a personal setting (D30) — it goes quiet while you
-- are out and comes back with you, at which point /profile can show it again.
-- Deleting also defends only the paths we thought of; the guard below covers
-- every way a reminder can outlive a membership, including ones not written yet.
--
-- WHY THE PREDICATE MOVES INTO ONE FUNCTION
--
-- The "is this reminder due" test existed TWICE — in `claim_due_reminders` and
-- again in `private.dispatch_reminders`, the pg_cron tick that decides whether
-- to wake the Vercel sender at all. Both were missing the membership check, so
-- fixing only the claim would have left the cron pinging the endpoint for an
-- ex-member roughly five times a day, forever, for a claim that now returns
-- nothing. An invisible second copy of a rule is exactly the drift this repo
-- has already paid for once (the CI env heredoc). There is now one copy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- private.due_reminders — the single definition of "due right now"
-- ----------------------------------------------------------------------------

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
    -- Still in the circle this task belongs to. Leaving (or being removed)
    -- silences the reminder without destroying the setting.
    and exists (
          select 1 from public.memberships m
          where m.group_id = t.group_id and m.user_id = r.user_id
        )
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
        );
$$;

revoke all on function private.due_reminders() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- claim_due_reminders — unchanged contract, predicate now borrowed
-- ----------------------------------------------------------------------------
-- The atomic claim is untouched: `claimed` still stamps last_sent_on in the
-- same statement that selects the due rows, so two overlapping dispatch runs
-- cannot both take a reminder.
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
    select d.reminder_id, d.user_id, d.task_id, d.local_date
    from private.due_reminders() d
  ),
  claimed as (
    update public.reminders r
       set last_sent_on = d.local_date
      from due d
     where r.id = d.reminder_id
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

-- ----------------------------------------------------------------------------
-- dispatch_reminders — the pg_cron tick, now asking the same question
-- ----------------------------------------------------------------------------

create or replace function private.dispatch_reminders() returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_url    text;
  v_secret text;
begin
  -- Wake the sender only when something is genuinely due, so the endpoint is
  -- not called 1,440 times a day for nothing — and, since 0019, not called at
  -- all for a member who has left.
  if not exists (select 1 from private.due_reminders()) then
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if v_url is null or v_secret is null then
    return; -- not configured (local/dev) — no-op rather than error
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := '{}'::jsonb
  );
end;
$$;

revoke all on function private.dispatch_reminders() from public, anon, authenticated;
