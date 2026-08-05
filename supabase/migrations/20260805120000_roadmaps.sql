-- ============================================================================
-- Migration 0025 — roadmaps: the administration's yearly programme (D55)
-- ----------------------------------------------------------------------------
-- A roadmap is a set of items sourced OUTSIDE the app (a playlist to watch, a
-- book to read, a retreat to attend) with rewards waiting at milestones. It is
-- the administration's programme, published once and followed by the circles
-- that belong to that administration.
--
-- WHY THIS IS NOT THE DAILY-TASK ENGINE, AND MUST NEVER TOUCH IT
--
--   * `logs` is pruned at 14 days (D31a) and back-dating is capped at 13 (D36a),
--     so a year-long programme cannot record its progress there at all.
--   * A roadmap item must never reach `private.obligations`. If "read the book"
--     counted toward day-completion, a day spent not reading would break a
--     streak — a punishment mechanic, straight into D8. Roadmap progress only
--     ever ADDS: it can never take a day, a streak or a plant away.
--
-- Different grain (a window, not a day), different retention (the whole
-- programme, never pruned), different scoring (a milestone reached once, not a
-- target met daily). The only thing it shares with tasks is the member.
--
-- WHY THE CONTENT IS A TABLE AND NOT A TYPESCRIPT CONSTANT
--
-- Not because a yearly edit is expensive — it is one migration a year. Because
-- `roadmap_progress` needs a STABLE ID to point at. A constant in the app lets a
-- deploy rename, reorder or drop an item and silently orphan last year's
-- records, with no foreign key anywhere to catch it. This repo already learned
-- exactly that: the badge mark keys on `badges.id` because that is the identity
-- `badge_awards` references, and the badge catalog itself is seeded in SQL
-- (0015). This migration is that pattern, second occurrence.
--
-- An authoring UI is DEFERRED, not refused. Because the content is already
-- data, adding one later is purely additive — no data migration, no reshaping.
-- Until then the author is a migration, which is also the only writer.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
-- It ships NO content. The 2026 programme's real items and reward thresholds
-- are the owner's to supply (STATUS §2, roadmap Q1); inventing them here would
-- put placeholder YouTube links in production. `seed.sql` carries fixture rows
-- for local + e2e, which is where invented content belongs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- roadmaps — one row per published programme, one per year in practice
-- ----------------------------------------------------------------------------
-- A new year opens a NEW row. Last year's is never edited and never deleted:
-- members' progress against it is theirs, and D54's interval lesson applies
-- here for the same reason it applies to task config — a row that is rewritten
-- in place re-judges everything already recorded against it.

create table public.roadmaps (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  starts_on  date not null,
  ends_on    date not null,
  -- Unpublished = invisible and unpickable. This is how next year's programme
  -- is staged: the rows can land weeks early and nothing surfaces them until
  -- the administration flips one column.
  published  boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

comment on table public.roadmaps is
  'The administration''s yearly programme (0025, D55). Authored by migration, '
  'never by the client — no write grant exists for any role. A new year opens a '
  'new row; an old one is never edited or deleted.';

-- ----------------------------------------------------------------------------
-- roadmap_items — the work itself, done somewhere else
-- ----------------------------------------------------------------------------

create table public.roadmap_items (
  id         uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references public.roadmaps on delete cascade,
  kind       text not null check (kind in ('watch', 'read', 'custom')),
  title      text not null check (length(trim(title)) > 0),
  -- Who it is by, or where it is from — a channel, an author.
  source     text,
  -- Where the member goes to do it. External; the app opens it in a new tab.
  url        text,
  -- What one unit is, in the plural: "videos", "chapters", "sessions".
  unit       text not null check (length(trim(unit)) > 0),
  -- How many units finish the item. A target of 1 is a yes/no item.
  target     integer not null check (target > 0),
  sort_order integer not null default 0
);

create index roadmap_items_roadmap_id_idx on public.roadmap_items (roadmap_id);

-- ----------------------------------------------------------------------------
-- roadmap_rewards — what the whole programme is pulling toward
-- ----------------------------------------------------------------------------
-- `threshold` counts COMPLETED ITEMS, not units. A reward is a milestone you
-- can name ("finish four of these"), and a unit-weighted threshold would be
-- unexplainable on the card.

create table public.roadmap_rewards (
  id          uuid primary key default gen_random_uuid(),
  roadmap_id  uuid not null references public.roadmaps on delete cascade,
  threshold   integer not null check (threshold > 0),
  label       text not null check (length(trim(label)) > 0),
  -- What the administration actually gives. Out-of-app, like D31's reward.
  description text
);

create index roadmap_rewards_roadmap_id_idx on public.roadmap_rewards (roadmap_id);

-- ----------------------------------------------------------------------------
-- groups.roadmap_id — a circle FOLLOWS a roadmap, by its owner's choice
-- ----------------------------------------------------------------------------
-- Default null, and deliberately not global. The rewards are the
-- administration's real-world promises ("travel covered", "the closing
-- sitting"); showing them to a circle it has never met makes the app promise on
-- someone else's behalf. A circle either follows a programme or does not.
--
-- ON DELETE SET NULL rather than CASCADE: deleting a roadmap must never delete
-- a circle. (Nothing deletes roadmaps today — there is no write grant — but the
-- FK is where that guarantee belongs, not in a convention.)

alter table public.groups
  add column roadmap_id uuid references public.roadmaps on delete set null;

create index groups_roadmap_id_idx on public.groups (roadmap_id);

-- 0006 revoked default privileges and 0007 column-scoped every client grant, so
-- a new column starts unwritable. The authority is the EXISTING
-- `groups_update_admin` policy — same arrangement as `name`, and the same
-- reasoning `renameGroup` records: one column, one writer, last write wins is
-- the correct semantics. There is nothing atomic here to protect, so this stays
-- a plain UPDATE rather than an RPC (contrast the membership-shaped writes of
-- D42/D35/D43).
--
-- Known and accepted: an admin could point a circle at an UNPUBLISHED roadmap
-- if they somehow knew its uuid — they cannot read one, so it would have to be
-- guessed. The result is inert: `roadmaps` is only selectable while published,
-- so the screen falls back to "not following" until it is.
grant update (roadmap_id) on public.groups to authenticated;

comment on column public.groups.roadmap_id is
  'The programme this circle follows (0025, D55), or NULL. Set by the circle''s '
  'owner/admin. Grants access to the roadmap; it does NOT own the progress — '
  'that is keyed on the member (see public.roadmap_progress).';

-- ----------------------------------------------------------------------------
-- roadmap_progress — keyed on the MEMBER and the ITEM, never on a group
-- ----------------------------------------------------------------------------
-- This primary key IS the decision. A member in two circles that both follow
-- the 2026 programme has exactly ONE record: you read Nur al-Idah once, not
-- once per circle. Keying on (user, group, item) would give that member two
-- ledgers and two different answers to "have you finished the book".
--
-- So: the circle grants ACCESS, the member owns the PROGRESS. A member who
-- leaves every circle on a roadmap keeps their record (nothing earned is ever
-- revoked, §4) and simply loses the screen that shows it — and gets it back
-- intact if they rejoin, which is `reminders`' rule (0019) applied to a second
-- kind of personal state.
--
-- Never pruned. D31a's retention ladder is about the daily loop; a year-long
-- programme that forgot its own first quarter would be useless by December.

create table public.roadmap_progress (
  user_id    uuid not null references public.profiles on delete cascade,
  item_id    uuid not null references public.roadmap_items on delete cascade,
  done       integer not null check (done >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- The PK covers user-led lookups (a member reading their own roadmap). The
-- item side needs its own index for the FK and for the admin report, which is
-- item-led (the B7 lesson, 0005).
create index roadmap_progress_item_id_idx on public.roadmap_progress (item_id);

comment on table public.roadmap_progress is
  'How far one member has got with one roadmap item (0025, D55). Keyed on '
  '(member, item) and NOT on a group: a member in two circles following the '
  'same programme has one record, not two. Never pruned. Never read by '
  'private.obligations — roadmap progress can only ever add (D8).';

-- ============================================================================
-- Access
-- ============================================================================

-- ----------------------------------------------------------------------------
-- private.follows_roadmap — does the CALLER belong to a circle following this?
-- ----------------------------------------------------------------------------

create or replace function private.follows_roadmap(r uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.groups g on g.id = m.group_id
    where m.user_id = (select auth.uid())
      and g.roadmap_id = r
  );
$$;

-- Execute IS granted to `authenticated`: the policies below call it, and a
-- policy is evaluated as the role reading the table. `private` is not exposed
-- through PostgREST, so this is the same shape as `private.is_group_member`.
revoke all on function private.follows_roadmap(uuid) from public, anon;
grant execute on function private.follows_roadmap(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- private.can_read_roadmap_progress — the three readers of D55, in one place
-- ----------------------------------------------------------------------------
-- 1. The member themselves.
-- 2. An admin of a circle that BOTH follows the item's roadmap AND has that
--    member in it. Scoped to the following circle on purpose: sharing some
--    other, unrelated circle with someone is not a reason to read their
--    programme. This is D31/D29's admin-visibility shape, narrowed.
-- 3. A super admin — the administration awards the retreat place and the
--    ijazah sitting centrally, and no circle admin can see across circles.
--
-- Written once, so the RLS policy and the report cannot drift apart. Note what
-- it does NOT reach: this function names only roadmap tables and memberships.
-- The super-admin path opens no door onto `logs`, `streaks` or
-- `daily_completion` — that is the boundary that keeps D26/D27 (no god view)
-- intact, and suite 014 asserts it in the negative.

create or replace function private.can_read_roadmap_progress(p_user uuid, p_item uuid)
  returns boolean
  language sql security definer stable set search_path = '' as $$
  select p_user = (select auth.uid())
      or private.is_super_admin()
      or exists (
        select 1
        from public.roadmap_items i
        join public.groups g      on g.roadmap_id = i.roadmap_id
        join public.memberships me on me.group_id = g.id
        join public.memberships them on them.group_id = g.id
        where i.id = p_item
          and me.user_id = (select auth.uid())
          and me.role in ('owner', 'admin')
          and them.user_id = p_user
      );
$$;

revoke all on function private.can_read_roadmap_progress(uuid, uuid)
  from public, anon;
grant execute on function private.can_read_roadmap_progress(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.roadmaps         enable row level security;
alter table public.roadmap_items    enable row level security;
alter table public.roadmap_rewards  enable row level security;
alter table public.roadmap_progress enable row level security;

-- A published roadmap's NAME and window are readable by any signed-in member.
-- They have to be: an owner choosing whether to follow one has, by definition,
-- not followed it yet, so gating the catalogue on following makes the picker
-- unable to render its own options. What a name leaks is "a programme called
-- 2026 exists", which is not the thing D55 is protecting.
create policy roadmaps_select_published on public.roadmaps
  for select to authenticated
  using (published or private.is_super_admin());

-- The CONTENT is gated on following. This is the half that matters: the items
-- and — especially — the rewards are the administration's promises, and a
-- circle it has never enrolled should not be reading what it is offering.
create policy roadmap_items_select_follower on public.roadmap_items
  for select to authenticated
  using (private.follows_roadmap(roadmap_id) or private.is_super_admin());

create policy roadmap_rewards_select_follower on public.roadmap_rewards
  for select to authenticated
  using (private.follows_roadmap(roadmap_id) or private.is_super_admin());

create policy roadmap_progress_select_readers on public.roadmap_progress
  for select to authenticated
  using (private.can_read_roadmap_progress(user_id, item_id));

-- ----------------------------------------------------------------------------
-- Grants — explicit, because 0006 revoked default privileges for EVERY role
-- ----------------------------------------------------------------------------
-- Read only, on all four. There is no INSERT/UPDATE/DELETE grant anywhere here:
--
--   * roadmaps / items / rewards are authored by migration (D55). No client
--     writes them, so no client may.
--   * progress is written through the RPC below, which clamps to the item's own
--     target and checks the caller is actually on the roadmap. A PostgREST
--     upsert would let a member set `done` to anything for any item, including
--     items belonging to a programme they do not follow.

grant select on public.roadmaps         to authenticated;
grant select on public.roadmap_items    to authenticated;
grant select on public.roadmap_rewards  to authenticated;
grant select on public.roadmap_progress to authenticated;

-- ============================================================================
-- set_roadmap_progress — the only writer
-- ============================================================================
-- Returns the stored value rather than void, so the client reconciles from the
-- action's own return instead of trusting a refetch (D45). The ± buttons fire
-- fast; a refetch racing them is the count-dip family with different clothes.
--
-- Clamping is server-side and total: [0, target]. The client clamps too, for
-- the same reason `set_count` does — that is a UI nicety, not the guarantee.

create or replace function public.set_roadmap_progress(p_item uuid, p_done integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := private.require_caller_profile();
  v_target  integer;
  v_roadmap uuid;
  v_done    integer;
begin
  select i.target, i.roadmap_id
    into v_target, v_roadmap
    from public.roadmap_items i
   where i.id = p_item;

  -- No oracle: an item that does not exist and one belonging to a programme
  -- the caller does not follow fail identically.
  if v_target is null or not private.follows_roadmap(v_roadmap) then
    raise exception 'roadmap item not found';
  end if;

  v_done := least(greatest(coalesce(p_done, 0), 0), v_target);

  insert into public.roadmap_progress (user_id, item_id, done)
  values (v_uid, p_item, v_done)
  on conflict (user_id, item_id)
  do update set done = excluded.done, updated_at = now();

  return v_done;
end;
$$;

revoke all on function public.set_roadmap_progress(uuid, integer) from public, anon;
grant execute on function public.set_roadmap_progress(uuid, integer) to authenticated;

comment on function public.set_roadmap_progress(uuid, integer) is
  'Record how far the CALLER has got with one roadmap item (0025, D55). Clamps '
  'to [0, item.target] and refuses an item on a programme the caller does not '
  'follow. Members write their own progress only — there is no proxy path here, '
  'unlike counting (D29), because nobody else can know how much of a book you '
  'have read. `authenticated` holds no write grant on public.roadmap_progress.';
