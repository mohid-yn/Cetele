-- ============================================================================
-- CET-11 · Migration 0013 — M8: reminders + Web Push subscriptions
-- ----------------------------------------------------------------------------
-- The delivery half of D30 (member-set custom per-task reminder times) and D10
-- (Web Push + service worker). Push-only this round — the Resend email fallback
-- is deferred with the domain (D38).
--
-- WHY THE SCHEDULE LIVES IN THE DATABASE:
-- Vercel's Hobby plan caps cron at ONCE PER DAY with ±59 min of slop, so a
-- Vercel cron cannot fire a reminder at a member's chosen clock time. pg_cron —
-- already running the hourly streak rollover (0008) and the nightly rollup
-- (0010) — ticks every minute instead, and pg_net calls out to the Next.js
-- route /api/push/dispatch, which signs and sends with the VAPID key that
-- already lives in Vercel. Vercel does no scheduling; it is just the sender.
--
-- The DB ping carries no payload: the route calls claim_due_reminders() back,
-- so there is one source of truth for what is due, and the claim is ATOMIC —
-- it stamps last_sent_on in the same statement that selects the rows, so a slow
-- dispatch overlapping the next cron tick can never double-send.
-- ============================================================================

-- pg_net installs into its own `net` schema (it is not relocatable) — so the
-- dispatcher below calls net.http_post, not extensions.net.http_post.
create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- reminders (D30) — one per member per task: a plain clock time they set, in
-- their own timezone (profiles.timezone, D34), plus an on/off toggle.
-- ----------------------------------------------------------------------------

create table public.reminders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles on delete cascade,
  task_id      uuid not null references public.tasks    on delete cascade,
  time_of_day  time not null,
  enabled      boolean not null default true,
  -- The member's LOCAL date this reminder last went out — the dedup key. Job-
  -- written only (never client-writable), so a client can't re-arm a send.
  last_sent_on date,
  created_at   timestamptz not null default now(),
  unique (user_id, task_id)
);
create index reminders_user_id_idx on public.reminders (user_id);
create index reminders_task_id_idx on public.reminders (task_id);

alter table public.reminders enable row level security;

-- Yours alone — a reminder is a private setting, invisible even to a group
-- admin. No INSERT/UPDATE policy: writes go through set_reminder() below (see
-- the grants note), so there is no direct client write path to police.
create policy reminders_select_self on public.reminders
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy reminders_delete_self on public.reminders
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Grants (standard #6). Reads + delete are direct; WRITES ARE RPC-ONLY, like
-- logs (0008). Two reasons:
--   * atomicity — the UI saves on each interaction (pick a time, flip the
--     toggle), so two saves can be in flight at once. A read-then-write from the
--     client interleaves and the loser silently wins; a single ON CONFLICT
--     statement can't.
--   * last_sent_on is the job's alone. It is never granted, so no client can
--     re-arm a send.
grant select, delete on public.reminders to authenticated;

-- set_reminder — the ONLY write path for a reminder. One atomic statement, so
-- the UI's concurrent saves (time picker + toggle) can't interleave into a
-- half-applied row. The insert policy's membership rule is re-checked here
-- because a DEFINER function runs as postgres and bypasses RLS.
create or replace function public.set_reminder(
  p_task    uuid,
  p_time    time,
  p_enabled boolean
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  if not private.is_task_group_member(p_task) then
    raise exception 'not a member of this task''s group';
  end if;

  insert into public.reminders (user_id, task_id, time_of_day, enabled)
  values (v_uid, p_task, p_time, p_enabled)
  on conflict (user_id, task_id) do update
    set time_of_day = excluded.time_of_day,
        enabled     = excluded.enabled;
end;
$$;

revoke all on function public.set_reminder(uuid, time, boolean) from public, anon;
grant execute on function public.set_reminder(uuid, time, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- push_subscriptions — one row per browser/device install (a member may have
-- several: phone + desktop). The endpoint is the push service's opaque URL.
-- ----------------------------------------------------------------------------

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Yours alone. No UPDATE: a subscription is immutable — the browser re-subscribes
-- with a NEW endpoint when its old one expires, so churn is insert + delete.
create policy push_subscriptions_select_self on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy push_subscriptions_insert_self on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_delete_self on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, delete                                          on public.push_subscriptions to authenticated;
grant insert (user_id, endpoint, p256dh, auth, user_agent)    on public.push_subscriptions to authenticated;

-- The dispatcher prunes subscriptions a push service reports as gone (404/410).
-- service_role gets NOTHING by default here — 0006's default-privileges revoke
-- means a new table starts empty for every role — and nothing had used
-- service_role before M8, so this must be granted explicitly (standard #6).
-- Reminders need no grant: the claim runs inside a SECURITY DEFINER function.
grant select, delete on public.push_subscriptions to service_role;

-- ----------------------------------------------------------------------------
-- claim_due_reminders — the dispatcher's single source of truth.
--
-- ATOMIC CLAIM: the CTE stamps last_sent_on in the same statement that selects
-- the due rows, so two overlapping dispatch runs cannot both take a reminder.
-- Returns one row per (reminder × subscription) — a member may be installed on
-- several devices.
--
-- NOT client-callable: EXECUTE is granted to service_role only (the dispatch
-- route's key), so it never reaches the /rest/v1/rpc surface for a signed-in
-- user and adds no "exposed function" advisor WARN.
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
    where r.enabled
      -- A 5-minute window, not an exact minute: pg_cron can slip, and
      -- last_sent_on already makes a repeat send impossible. (A time near
      -- midnight simply gets a shorter window — the local date has rolled by
      -- then, which is the right behaviour anyway.)
      and (now() at time zone p.timezone)::time >= r.time_of_day
      and (now() at time zone p.timezone)::time <  r.time_of_day + interval '5 minutes'
      -- not already sent today, in the member's own day
      and (r.last_sent_on is null or r.last_sent_on <> private.user_today(r.user_id))
      -- don't nag a ring that's already closed (D8: no shame, no noise)
      and coalesce((
            select l.count from public.logs l
            where l.user_id = r.user_id
              and l.task_id = r.task_id
              and l.date    = private.user_today(r.user_id)
          ), 0) < t.target_count
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
    t.target_count,
    coalesce(l.count, 0),
    s.endpoint,
    s.p256dh,
    s.auth
  from claimed c
  join public.tasks t on t.id = c.task_id
  join public.push_subscriptions s on s.user_id = c.user_id
  left join public.logs l
    on l.user_id = c.user_id
   and l.task_id = c.task_id
   and l.date    = private.user_today(c.user_id);
end;
$$;

revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;

-- ----------------------------------------------------------------------------
-- The pg_cron tick. Pings the sender only when there is actually something due,
-- so the endpoint isn't woken 1,440 times a day for nothing.
--
-- The URL + shared secret live in Supabase Vault (never in this file, never in
-- git). If they are absent — every local stack, and prod until the operator
-- sets them — this is a silent no-op, so a fresh `db reset` never tries to call
-- out to the internet.
-- ----------------------------------------------------------------------------

create or replace function private.dispatch_reminders() returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (
    select 1
    from public.reminders r
    join public.profiles p on p.id = r.user_id
    join public.tasks    t on t.id = r.task_id
    where r.enabled
      and (now() at time zone p.timezone)::time >= r.time_of_day
      and (now() at time zone p.timezone)::time <  r.time_of_day + interval '5 minutes'
      and (r.last_sent_on is null or r.last_sent_on <> private.user_today(r.user_id))
      and exists (select 1 from public.push_subscriptions s where s.user_id = r.user_id)
  ) then
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

select cron.schedule(
  'reminder-dispatch',
  '* * * * *',
  $$select private.dispatch_reminders()$$
);
