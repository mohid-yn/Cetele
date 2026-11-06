-- ============================================================================
-- Migration 0043: events — camps, weekly halaqahs, RSVPs, polls, questions (D80)
-- ----------------------------------------------------------------------------
-- An event belongs to a BRANCH (0042) and reaches every circle at or under it.
-- Nobody opts a circle in. A roadmap needs that, because it creates work a
-- member is measured against; an event is an invitation, and each person
-- answers it for themselves.
--
-- WHO SEES WHAT
--   * A member: published events in their reach (`private.my_reach`). A member
--     with no circle, or whose circles sit in no branch, sees none. That is the
--     owner's call: the branch approval is what keeps venues private.
--   * RSVP: everyone who can see the event sees the COUNTS. NAMES go to the
--     branch's stewards only (owner's call, a youth organisation).
--   * Questions are anonymous to every reader, hosts included. `asker_id` is
--     stored so a person can delete their own, and so the per-person limit
--     works, but no read path returns it and no client role can select it.
--
-- KINDS
--   * `camp`: a one-off, posted by a steward, with an optional RSVP deadline,
--     capacity, and a note per person (dietary needs).
--   * `halaqah`: generated weekly from an `event_series`. Each week is its own
--     event row, because polls and questions belong to ONE week's session.
--
-- Nothing here is read by the core loop. Logging a tap touches none of it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table public.event_series (
  id               uuid primary key default gen_random_uuid(),
  branch_id        uuid not null references public.branches (id) on delete restrict,
  title            text not null check (char_length(btrim(title)) between 1 and 120),
  details          text not null default '' check (char_length(details) <= 4000),
  venue            text not null default '' check (char_length(venue) <= 300),
  -- 0 = Sunday, as `extract(dow ...)`.
  weekday          smallint not null check (weekday between 0 and 6),
  start_time       time not null,
  duration_minutes integer not null default 90 check (duration_minutes between 15 and 720),
  -- The VENUE's zone: 7pm in Melbourne is 7pm in Melbourne for a member
  -- travelling in Perth too, and the screen says so.
  timezone         text not null,
  active           boolean not null default true,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index event_series_branch_idx on public.event_series (branch_id);

create table public.events (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references public.branches (id) on delete restrict,
  series_id      uuid references public.event_series (id) on delete cascade,
  kind           text not null check (kind in ('camp', 'halaqah')),
  title          text not null check (char_length(btrim(title)) between 1 and 120),
  details        text not null default '' check (char_length(details) <= 4000),
  venue          text not null default '' check (char_length(venue) <= 300),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  timezone       text not null,
  rsvp_closes_at timestamptz,
  capacity       integer check (capacity is null or capacity between 1 and 100000),
  status         text not null default 'draft'
                   check (status in ('draft', 'published', 'cancelled')),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_at > starts_at),
  check (rsvp_closes_at is null or rsvp_closes_at <= ends_at),
  -- A weekly session is a halaqah and nothing else.
  check (series_id is null or kind = 'halaqah'),
  unique (series_id, starts_at)
);
create index events_branch_starts_idx on public.events (branch_id, starts_at);
create index events_series_idx on public.events (series_id);

comment on table public.events is
  'Camps and weekly halaqah sessions (0043, D80). Reaches every circle at or '
  'under branch_id. Halaqah rows with a series_id are generated weekly.';

create table public.series_hosts (
  series_id  uuid not null references public.event_series (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (series_id, user_id)
);
create index series_hosts_user_idx on public.series_hosts (user_id);

comment on table public.series_hosts is
  'Who leads a weekly halaqah (0043, D80): may run its polls and read and '
  'answer its questions. Not a steward, and sees no RSVP names.';

create table public.event_rsvps (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     text not null check (status in ('going', 'maybe', 'no')),
  note       text not null default '' check (char_length(note) <= 300),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_rsvps_user_idx on public.event_rsvps (user_id);

create table public.polls (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  kind       text not null check (kind in ('topic', 'food', 'activity', 'other')),
  question   text not null check (char_length(btrim(question)) between 1 and 200),
  closes_at  timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index polls_event_idx on public.polls (event_id);

create table public.poll_options (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.polls (id) on delete cascade,
  label      text not null check (char_length(btrim(label)) between 1 and 120),
  sort_order integer not null default 0
);
create index poll_options_poll_idx on public.poll_options (poll_id);

create table public.poll_votes (
  poll_id   uuid not null references public.polls (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  voted_at  timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index poll_votes_option_idx on public.poll_votes (option_id);

create table public.event_questions (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  -- NEVER RETURNED. See the header.
  asker_id    uuid references public.profiles (id) on delete set null,
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  answered_at timestamptz,
  hidden_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index event_questions_event_idx on public.event_questions (event_id);
create index event_questions_asker_idx on public.event_questions (asker_id);

create table public.question_upvotes (
  question_id uuid not null references public.event_questions (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  primary key (question_id, user_id)
);
create index question_upvotes_user_idx on public.question_upvotes (user_id);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

create or replace function private.hosts_series(s uuid)
  returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.series_hosts h
     where h.series_id = s and h.user_id = (select auth.uid())
  );
$$;

-- Runs the event: a steward of its branch, or a host of its series.
create or replace function private.can_lead_event(e uuid)
  returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.events ev
     where ev.id = e
       and (private.is_steward_of(ev.branch_id)
            or (ev.series_id is not null and private.hosts_series(ev.series_id)))
  );
$$;

-- Can read the event at all. Leaders see drafts; members see what is
-- published (or cancelled, so a cancellation is seen) in their reach.
create or replace function private.can_see_event(e uuid)
  returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.events ev
     where ev.id = e
       and (
             (ev.status <> 'draft'
              and ev.branch_id in (select private.my_reach()))
             or private.is_steward_of(ev.branch_id)
             or (ev.series_id is not null and private.hosts_series(ev.series_id))
           )
  );
$$;

revoke all on function private.hosts_series(uuid) from public;
revoke all on function private.can_lead_event(uuid) from public;
revoke all on function private.can_see_event(uuid) from public;
grant execute on function private.hosts_series(uuid) to authenticated;
grant execute on function private.can_lead_event(uuid) to authenticated;
grant execute on function private.can_see_event(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS. Events and series are readable through policies; RSVPs, polls and
-- questions only through the RPCs below, which is what keeps names and askers
-- where they belong. Every write is an RPC.
-- ----------------------------------------------------------------------------

alter table public.event_series enable row level security;
alter table public.events enable row level security;
alter table public.series_hosts enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.event_questions enable row level security;
alter table public.question_upvotes enable row level security;

create policy events_select on public.events
  for select to authenticated using (private.can_see_event(id));

create policy event_series_select on public.event_series
  for select to authenticated
  using (private.is_steward_of(branch_id) or private.hosts_series(id)
         or (active and branch_id in (select private.my_reach())));

create policy series_hosts_select on public.series_hosts
  for select to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.event_series s
                     where s.id = series_id and private.is_steward_of(s.branch_id)));

-- Your own answer, for the screen to show it. Nobody else's.
create policy event_rsvps_select_own on public.event_rsvps
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.events, public.event_series, public.series_hosts,
                public.event_rsvps
  to authenticated;
-- polls, poll_options, poll_votes, event_questions, question_upvotes: no client
-- grant at all. Read through the RPCs.
grant select, insert, update, delete on
  public.events, public.event_series, public.series_hosts, public.event_rsvps,
  public.polls, public.poll_options, public.poll_votes,
  public.event_questions, public.question_upvotes
  to service_role;

-- ----------------------------------------------------------------------------
-- Weekly sessions from a series
-- ----------------------------------------------------------------------------

-- Keep the next six weeks of a series' sessions in place. Idempotent: the
-- (series_id, starts_at) key makes a second run a no-op.
create or replace function private.materialise_series(s uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v       public.event_series;
  v_today date;
  v_first date;
  d       date;
  v_start timestamptz;
begin
  select * into v from public.event_series where id = s;
  if not found or not v.active then
    return;
  end if;

  v_today := (now() at time zone v.timezone)::date;
  -- The next date on the series' weekday, today included.
  v_first := v_today + ((v.weekday - extract(dow from v_today)::int + 7) % 7);

  for i in 0..5 loop
    d := v_first + i * 7;
    v_start := (d + v.start_time) at time zone v.timezone;
    if v_start + make_interval(mins => v.duration_minutes) <= now() then
      continue;
    end if;
    insert into public.events
      (branch_id, series_id, kind, title, details, venue, starts_at, ends_at,
       timezone, status, created_by)
    values
      (v.branch_id, v.id, 'halaqah', v.title, v.details, v.venue, v_start,
       v_start + make_interval(mins => v.duration_minutes), v.timezone,
       'published', v.created_by)
    on conflict (series_id, starts_at) do nothing;
  end loop;
end;
$$;

create or replace function private.materialise_all_series()
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  s uuid;
begin
  for s in select id from public.event_series where active loop
    perform private.materialise_series(s);
  end loop;
end;
$$;

revoke all on function private.materialise_series(uuid) from public, anon, authenticated;
revoke all on function private.materialise_all_series() from public, anon, authenticated;

select cron.schedule(
  'materialise-event-series',
  '30 3 * * *',
  $$select private.materialise_all_series()$$
);

-- ----------------------------------------------------------------------------
-- Writing events (stewards)
-- ----------------------------------------------------------------------------

-- Create (p_id null) or edit a camp. Publishing is a status; so is cancelling.
create or replace function public.save_camp(
  p_id             uuid,
  p_branch         uuid,
  p_title          text,
  p_details        text,
  p_venue          text,
  p_starts_at      timestamptz,
  p_ends_at        timestamptz,
  p_timezone       text,
  p_rsvp_closes_at timestamptz,
  p_capacity       integer,
  p_status         text
)
  returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
  v_id  uuid := p_id;
  v_old public.events;
begin
  if not private.is_steward_of(p_branch) then
    raise exception 'you do not run that branch';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'unknown time zone';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'the end must be after the start';
  end if;
  if p_rsvp_closes_at is not null and p_rsvp_closes_at > p_ends_at then
    raise exception 'replies must close before the camp ends';
  end if;

  if v_id is null then
    insert into public.events
      (branch_id, kind, title, details, venue, starts_at, ends_at, timezone,
       rsvp_closes_at, capacity, status, created_by)
    values
      (p_branch, 'camp', btrim(p_title), coalesce(p_details, ''),
       coalesce(p_venue, ''), p_starts_at, p_ends_at, p_timezone,
       p_rsvp_closes_at, p_capacity, coalesce(p_status, 'draft'), v_uid)
    returning id into v_id;
  else
    select * into v_old from public.events where id = v_id for update;
    if not found or v_old.kind <> 'camp' then
      raise exception 'camp not found';
    end if;
    -- Moving it needs the right to run BOTH branches.
    if not private.is_steward_of(v_old.branch_id) then
      raise exception 'you do not run that branch';
    end if;
    -- Once anyone can see it, it cannot go back to being a draft: that would
    -- make an event vanish from people who already said they are coming.
    if v_old.status <> 'draft' and p_status = 'draft' then
      raise exception 'a published camp can be cancelled, not unpublished';
    end if;
    update public.events
       set branch_id = p_branch, title = btrim(p_title),
           details = coalesce(p_details, ''), venue = coalesce(p_venue, ''),
           starts_at = p_starts_at, ends_at = p_ends_at, timezone = p_timezone,
           rsvp_closes_at = p_rsvp_closes_at, capacity = p_capacity,
           status = p_status, updated_at = now()
     where id = v_id;
  end if;

  insert into public.audit_log (actor_id, action, detail)
  values (v_uid, case when p_id is null then 'create_camp' else 'update_camp' end,
          jsonb_build_object('event_id', v_id, 'branch_id', p_branch,
                             'status', p_status));
  return v_id;
end;
$$;

-- A draft can be deleted outright. Anything published is cancelled instead,
-- so nobody's RSVP disappears without the event saying why.
create or replace function public.delete_event(p_event uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
  v     public.events;
begin
  select * into v from public.events where id = p_event;
  if not found then
    raise exception 'event not found';
  end if;
  if not private.is_steward_of(v.branch_id) then
    raise exception 'you do not run that branch';
  end if;
  if v.status <> 'draft' then
    raise exception 'cancel a published event instead of deleting it';
  end if;
  delete from public.events where id = p_event;
  insert into public.audit_log (actor_id, action, detail)
  values (v_uid, 'delete_event', jsonb_build_object('event_id', p_event));
end;
$$;

-- Cancel or restore one event, a single week of a halaqah included.
create or replace function public.set_event_cancelled(p_event uuid, p_cancelled boolean)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
  v     public.events;
begin
  select * into v from public.events where id = p_event;
  if not found then
    raise exception 'event not found';
  end if;
  if not private.is_steward_of(v.branch_id) then
    raise exception 'you do not run that branch';
  end if;
  if v.status = 'draft' then
    raise exception 'a draft is not live yet; delete it instead';
  end if;
  update public.events
     set status = case when p_cancelled then 'cancelled' else 'published' end,
         updated_at = now()
   where id = p_event;
  insert into public.audit_log (actor_id, action, detail)
  values (v_uid, case when p_cancelled then 'cancel_event' else 'restore_event' end,
          jsonb_build_object('event_id', p_event));
end;
$$;

-- Create (p_id null) or edit a weekly halaqah.
--
-- EDITING. Title, details and venue flow into every session still to come.
-- A change of day or time replaces the future sessions that nobody has touched
-- yet (no RSVP, poll or question); a session that already has activity keeps
-- its slot, because moving it would move people's answers with it.
-- Switching a series off cancels every session still to come.
create or replace function public.save_series(
  p_id               uuid,
  p_branch           uuid,
  p_title            text,
  p_details          text,
  p_venue            text,
  p_weekday          smallint,
  p_start_time       time,
  p_duration_minutes integer,
  p_timezone         text,
  p_active           boolean
)
  returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
  v_id  uuid := p_id;
  v_old public.event_series;
begin
  if not private.is_steward_of(p_branch) then
    raise exception 'you do not run that branch';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'unknown time zone';
  end if;

  if v_id is null then
    insert into public.event_series
      (branch_id, title, details, venue, weekday, start_time, duration_minutes,
       timezone, active, created_by)
    values
      (p_branch, btrim(p_title), coalesce(p_details, ''), coalesce(p_venue, ''),
       p_weekday, p_start_time, p_duration_minutes, p_timezone,
       coalesce(p_active, true), v_uid)
    returning id into v_id;
  else
    select * into v_old from public.event_series where id = v_id for update;
    if not found then
      raise exception 'halaqah not found';
    end if;
    if not private.is_steward_of(v_old.branch_id) then
      raise exception 'you do not run that branch';
    end if;

    update public.event_series
       set branch_id = p_branch, title = btrim(p_title),
           details = coalesce(p_details, ''), venue = coalesce(p_venue, ''),
           weekday = p_weekday, start_time = p_start_time,
           duration_minutes = p_duration_minutes, timezone = p_timezone,
           active = p_active
     where id = v_id;

    if v_old.weekday <> p_weekday or v_old.start_time <> p_start_time
       or v_old.duration_minutes <> p_duration_minutes
       or v_old.timezone <> p_timezone or not p_active then
      delete from public.events e
       where e.series_id = v_id
         and e.starts_at > now()
         and not exists (select 1 from public.event_rsvps r where r.event_id = e.id)
         and not exists (select 1 from public.polls p where p.event_id = e.id)
         and not exists (select 1 from public.event_questions q where q.event_id = e.id);
    end if;

    update public.events
       set branch_id = p_branch, title = btrim(p_title),
           details = coalesce(p_details, ''), venue = coalesce(p_venue, ''),
           status = case when p_active then status else 'cancelled' end,
           updated_at = now()
     where series_id = v_id and starts_at > now();
  end if;

  perform private.materialise_series(v_id);

  insert into public.audit_log (actor_id, action, detail)
  values (v_uid, case when p_id is null then 'create_series' else 'update_series' end,
          jsonb_build_object('series_id', v_id, 'branch_id', p_branch));
  return v_id;
end;
$$;

create or replace function public.appoint_series_host(p_series uuid, p_email text)
  returns table (user_id uuid, name text)
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_branch uuid;
  v_target uuid;
  v_name   text;
begin
  select branch_id into v_branch from public.event_series where id = p_series;
  if v_branch is null or not private.is_steward_of(v_branch) then
    raise exception 'you do not run that branch';
  end if;
  select u.id into v_target from auth.users u
   where lower(u.email) = lower(btrim(p_email));
  if v_target is null then
    raise exception 'no account with that email address';
  end if;
  insert into public.series_hosts (series_id, user_id)
  values (p_series, v_target) on conflict do nothing;
  if not found then
    raise exception 'that person already hosts this halaqah';
  end if;
  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'appoint_series_host', v_target,
          jsonb_build_object('series_id', p_series));
  select p.name into v_name from public.profiles p where p.id = v_target;
  return query select v_target, v_name;
end;
$$;

create or replace function public.remove_series_host(p_series uuid, p_user uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_branch uuid;
begin
  select branch_id into v_branch from public.event_series where id = p_series;
  if not (p_user = v_uid or (v_branch is not null and private.is_steward_of(v_branch))) then
    raise exception 'you do not run that branch';
  end if;
  delete from public.series_hosts where series_id = p_series and user_id = p_user;
  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'remove_series_host', p_user,
          jsonb_build_object('series_id', p_series));
end;
$$;

create or replace function public.list_series_hosts(p_series uuid)
  returns table (user_id uuid, name text, email text)
  language sql security definer stable set search_path = '' as $$
  select h.user_id, p.name, u.email::text
    from public.series_hosts h
    join public.event_series s on s.id = h.series_id
    join public.profiles p on p.id = h.user_id
    join auth.users u on u.id = h.user_id
   where h.series_id = p_series
     and private.is_steward_of(s.branch_id)
   order by p.name nulls last;
$$;

-- ----------------------------------------------------------------------------
-- The member's side: one read for the list, one tap to answer
-- ----------------------------------------------------------------------------

-- Everything coming up in the caller's reach, with their own answer and the
-- counts, in ONE round trip. This is what Today's card and /events read, so it
-- is shaped to need nothing else.
create or replace function public.my_upcoming_events(p_limit integer default 30)
  returns table (
    id uuid, kind text, title text, venue text, starts_at timestamptz,
    ends_at timestamptz, timezone text, status text, branch_name text,
    rsvp_closes_at timestamptz, capacity integer,
    my_status text, going integer, maybe integer,
    open_polls integer, my_open_votes integer, questions integer
  )
  language sql security definer stable set search_path = '' as $$
  select e.id, e.kind, e.title, e.venue, e.starts_at, e.ends_at, e.timezone,
         e.status, b.name, e.rsvp_closes_at, e.capacity,
         (select r.status from public.event_rsvps r
           where r.event_id = e.id and r.user_id = (select auth.uid())),
         (select count(*)::integer from public.event_rsvps r
           where r.event_id = e.id and r.status = 'going'),
         (select count(*)::integer from public.event_rsvps r
           where r.event_id = e.id and r.status = 'maybe'),
         (select count(*)::integer from public.polls p
           where p.event_id = e.id
             and coalesce(p.closes_at, e.starts_at) > now()),
         (select count(*)::integer from public.polls p
            join public.poll_votes v on v.poll_id = p.id
           where p.event_id = e.id
             and v.user_id = (select auth.uid())
             and coalesce(p.closes_at, e.starts_at) > now()),
         (select count(*)::integer from public.event_questions q
           where q.event_id = e.id and q.hidden_at is null)
    from public.events e
    join public.branches b on b.id = e.branch_id
   where e.status <> 'draft'
     and e.ends_at > now()
     and e.branch_id in (select private.my_reach())
   order by e.starts_at
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- One event in full, for its screen. Refuses anyone who cannot see it.
create or replace function public.event_detail(p_event uuid)
  returns table (
    id uuid, kind text, title text, details text, venue text,
    starts_at timestamptz, ends_at timestamptz, timezone text, status text,
    branch_id uuid, branch_name text, series_id uuid,
    rsvp_closes_at timestamptz, capacity integer,
    my_status text, my_note text, going integer, maybe integer, no integer,
    can_lead boolean, can_steward boolean
  )
  language sql security definer stable set search_path = '' as $$
  select e.id, e.kind, e.title, e.details, e.venue, e.starts_at, e.ends_at,
         e.timezone, e.status, e.branch_id, b.name, e.series_id,
         e.rsvp_closes_at, e.capacity,
         mine.status, coalesce(mine.note, ''),
         (select count(*)::integer from public.event_rsvps r
           where r.event_id = e.id and r.status = 'going'),
         (select count(*)::integer from public.event_rsvps r
           where r.event_id = e.id and r.status = 'maybe'),
         (select count(*)::integer from public.event_rsvps r
           where r.event_id = e.id and r.status = 'no'),
         private.can_lead_event(e.id),
         private.is_steward_of(e.branch_id)
    from public.events e
    join public.branches b on b.id = e.branch_id
    left join public.event_rsvps mine
      on mine.event_id = e.id and mine.user_id = (select auth.uid())
   where e.id = p_event
     and private.can_see_event(e.id);
$$;

-- Answer, change the answer, or clear it (p_status null). One call, one tap.
create or replace function public.set_rsvp(p_event uuid, p_status text, p_note text default null)
  returns text
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_caller_profile();
  v       public.events;
  v_going integer;
begin
  -- Locked, so two people taking the last place cannot both get it.
  select * into v from public.events where id = p_event for update;
  if not found or not private.can_see_event(p_event) then
    raise exception 'event not found';
  end if;
  if v.status <> 'published' then
    raise exception 'this event is not taking replies';
  end if;
  if now() >= coalesce(v.rsvp_closes_at, v.ends_at) then
    raise exception 'replies have closed';
  end if;

  if p_status is null then
    delete from public.event_rsvps where event_id = p_event and user_id = v_uid;
    return null;
  end if;
  if p_status not in ('going', 'maybe', 'no') then
    raise exception 'answer going, maybe or no';
  end if;

  if p_status = 'going' and v.capacity is not null then
    select count(*) into v_going from public.event_rsvps
     where event_id = p_event and status = 'going' and user_id <> v_uid;
    if v_going >= v.capacity then
      raise exception 'this event is full';
    end if;
  end if;

  insert into public.event_rsvps (event_id, user_id, status, note, updated_at)
  values (p_event, v_uid, p_status, left(coalesce(btrim(p_note), ''), 300), now())
  on conflict (event_id, user_id) do update
    set status = excluded.status,
        -- A tap that changes only the answer leaves the note alone.
        note = case when p_note is null then public.event_rsvps.note
                    else excluded.note end,
        updated_at = now();
  return p_status;
end;
$$;

-- Names, for the branch's stewards only (owner's call). Hosts get counts.
create or replace function public.event_attendees(p_event uuid)
  returns table (user_id uuid, name text, status text, note text,
                 updated_at timestamptz)
  language sql security definer stable set search_path = '' as $$
  select r.user_id, p.name, r.status, r.note, r.updated_at
    from public.event_rsvps r
    join public.events e on e.id = r.event_id
    join public.profiles p on p.id = r.user_id
   where r.event_id = p_event
     and private.is_steward_of(e.branch_id)
   order by case r.status when 'going' then 0 when 'maybe' then 1 else 2 end,
            p.name nulls last;
$$;

-- ----------------------------------------------------------------------------
-- Polls
-- ----------------------------------------------------------------------------

create or replace function public.create_poll(
  p_event     uuid,
  p_kind      text,
  p_question  text,
  p_options   text[],
  p_closes_at timestamptz default null
)
  returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := private.require_caller_profile();
  v_id   uuid;
  v_opts text[];
  i      integer;
begin
  if not private.can_lead_event(p_event) then
    raise exception 'only the event''s stewards or hosts can run a poll';
  end if;
  select coalesce(array_agg(o order by n), '{}') into v_opts
    from (select btrim(o) as o, n
            from unnest(p_options) with ordinality as t(o, n)
           where btrim(o) <> '') x;
  if cardinality(v_opts) < 2 or cardinality(v_opts) > 8 then
    raise exception 'a poll has 2 to 8 options';
  end if;

  insert into public.polls (event_id, kind, question, closes_at, created_by)
  values (p_event, p_kind, btrim(p_question), p_closes_at, v_uid)
  returning id into v_id;
  for i in 1..cardinality(v_opts) loop
    insert into public.poll_options (poll_id, label, sort_order)
    values (v_id, v_opts[i], i);
  end loop;
  return v_id;
end;
$$;

create or replace function public.delete_poll(p_poll uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
begin
  perform private.require_caller_profile();
  select event_id into v_event from public.polls where id = p_poll;
  if v_event is null or not private.can_lead_event(v_event) then
    raise exception 'poll not found';
  end if;
  delete from public.polls where id = p_poll;
end;
$$;

-- Vote, or change your vote. p_option null takes it back.
create or replace function public.vote_poll(p_poll uuid, p_option uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_caller_profile();
  v_poll  public.polls;
  v_event public.events;
begin
  select * into v_poll from public.polls where id = p_poll;
  if not found or not private.can_see_event(v_poll.event_id) then
    raise exception 'poll not found';
  end if;
  select * into v_event from public.events where id = v_poll.event_id;
  if v_event.status <> 'published' then
    raise exception 'this event is not taking votes';
  end if;
  if now() >= coalesce(v_poll.closes_at, v_event.starts_at) then
    raise exception 'this poll has closed';
  end if;

  if p_option is null then
    delete from public.poll_votes where poll_id = p_poll and user_id = v_uid;
    return;
  end if;
  if not exists (select 1 from public.poll_options
                  where id = p_option and poll_id = p_poll) then
    raise exception 'that is not an option in this poll';
  end if;
  insert into public.poll_votes (poll_id, user_id, option_id)
  values (p_poll, v_uid, p_option)
  on conflict (poll_id, user_id) do update
    set option_id = excluded.option_id, voted_at = now();
end;
$$;

-- Every poll on an event with its tally and the caller's own vote. Tallies
-- only; who voted for what is not readable by anyone.
create or replace function public.event_polls(p_event uuid)
  returns table (poll_id uuid, kind text, question text, closes_at timestamptz,
                 option_id uuid, label text, sort_order integer, votes integer,
                 mine boolean)
  language sql security definer stable set search_path = '' as $$
  select p.id, p.kind, p.question, coalesce(p.closes_at, e.starts_at),
         o.id, o.label, o.sort_order,
         (select count(*)::integer from public.poll_votes v where v.option_id = o.id),
         exists (select 1 from public.poll_votes v
                  where v.option_id = o.id and v.user_id = (select auth.uid()))
    from public.polls p
    join public.events e on e.id = p.event_id
    join public.poll_options o on o.poll_id = p.id
   where p.event_id = p_event
     and private.can_see_event(p_event)
   order by p.created_at, o.sort_order;
$$;

-- ----------------------------------------------------------------------------
-- Anonymous questions
-- ----------------------------------------------------------------------------

create or replace function public.ask_question(p_event uuid, p_body text)
  returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
  v     public.events;
  v_id  uuid;
begin
  select * into v from public.events where id = p_event;
  if not found or not private.can_see_event(p_event) then
    raise exception 'event not found';
  end if;
  if v.status <> 'published' or now() >= v.ends_at then
    raise exception 'this event is not taking questions';
  end if;
  -- Five live questions each per event. The limit is why the asker is stored.
  if (select count(*) from public.event_questions
       where event_id = p_event and asker_id = v_uid) >= 5 then
    raise exception 'you have asked 5 questions for this event already';
  end if;
  begin
    insert into public.event_questions (event_id, asker_id, body)
    values (p_event, v_uid, btrim(p_body))
    returning id into v_id;
  exception when check_violation then
    raise exception 'a question is 1 to 500 characters';
  end;
  return v_id;
end;
$$;

create or replace function public.delete_my_question(p_question uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  delete from public.event_questions
   where id = p_question and asker_id = v_uid;
  if not found then
    raise exception 'question not found';
  end if;
end;
$$;

create or replace function public.upvote_question(p_question uuid, p_on boolean)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_caller_profile();
  v_event uuid;
begin
  select event_id into v_event from public.event_questions
   where id = p_question and hidden_at is null;
  if v_event is null or not private.can_see_event(v_event) then
    raise exception 'question not found';
  end if;
  if p_on then
    insert into public.question_upvotes (question_id, user_id)
    values (p_question, v_uid) on conflict do nothing;
  else
    delete from public.question_upvotes
     where question_id = p_question and user_id = v_uid;
  end if;
end;
$$;

-- Answered and hidden are the leader's. Hidden is for abuse: the question
-- leaves everyone's list but the leaders'.
create or replace function public.set_question_state(
  p_question uuid,
  p_answered boolean,
  p_hidden   boolean
)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
begin
  perform private.require_caller_profile();
  select event_id into v_event from public.event_questions where id = p_question;
  if v_event is null or not private.can_lead_event(v_event) then
    raise exception 'question not found';
  end if;
  update public.event_questions
     set answered_at = case when p_answered then coalesce(answered_at, now()) end,
         hidden_at   = case when p_hidden   then coalesce(hidden_at, now())   end
   where id = p_question;
end;
$$;

-- The list, most upvoted first. NO ASKER — `mine` is a yes/no about the
-- caller and nothing more, so a person can find and delete their own.
create or replace function public.event_question_list(p_event uuid)
  returns table (id uuid, body text, upvotes integer, i_upvoted boolean,
                 mine boolean, answered boolean, hidden boolean,
                 created_at timestamptz)
  language sql security definer stable set search_path = '' as $$
  select q.id, q.body,
         (select count(*)::integer from public.question_upvotes u where u.question_id = q.id),
         exists (select 1 from public.question_upvotes u
                  where u.question_id = q.id and u.user_id = (select auth.uid())),
         q.asker_id = (select auth.uid()),
         q.answered_at is not null,
         q.hidden_at is not null,
         q.created_at
    from public.event_questions q
   where q.event_id = p_event
     and private.can_see_event(p_event)
     and (q.hidden_at is null or private.can_lead_event(p_event))
   order by (q.answered_at is not null), 3 desc, q.created_at;
$$;

-- ----------------------------------------------------------------------------
-- The leader's side: what a steward or host runs
-- ----------------------------------------------------------------------------

-- Every event the caller can run that has not ended, drafts included, plus the
-- series they can edit. One read for the admin list.
create or replace function public.events_i_lead()
  returns table (id uuid, kind text, title text, starts_at timestamptz,
                 ends_at timestamptz, timezone text, status text,
                 branch_id uuid, branch_name text, series_id uuid,
                 going integer, questions integer, can_steward boolean)
  language sql security definer stable set search_path = '' as $$
  select e.id, e.kind, e.title, e.starts_at, e.ends_at, e.timezone, e.status,
         e.branch_id, b.name, e.series_id,
         (select count(*)::integer from public.event_rsvps r
           where r.event_id = e.id and r.status = 'going'),
         (select count(*)::integer from public.event_questions q
           where q.event_id = e.id and q.hidden_at is null),
         private.is_steward_of(e.branch_id)
    from public.events e
    join public.branches b on b.id = e.branch_id
   where e.ends_at > now() - interval '1 day'
     and (private.is_steward_of(e.branch_id)
          or (e.series_id is not null and private.hosts_series(e.series_id)))
   order by e.starts_at
   limit 200;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.save_camp(uuid, uuid, text, text, text, timestamptz, timestamptz, text, timestamptz, integer, text)',
    'public.delete_event(uuid)',
    'public.set_event_cancelled(uuid, boolean)',
    'public.save_series(uuid, uuid, text, text, text, smallint, time, integer, text, boolean)',
    'public.appoint_series_host(uuid, text)',
    'public.remove_series_host(uuid, uuid)',
    'public.list_series_hosts(uuid)',
    'public.my_upcoming_events(integer)',
    'public.event_detail(uuid)',
    'public.set_rsvp(uuid, text, text)',
    'public.event_attendees(uuid)',
    'public.create_poll(uuid, text, text, text[], timestamptz)',
    'public.delete_poll(uuid)',
    'public.vote_poll(uuid, uuid)',
    'public.event_polls(uuid)',
    'public.ask_question(uuid, text)',
    'public.delete_my_question(uuid)',
    'public.upvote_question(uuid, boolean)',
    'public.set_question_state(uuid, boolean, boolean)',
    'public.event_question_list(uuid)',
    'public.events_i_lead()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- delete_branch (0042) refuses a branch holding circles; with events here it
-- must also refuse one holding events or a series, by name rather than as a
-- foreign-key error.
create or replace function public.delete_branch(p_branch uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_parent uuid;
begin
  select parent_id into v_parent from public.branches where id = p_branch;
  if not found then
    raise exception 'branch not found';
  end if;
  if not (private.is_super_admin()
          or (v_parent is not null and private.is_steward_of(v_parent))) then
    raise exception 'only someone who runs the branch above can delete this one';
  end if;
  if exists (select 1 from public.branches where parent_id = p_branch) then
    raise exception 'delete or move the branches inside it first';
  end if;
  if exists (select 1 from public.groups where branch_id = p_branch) then
    raise exception 'circles are still in this branch';
  end if;
  if exists (select 1 from public.events where branch_id = p_branch)
     or exists (select 1 from public.event_series where branch_id = p_branch) then
    raise exception 'this branch still has events';
  end if;

  delete from public.branches where id = p_branch;

  insert into public.audit_log (actor_id, action, detail)
  values (v_uid, 'delete_branch', jsonb_build_object('branch_id', p_branch));
end;
$$;
