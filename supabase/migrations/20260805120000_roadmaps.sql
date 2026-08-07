-- ============================================================================
-- Migration 0025 — roadmaps: the administration's development programme (D55)
-- ----------------------------------------------------------------------------
-- A roadmap is a published programme of work done OUTSIDE the app — books to
-- read, khatms to complete, surahs to memorise, lectures to watch — organised
-- into LEVELS a member walks in order, with rewards at the end of each.
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
-- Different grain (a programme, not a day), different retention (never pruned),
-- different scoring (a level finished once, not a target met daily). The only
-- thing it shares with tasks is the member.
--
-- WHY LEVELS ARE SEQUENTIAL AND NOT A CHOICE
--
-- Read off the real booklet, whose memorisation tables settle it: level 1 is
-- surahs 93–114, level 2 is 86–92, level 3 is 78–85. Contiguous, NON-
-- OVERLAPPING, and running backwards through the mushaf — the standard way Juz
-- 'Amma is learned. All three together are exactly 78–114, the complete juz.
-- Level 2 does not re-include level 1; it continues where level 1 stopped, and
-- the books, tajweed texts and lecture lists behave the same way. So a level is
-- a STAGE, not a track.
--
-- Therefore a member's level is DERIVED — the lowest level they have not yet
-- finished — and is never stored, never assigned and never chosen. Everyone
-- begins at level 1 and logs their way up (owner's decision). There is no
-- member→level table precisely because there is nothing to disagree about: two
-- sources for "what level is this person on" is two answers waiting to differ.
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
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
-- It ships NO content. The programme's own items land in a separate content
-- migration once the outstanding gaps are closed (the booklet's lecture URLs are
-- placeholders, and the reward values are not settled). `seed.sql` carries the
-- real structure for local + e2e, which is where content still under review
-- belongs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- roadmaps — one row per published programme
-- ----------------------------------------------------------------------------
-- A new intake opens a NEW row. An old one is never edited and never deleted:
-- members' progress against it is theirs, and D54's interval lesson applies here
-- for the same reason it applies to task config — a row rewritten in place
-- re-judges everything already recorded against it.

create table public.roadmaps (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  starts_on  date not null,
  ends_on    date not null,
  -- Unpublished = invisible and unpickable. This is how the next programme is
  -- staged: the rows can land weeks early and nothing surfaces them until the
  -- administration flips one column.
  published  boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

comment on table public.roadmaps is
  'The administration''s development programme (0025, D55). Authored by '
  'migration, never by the client — no write grant exists for any role. A new '
  'intake opens a new row; an old one is never edited or deleted.';

-- ----------------------------------------------------------------------------
-- roadmap_items — the work itself, done somewhere else
-- ----------------------------------------------------------------------------

create table public.roadmap_items (
  id         uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references public.roadmaps on delete cascade,

  -- Which STAGE this belongs to. Sequential: a member finishes level N before
  -- level N+1 is theirs to work on. Not constrained to 1..3 — the shape is
  -- "ordered stages", and a future programme with four is not a schema change.
  level integer not null check (level > 0),

  -- What kind of work it is. Drives the grouping and the icon, and — with
  -- `roadmap_level_requirements` — how the category is SCORED.
  category text not null check (
    category in ('book', 'quran', 'quran_studies', 'memorisation', 'listening')
  ),

  title  text not null check (length(trim(title)) > 0),
  -- Who it is by, or where it is from — an author, a channel, a surah range.
  source text,
  -- Where the member goes to do it. External; the app opens it in a new tab.
  -- NULL is ordinary and renders as no link: a book has no URL, and a lecture
  -- whose real link is not yet known must show nothing rather than a guess.
  url    text,

  -- What one unit is, in the plural: "minutes", "juz", "surahs", "chapters".
  unit   text not null check (length(trim(unit)) > 0),
  -- How many units finish the item. A target of 1 is a yes/no item.
  target integer not null check (target > 0),

  -- Only meaningful inside a BUDGETED category (see the table below): the item
  -- must be finished whatever the running total says. The booklet marks two
  -- lectures per level "Compulsory" and the rest "Optional" — reaching 600
  -- minutes without the compulsory two is not finishing the level.
  compulsory boolean not null default false,

  sort_order integer not null default 0
);

create index roadmap_items_roadmap_id_idx on public.roadmap_items (roadmap_id);
-- The screen and every completion check are LEVEL-led, so the level is the
-- leading column here (the B7 lesson, 0005).
create index roadmap_items_level_idx
  on public.roadmap_items (roadmap_id, level, category);

-- ----------------------------------------------------------------------------
-- roadmap_level_requirements — the categories scored as a BUDGET
-- ----------------------------------------------------------------------------
-- Most categories are finished by finishing every item in them: read all three
-- books, complete both tajweed texts. "Listening" is not. The booklet says
-- "from the list below you will need to listen to a total of 600 minutes" —
-- a MENU with a total, where the member chooses which lectures make up the
-- balance and two of them are compulsory.
--
-- The existence of a row here is what makes a category a budget, rather than a
-- hard-coded list of category names in the completion function. So a programme
-- that later wants "any 4 of these 9 books" is content, not a migration.
--
-- `min_total` is counted in the items' own unit, which is why the unit lives on
-- the item and must agree across a budgeted category.

create table public.roadmap_level_requirements (
  roadmap_id uuid not null references public.roadmaps on delete cascade,
  level      integer not null check (level > 0),
  category   text not null check (
    category in ('book', 'quran', 'quran_studies', 'memorisation', 'listening')
  ),
  min_total  integer not null check (min_total > 0),
  primary key (roadmap_id, level, category)
);

comment on table public.roadmap_level_requirements is
  'Categories finished by reaching a TOTAL rather than by completing every item '
  '(0025, D55) — the booklet''s "600 minutes of lectures". A category with no '
  'row here requires every one of its items. Compulsory items must be finished '
  'either way.';

-- ----------------------------------------------------------------------------
-- roadmap_rewards — what each level is pulling toward
-- ----------------------------------------------------------------------------
-- `threshold` counts COMPLETED LEVELS, not items. The reward is earned by
-- finishing a stage — that is the unit the programme is built in and the unit
-- the administration pays out on. An item-weighted threshold would be
-- unexplainable on the card and would let someone unlock by cherry-picking the
-- cheap items across three levels.

create table public.roadmap_rewards (
  id          uuid primary key default gen_random_uuid(),
  roadmap_id  uuid not null references public.roadmaps on delete cascade,
  threshold   integer not null check (threshold > 0),
  label       text not null check (length(trim(label)) > 0),
  -- What the administration actually gives. Out-of-app, like D31's reward.
  description text
);

create index roadmap_rewards_roadmap_id_idx on public.roadmap_rewards (roadmap_id);

comment on column public.roadmap_rewards.threshold is
  'How many LEVELS must be complete before this unlocks (0025, D55) — not items.';

-- ----------------------------------------------------------------------------
-- groups.roadmap_id — a circle FOLLOWS a roadmap, by its owner's choice
-- ----------------------------------------------------------------------------
-- Default null, and deliberately not global. The rewards are the
-- administration's real-world promises; showing them to a circle it has never
-- met makes the app promise on someone else's behalf. A circle either follows a
-- programme or does not.
--
-- The circle grants ACCESS. It does not carry the level — that is the member's,
-- and derived (see private.member_level).
--
-- ON DELETE SET NULL rather than CASCADE: deleting a roadmap must never delete a
-- circle. (Nothing deletes roadmaps today — there is no write grant — but the FK
-- is where that guarantee belongs, not in a convention.)

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
-- Known and accepted: an admin could point a circle at an UNPUBLISHED roadmap if
-- they somehow knew its uuid — they cannot read one, so it would have to be
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
-- This primary key IS the decision. A member in two circles that both follow the
-- same programme has exactly ONE record: you read Nur al-Idah once, not once per
-- circle. Keying on (user, group, item) would give that member two ledgers and
-- two different answers to "have you finished the book".
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

-- The PK covers user-led lookups (a member reading their own roadmap). The item
-- side needs its own index for the FK and for the admin report, which is
-- item-led (the B7 lesson, 0005).
create index roadmap_progress_item_id_idx on public.roadmap_progress (item_id);

comment on table public.roadmap_progress is
  'How far one member has got with one roadmap item (0025, D55). Keyed on '
  '(member, item) and NOT on a group: a member in two circles following the '
  'same programme has one record, not two. Never pruned. Never read by '
  'private.obligations — roadmap progress can only ever add (D8).';

-- ============================================================================
-- Completion — written ONCE, in the database
-- ============================================================================

-- ----------------------------------------------------------------------------
-- private.level_complete — has this member finished this level?
-- ----------------------------------------------------------------------------
-- One expression for the whole rule, because it is the rule the reward, the
-- derived level and the report all turn on, and three copies would be three
-- answers. The client mirrors it (lib/roadmap.ts) for rendering only — the SQL
-- is the authority, exactly as `lib/assignments.ts` mirrors `task_due_on`.
--
-- A level is complete when EVERY category present at that level is satisfied:
--
--   * a category with a `roadmap_level_requirements` row is a BUDGET — the sum
--     of the member's progress across its items must reach `min_total`, and
--     every `compulsory` item in it must be finished outright;
--   * a category without one requires every item to be finished.
--
-- `least(done, target)` throughout: an item cannot contribute more than it is
-- worth, so over-recording one lecture can never buy the rest of the budget.

-- Defined before `level_complete`, which calls it: a SQL function body is parsed
-- and its references resolved at CREATE time, so the callee has to exist first.

create or replace function private.category_complete(
  p_user uuid, p_roadmap uuid, p_level integer, p_category text
) returns boolean
  language sql security definer stable set search_path = '' as $$
  with items as (
    select i.id, i.target, i.compulsory,
           -- coalesce INSIDE least, never outside it. `least` IGNORES nulls, so
           -- `least(p.done, i.target)` on an item with no progress row returns
           -- the TARGET — every untouched item scored as finished, and a member
           -- who had recorded nothing at all completed the programme. Only the
           -- categories where this member happened to have a partial row read
           -- as incomplete, which is why it looked plausible.
           least(coalesce(p.done, 0), i.target) as done
    from public.roadmap_items i
    left join public.roadmap_progress p
      on p.item_id = i.id and p.user_id = p_user
    where i.roadmap_id = p_roadmap
      and i.level = p_level
      and i.category = p_category
  ),
  req as (
    select min_total from public.roadmap_level_requirements
    where roadmap_id = p_roadmap and level = p_level and category = p_category
  )
  select
    -- A category with NO items is not complete, for the same reason an empty
    -- LEVEL is not (see below): `not exists (… where done < target)` over an
    -- empty set is TRUE, so without this guard an unauthored category is
    -- vacuously finished. Neither caller can reach it — both enumerate only the
    -- categories that HAVE items — but the client mirror already returned false
    -- here, and a latent disagreement between the two is the trap this pair is
    -- written to avoid, not a detail to leave for whoever calls it next.
    exists (select 1 from items)
    and case
      when (select count(*) from req) = 0 then
        -- Every item, or nothing.
        not exists (select 1 from items where done < target)
      else
        -- The budget, plus every compulsory item outright.
        (select coalesce(sum(done), 0) from items) >= (select min_total from req)
        and not exists (select 1 from items where compulsory and done < target)
    end;
$$;

create or replace function private.level_complete(
  p_user uuid, p_roadmap uuid, p_level integer
) returns boolean
  language sql security definer stable set search_path = '' as $$
  -- Complete when NO category at this level fails. The `exists` guard is what
  -- stops a level with no items at all from being vacuously complete — an empty
  -- level is not a finished one, and without it a half-authored programme would
  -- hand out every reward.
  select not exists (
    select 1
    from (
      select distinct i.category
      from public.roadmap_items i
      where i.roadmap_id = p_roadmap and i.level = p_level
    ) c
    where not private.category_complete(p_user, p_roadmap, p_level, c.category)
  )
  and exists (
    select 1 from public.roadmap_items i
    where i.roadmap_id = p_roadmap and i.level = p_level
  );
$$;

revoke all on function private.level_complete(uuid, uuid, integer) from public, anon;
revoke all on function private.category_complete(uuid, uuid, integer, text)
  from public, anon;
grant execute on function private.level_complete(uuid, uuid, integer) to authenticated;
grant execute on function private.category_complete(uuid, uuid, integer, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- private.levels_complete — how many levels, counting from the bottom
-- ----------------------------------------------------------------------------
-- Sequential, so this stops at the first gap: finishing level 3 while level 2 is
-- unfinished counts as ONE level, not two. The alternative (counting complete
-- levels anywhere) would hand out the second reward for skipping the middle of
-- the programme.

create or replace function private.levels_complete(p_user uuid, p_roadmap uuid)
  returns integer
  language sql security definer stable set search_path = '' as $$
  with lv as (
    select distinct level from public.roadmap_items where roadmap_id = p_roadmap
  ),
  -- The first level they have NOT finished. Everything below it is theirs.
  first_gap as (
    select min(level) as level from lv
    where not private.level_complete(p_user, p_roadmap, lv.level)
  )
  select count(*)::integer from lv
  -- No gap = every level done, so nothing is excluded.
  where lv.level < coalesce((select level from first_gap), 2147483647);
$$;

revoke all on function private.levels_complete(uuid, uuid) from public, anon;
grant execute on function private.levels_complete(uuid, uuid) to authenticated;

comment on function private.levels_complete(uuid, uuid) is
  'Levels finished from the bottom up (0025, D55) — the unit rewards are earned '
  'in. Stops at the first unfinished level, so skipping level 2 does not earn '
  'level 3''s reward.';

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
-- 3. A super admin — the administration awards the trip contribution centrally,
--    and no circle admin can see across circles.
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

alter table public.roadmaps                    enable row level security;
alter table public.roadmap_items               enable row level security;
alter table public.roadmap_rewards             enable row level security;
alter table public.roadmap_level_requirements  enable row level security;
alter table public.roadmap_progress            enable row level security;

-- A published roadmap's NAME and window are readable by any signed-in member.
-- They have to be: an owner choosing whether to follow one has, by definition,
-- not followed it yet, so gating the catalogue on following makes the picker
-- unable to render its own options. What a name leaks is "a programme called
-- 2026 exists", which is not the thing D55 is protecting.
create policy roadmaps_select_published on public.roadmaps
  for select to authenticated
  using (published or private.is_super_admin());

-- The CONTENT is gated on following. This is the half that matters: the items
-- and — especially — the rewards are the administration's promises, and a circle
-- it has never enrolled should not be reading what it is offering.
create policy roadmap_items_select_follower on public.roadmap_items
  for select to authenticated
  using (private.follows_roadmap(roadmap_id) or private.is_super_admin());

create policy roadmap_rewards_select_follower on public.roadmap_rewards
  for select to authenticated
  using (private.follows_roadmap(roadmap_id) or private.is_super_admin());

create policy roadmap_level_reqs_select_follower on public.roadmap_level_requirements
  for select to authenticated
  using (private.follows_roadmap(roadmap_id) or private.is_super_admin());

create policy roadmap_progress_select_readers on public.roadmap_progress
  for select to authenticated
  using (private.can_read_roadmap_progress(user_id, item_id));

-- ----------------------------------------------------------------------------
-- Grants — explicit, because 0006 revoked default privileges for EVERY role
-- ----------------------------------------------------------------------------
-- Read only, on all five. There is no INSERT/UPDATE/DELETE grant anywhere here:
--
--   * roadmaps / items / rewards / requirements are authored by migration
--     (D55). No client writes them, so no client may.
--   * progress is written through the RPC below, which clamps to the item's own
--     target and checks the caller is actually on the roadmap. A PostgREST
--     upsert would let a member set `done` to anything for any item, including
--     items belonging to a programme they do not follow.

grant select on public.roadmaps                   to authenticated;
grant select on public.roadmap_items              to authenticated;
grant select on public.roadmap_rewards            to authenticated;
grant select on public.roadmap_level_requirements to authenticated;
grant select on public.roadmap_progress           to authenticated;

-- ============================================================================
-- set_roadmap_progress — the only writer
-- ============================================================================
-- Returns the stored value rather than void, so the client reconciles from the
-- action's own return instead of trusting a refetch (D45). The ± buttons fire
-- fast; a refetch racing them is the count-dip family with different clothes.
--
-- Clamping is server-side and total: [0, target]. The client clamps too, for the
-- same reason `set_count` does — that is a UI nicety, not the guarantee.
--
-- It does NOT gate on the member's current level. Levels are sequential in the
-- sense that they are WORKED in order and rewarded in order, but a member who
-- reads ahead has still read the book, and refusing to record it would be the
-- app telling someone their worship did not happen. `levels_complete` already
-- refuses to pay out for a skipped level, which is where the rule belongs.

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

  -- No oracle: an item that does not exist and one belonging to a programme the
  -- caller does not follow fail identically.
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

-- ============================================================================
-- roadmap_roster — WHO IS ON A PROGRAMME, including the people at zero
-- ============================================================================
-- The report was built from `roadmap_progress` alone, so a member who had
-- recorded NOTHING had no row and did not appear at all. For a screen whose job
-- is "who has earned the contribution" that is the wrong silence: "has not
-- started" and "is not on the programme" rendered identically, and the person
-- an admin most needs to notice is the one at zero.
--
-- Progress cannot answer it, because absence is the very thing being asked
-- about. Membership can — but only through the SAME predicate the progress
-- policy uses, or the screen grows a second, more generous rule:
--
--   1. yourself, always;
--   2. an admin of a circle that BOTH follows the roadmap AND holds that member
--      — the arm that makes sharing some OTHER circle insufficient;
--   3. a super admin, who is in no circle and must still see the cohort.
--
-- That is `private.can_read_roadmap_progress`'s three arms, item-free. It is an
-- RPC rather than a view because arm 3 has to cross circles the caller does not
-- belong to, which is exactly what RLS on `memberships` is there to stop — so
-- the widening happens once, inside SECURITY DEFINER, in the open.
--
-- Names only. This reaches no logs, no streaks, no daily_completion, and no
-- circle identity: which circle someone is in is not the programme's business
-- (D26/D27), so the group is joined THROUGH and never returned.

create or replace function public.roadmap_roster()
  returns table (roadmap_id uuid, user_id uuid, name text)
  language sql security definer stable set search_path = '' as $$
  select distinct g.roadmap_id, pr.id, pr.name
  from public.memberships them
  join public.groups   g  on g.id = them.group_id and g.roadmap_id is not null
  join public.profiles pr on pr.id = them.user_id
  where them.user_id = (select auth.uid())
     or private.is_super_admin()
     or exists (
          select 1
          from public.memberships me
          where me.group_id = g.id
            and me.user_id = (select auth.uid())
            and me.role in ('owner', 'admin')
        );
$$;

revoke all on function public.roadmap_roster() from public, anon;
grant execute on function public.roadmap_roster() to authenticated;

comment on function public.roadmap_roster() is
  'Who is on each programme, INCLUDING members who have recorded nothing '
  '(0025, D55) — the question roadmap_progress cannot answer, because absence '
  'is what is being asked. Same three readers as '
  'private.can_read_roadmap_progress. Returns names only: never a circle, '
  'never anything from the daily engine.';

comment on function public.set_roadmap_progress(uuid, integer) is
  'Record how far the CALLER has got with one roadmap item (0025, D55). Clamps '
  'to [0, item.target] and refuses an item on a programme the caller does not '
  'follow. Members write their own progress only — there is no proxy path here, '
  'unlike counting (D29), because nobody else can know how much of a book you '
  'have read. `authenticated` holds no write grant on public.roadmap_progress.';

-- ============================================================================
-- A note on who calls the completion functions above
-- ============================================================================
-- Nothing in the app does, yet — the screens read the raw rows and apply the
-- mirror in `lib/roadmap.ts`, which is what lets a tap re-score the level
-- without a round trip. The SQL is here anyway, and deliberately:
--
--   * it is the DEFINITION. pgTAP 014 runs the mirror's cases against these
--     functions, so "the client agrees with the database" is a tested claim
--     rather than a hope — the trap `lib/assignments.ts` records is a mirror and
--     an original that are wrong TOGETHER, and the only defence is a third
--     party checking one against the other;
--   * the moment a reward is claimed rather than merely displayed, the claim has
--     to be settled server-side, and a rule invented at that point would be a
--     second implementation racing the two that already exist.
--
-- No public RPC wraps them: an exported entry point nothing calls is API surface
-- to maintain and a thing to get wrong. `private` is not exposed through
-- PostgREST, so these are reachable only from inside the database.
--
-- The mirror is pinned to these by `lib/roadmap.test.ts`, which runs the SAME
-- cases suite 014 runs here. Note what that does NOT cover: the screen's
-- PERCENTAGES have no counterpart in this file at all — the database computes no
-- fractions — so nothing here can contradict them, and their only defence is
-- those unit tests.
