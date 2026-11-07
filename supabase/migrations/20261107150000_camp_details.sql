-- ============================================================================
-- Migration 0045: a camp's details, as fields (D84)
-- ----------------------------------------------------------------------------
-- A camp had one free-text "Details" box, so cost, what to bring and who to
-- call were buried in a paragraph. The owner asked for them as fields
-- (2026-11-07): cost, a what-to-bring list, a contact, and a day-by-day
-- schedule. "Details" stays, for everything else.
--
-- All on `events`, because they belong to one camp and are read with it. A
-- halaqah leaves them empty. Members read them through `events_select` (0043):
-- no new grant, no RPC change on the read side.
--
-- `save_camp` is replaced with the new fields as parameters, so a camp and its
-- details are written in one statement and cannot half-land.
-- ============================================================================

-- The schedule is a list of rows: { "day": 1, "time": "09:30", "label": "..." }.
-- Day 1 is the camp's first day. Time may be "" for an all-day line.
create or replace function private.valid_camp_schedule(s jsonb)
  returns boolean
  language sql immutable set search_path = '' as $$
  select jsonb_typeof(s) = 'array'
     and jsonb_array_length(s) <= 80
     and not exists (
       select 1 from jsonb_array_elements(s) as r(v)
        where jsonb_typeof(r.v) <> 'object'
           or jsonb_typeof(r.v -> 'day') <> 'number'
           or (r.v ->> 'day')::numeric not between 1 and 31
           or (r.v ->> 'day')::numeric <> trunc((r.v ->> 'day')::numeric)
           or jsonb_typeof(r.v -> 'time') <> 'string'
           or (r.v ->> 'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^$'
           or jsonb_typeof(r.v -> 'label') <> 'string'
           or char_length(btrim(r.v ->> 'label')) not between 1 and 120
     );
$$;

alter table public.events
  add column cost           text   not null default ''
    check (char_length(cost) <= 80),
  add column bring          text[] not null default '{}'
    check (cardinality(bring) <= 40
           and array_position(bring, null) is null),
  add column contact_name   text   not null default ''
    check (char_length(contact_name) <= 80),
  add column contact_detail text   not null default ''
    check (char_length(contact_detail) <= 120),
  add column schedule       jsonb  not null default '[]'::jsonb
    check (private.valid_camp_schedule(schedule));

comment on column public.events.cost is 'Free text, e.g. "$120, siblings $90". Empty = not stated (0045).';
comment on column public.events.bring is 'What to bring, one line each (0045).';
comment on column public.events.schedule is
  'Camp programme: [{day, time, label}], day 1 = first day (0045).';

-- Each item at most 120 characters. A check constraint cannot hold a subquery,
-- so this is a trigger.
create or replace function private.events_bring_lengths()
  returns trigger
  language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.bring) x where char_length(x) > 120) then
    raise exception 'each thing to bring must be 120 characters or fewer';
  end if;
  return new;
end;
$$;

create trigger events_bring_lengths
  before insert or update of bring on public.events
  for each row execute function private.events_bring_lengths();

drop function public.save_camp(uuid, uuid, text, text, text, timestamptz,
  timestamptz, text, timestamptz, integer, text);

create function public.save_camp(
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
  p_status         text,
  -- Defaults, so a caller that predates 0045 still saves a camp (with empty
  -- details) rather than failing on the arity.
  p_cost           text   default null,
  p_bring          text[] default null,
  p_contact_name   text   default null,
  p_contact_detail text   default null,
  p_schedule       jsonb  default null
)
  returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
  v_id  uuid := p_id;
  v_old public.events;
  -- Blank lines from the form are dropped, and blanks become empty, so the
  -- page can test one thing ("is there a cost") rather than two.
  v_cost    text   := btrim(coalesce(p_cost, ''));
  v_bring   text[] := coalesce(
                        (select array_agg(btrim(x) order by o)
                           from unnest(p_bring) with ordinality as u(x, o)
                          where btrim(x) <> ''),
                        '{}');
  v_cname   text   := btrim(coalesce(p_contact_name, ''));
  v_cdetail text   := btrim(coalesce(p_contact_detail, ''));
  v_sched   jsonb  := coalesce(p_schedule, '[]'::jsonb);
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
       rsvp_closes_at, capacity, status, created_by,
       cost, bring, contact_name, contact_detail, schedule)
    values
      (p_branch, 'camp', btrim(p_title), coalesce(p_details, ''),
       coalesce(p_venue, ''), p_starts_at, p_ends_at, p_timezone,
       p_rsvp_closes_at, p_capacity, coalesce(p_status, 'draft'), v_uid,
       v_cost, v_bring, v_cname, v_cdetail, v_sched)
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
           status = p_status, cost = v_cost, bring = v_bring,
           contact_name = v_cname, contact_detail = v_cdetail,
           schedule = v_sched, updated_at = now()
     where id = v_id;
  end if;

  insert into public.audit_log (actor_id, action, detail)
  values (v_uid, case when p_id is null then 'create_camp' else 'update_camp' end,
          jsonb_build_object('event_id', v_id, 'branch_id', p_branch,
                             'status', p_status));
  return v_id;
end;
$$;

revoke all on function public.save_camp(uuid, uuid, text, text, text, timestamptz,
  timestamptz, text, timestamptz, integer, text, text, text[], text, text, jsonb)
  from public, anon;
grant execute on function public.save_camp(uuid, uuid, text, text, text, timestamptz,
  timestamptz, text, timestamptz, integer, text, text, text[], text, text, jsonb)
  to authenticated;
