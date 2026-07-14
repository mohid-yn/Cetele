-- ============================================================================
-- CET-17…CET-22 · Migration 0015 — the v2 retention layer, made real
-- ----------------------------------------------------------------------------
-- The six v2 features have lived in the CET-14 mock since D22. Converting them
-- is NOT six new backends: four of the six are DERIVED from data we already
-- store, and only two need to persist anything at all.
--
--   CET-17 group garden      → derived: group_consistency(g, 30) + today's
--                              collective total. No table.
--   CET-22 pair goals        → derived: the 7-day days-active figure the
--                              Standings board (M5) already computes, plus a
--                              deterministic buddy pick. No table.
--   CET-21 endowed progress  → derived: memberships.created_at (a new member)
--                              + the circle's REAL collective progress today.
--                              Deliberately NO fabricated logs — this is a
--                              worship tracker, and a count that was never
--                              performed must never be written (D43).
--   CET-18 peer reactions    → `reactions`            (new, below)
--   CET-20 achievement badges→ `badges` + `badge_awards` (new, below)
--   CET-19 fresh-start       → `banner_dismissals`    (new, below)
--
-- D43 (this migration): AN EARNED BADGE IS PERMANENT. The mock re-derived
-- consistency badges from a live 30-day window every render, so a badge could
-- silently un-earn itself when a member dipped. That is a punishment mechanic —
-- it contradicts D8 (never shame) and D28's white-hat rules (no rich-get-richer,
-- no loss framing). So an award is WRITTEN DOWN once and never revoked; the
-- window only ever decides when you *first* cross the bar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- reactions (CET-18) — a one-tap dua / kudos on a peer's day.
--
-- Grain: one row per (sender → peer, group, kind, day). The unique constraint
-- IS the toggle: tap once to send, tap again to take it back (the RPC deletes).
-- ----------------------------------------------------------------------------

create table public.reactions (
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles on delete cascade,
  to_user_id   uuid not null references public.profiles on delete cascade,
  group_id     uuid not null references public.groups   on delete cascade,
  kind         text not null check (kind in ('dua', 'mashaAllah', 'heart', 'fire')),
  -- The SENDER's local date, stamped by the RPC from profiles.timezone (D34) —
  -- never passed in, so a client cannot back-date an encouragement.
  date         date not null,
  created_at   timestamptz not null default now(),
  -- You cannot cheer yourself.
  constraint reactions_not_self check (from_user_id <> to_user_id),
  unique (from_user_id, to_user_id, group_id, kind, date)
);
create index reactions_to_user_date_idx on public.reactions (to_user_id, date);
create index reactions_group_date_idx   on public.reactions (group_id, date);
create index reactions_from_user_id_idx on public.reactions (from_user_id);

alter table public.reactions enable row level security;

-- Visible to the circle it was sent in — encouragement is social by design, and
-- /today shows the counts under each finished peer. Scoped to the group, so a
-- reaction never leaks to someone who doesn't share that circle.
create policy reactions_select_group on public.reactions
  for select to authenticated
  using (private.is_group_member(group_id));

-- Grants (standard #6): read-only to clients. WRITES ARE RPC-ONLY — the toggle
-- is a read-then-insert-or-delete, which a client cannot do atomically (a
-- double-tap would race into a duplicate or a lost undo), and the `date` must
-- be stamped server-side from the sender's timezone rather than trusted.
grant select on public.reactions to authenticated;

-- toggle_reaction — the ONLY write path. Returns true if the reaction now
-- stands, false if this tap took it back.
create or replace function public.toggle_reaction(
  p_to    uuid,
  p_group uuid,
  p_kind  text
) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := private.require_caller_profile();
  v_date    date;
  v_deleted integer;
begin
  if p_kind not in ('dua', 'mashaAllah', 'heart', 'fire') then
    raise exception 'unknown reaction kind';
  end if;
  if p_to = v_uid then
    raise exception 'you cannot react to yourself';
  end if;
  -- Both of us must be in this circle. Checked here because a DEFINER function
  -- runs as postgres and bypasses the RLS that would otherwise say so.
  if not private.is_group_member(p_group) then
    raise exception 'group not found';   -- no oracle: absent and forbidden alike
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.group_id = p_group and m.user_id = p_to
  ) then
    raise exception 'not a member of this circle';
  end if;

  v_date := private.user_today(v_uid);

  delete from public.reactions r
   where r.from_user_id = v_uid
     and r.to_user_id   = p_to
     and r.group_id     = p_group
     and r.kind         = p_kind
     and r.date         = v_date;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    return false;                        -- tapped again → undo
  end if;

  insert into public.reactions (from_user_id, to_user_id, group_id, kind, date)
  values (v_uid, p_to, p_group, p_kind, v_date);
  return true;
end;
$$;

revoke all on function public.toggle_reaction(uuid, uuid, text) from public, anon;
grant execute on function public.toggle_reaction(uuid, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- badges (CET-20) — the CATALOG. One source of truth for the earning rules:
-- the DB evaluates them, the UI only renders glyph/label/description. (The mock
-- kept these in TypeScript, which would have drifted from any server-side
-- award the moment one changed.)
-- ----------------------------------------------------------------------------

create table public.badges (
  id          text primary key,
  glyph       text not null,
  label       text not null,
  description text not null,
  -- How the rule is evaluated against a member's record.
  kind        text not null check (kind in ('streakCurrent', 'streakLongest', 'consistency')),
  threshold   integer not null,
  -- `consistency` only: the look-back window. Null for streak badges.
  window_days integer,
  sort_order  integer not null,
  constraint badges_window_iff_consistency
    check ((kind = 'consistency') = (window_days is not null))
);

alter table public.badges enable row level security;

-- The catalog is public to signed-in users: locked badges are shown as calm
-- aspirations (never a nagging deficit), so the UI must be able to list them.
create policy badges_select_all on public.badges
  for select to authenticated
  using (true);

grant select on public.badges to authenticated;   -- and nothing else: seeded here

insert into public.badges (id, glyph, label, description, kind, threshold, window_days, sort_order) values
  ('spark',      '🌱', 'First week',    'A 7-day streak — the habit is taking root',    'streakLongest', 7,   null, 1),
  ('alight',     '🔥', 'On fire',       'A current streak of 14 days or more',          'streakCurrent', 14,  null, 2),
  ('steadfast',  '🌿', 'Steadfast',     'A 30-day streak — a month of showing up',      'streakLongest', 30,  null, 3),
  ('consistent', '📿', 'Consistent',    '80%+ of the last 30 days fully completed',     'consistency',   80,  30,   4),
  ('rooted',     '🌳', 'Deeply rooted', 'A 100-day streak — this is who you are now',   'streakLongest', 100, null, 5),
  ('devoted',    '⭐', 'Devoted',       'Near-perfect — 95%+ over the last 90 days',    'consistency',   95,  90,   6);

-- ----------------------------------------------------------------------------
-- badge_awards — what a member has actually EARNED, and when. Append-only:
-- nothing in this schema ever deletes a row (D43 — an earned badge is permanent).
-- ----------------------------------------------------------------------------

create table public.badge_awards (
  user_id   uuid not null references public.profiles on delete cascade,
  group_id  uuid not null references public.groups   on delete cascade,
  badge_id  text not null references public.badges   on delete cascade,
  earned_on date not null,
  primary key (user_id, group_id, badge_id)
);
create index badge_awards_group_id_idx on public.badge_awards (group_id);
create index badge_awards_badge_id_idx on public.badge_awards (badge_id);

alter table public.badge_awards enable row level security;

-- Yours alone. Badges are a private, intrinsic marker (riya'-aware, D31) — they
-- are NOT a leaderboard, so a peer cannot enumerate what you have earned.
create policy badge_awards_select_self on public.badge_awards
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Read-only to every client role. An award is granted by the evaluator below
-- (SECURITY DEFINER) and by nothing else — a badge you could INSERT yourself
-- would not be "earned", it would be claimed.
grant select on public.badge_awards to authenticated;

-- private.evaluate_badges — award any badge this member has newly crossed.
-- Idempotent (ON CONFLICT DO NOTHING) and strictly append-only, so running it
-- twice, or after a member's consistency dips, changes nothing.
create or replace function private.evaluate_badges(p_user uuid, p_group uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_today date := private.user_today(p_user);
begin
  insert into public.badge_awards (user_id, group_id, badge_id, earned_on)
  select p_user, p_group, b.id, v_today
  from public.badges b
  left join public.streaks s on s.user_id = p_user
  where
    case b.kind
      when 'streakLongest' then coalesce(s.longest, 0) >= b.threshold
      when 'streakCurrent' then coalesce(s.current, 0) >= b.threshold
      when 'consistency'   then (
        -- Same definition the /progress 30-day band uses: the share of the last
        -- N days that were FULLY completed (a day rolls up to exactly 100).
        -- Divided by the whole window, not by measured days — a day you missed
        -- counts against you, but a day you have not lived yet cannot.
        select 100.0 * count(*) filter (where dc.completion_pct >= 100) / b.window_days
        from public.daily_completion dc
        where dc.user_id  = p_user
          and dc.group_id = p_group
          and dc.date    >= v_today - b.window_days
      ) >= b.threshold
    end
  on conflict (user_id, group_id, badge_id) do nothing;
end;
$$;

revoke all on function private.evaluate_badges(uuid, uuid) from public, anon, authenticated;

-- sync_badges — the caller's own badges, evaluated on read.
--
-- Awards are detected in two places: here (so crossing a threshold today shows
-- up the moment you open /progress, rather than tomorrow) and in the nightly
-- rollup below (so a badge is still earned on the right date by someone who
-- does not open the app that day). Both funnel into the same evaluator, so
-- there is one rule, not two.
create or replace function public.sync_badges(p_group uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  if not private.is_group_member(p_group) then
    raise exception 'group not found';
  end if;
  perform private.evaluate_badges(v_uid, p_group);
end;
$$;

revoke all on function public.sync_badges(uuid) from public, anon;
grant execute on function public.sync_badges(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- banner_dismissals (CET-19) — "I've seen this one."
--
-- The fresh-start banner fires on a temporal landmark (a new week, a new month,
-- a comeback after a lapse). The mock dismissed it into React state, so it came
-- straight back on the next navigation. The key is the landmark occurrence
-- ('week:2026-W29'), not the landmark type — so dismissing THIS week's banner
-- says nothing about next week's.
-- ----------------------------------------------------------------------------

create table public.banner_dismissals (
  user_id      uuid not null references public.profiles on delete cascade,
  key          text not null check (length(key) between 1 and 64),
  dismissed_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.banner_dismissals enable row level security;

create policy banner_dismissals_select_self on public.banner_dismissals
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy banner_dismissals_insert_self on public.banner_dismissals
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- No UPDATE, no DELETE: a dismissal is a fact, not a setting. (A new landmark
-- is a new key, so nothing ever needs to be un-dismissed.)
grant select              on public.banner_dismissals to authenticated;
grant insert (user_id, key) on public.banner_dismissals to authenticated;

-- ----------------------------------------------------------------------------
-- The nightly sweep — awards a badge to a member who earned it but hasn't
-- opened the app (sync_badges only fires on a visit to /progress).
--
-- A SEPARATE JOB, deliberately, rather than an extra loop inside
-- private.run_daily_rollup(). That function's body encodes a load-bearing
-- invariant — its rollup window must stay aligned with its prune boundary or
-- the rollup stops being idempotent (see 0010) — and `create or replace` would
-- mean copying that body here, where the next edit to 0010 would silently fail
-- to reach it. Two jobs, one owner each.
--
-- Scheduled 15 minutes after the rollup: the consistency badges read
-- daily_completion, so they must run once it has been written for the day.
-- ----------------------------------------------------------------------------

create or replace function private.run_badge_awards() returns void
  language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in select m.user_id, m.group_id from public.memberships m loop
    perform private.evaluate_badges(r.user_id, r.group_id);
  end loop;
end;
$$;

revoke all on function private.run_badge_awards() from public, anon, authenticated;

select cron.schedule(
  'badge-awards',
  '15 2 * * *',
  $$select private.run_badge_awards()$$
);
