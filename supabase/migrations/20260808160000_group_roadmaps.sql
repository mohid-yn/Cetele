-- ============================================================================
-- Migration 0028 — a circle may follow MORE THAN ONE programme (D58)
-- ----------------------------------------------------------------------------
-- 0025 gave `groups` a single nullable `roadmap_id`, which said a circle
-- follows one programme or none. The administration runs more than one — a
-- yearly development programme and, say, a Ramadan one — and a circle that
-- wants both had to choose, or be split in two.
--
-- THE COLUMN IS DROPPED, not left beside the new table. Keeping both would mean
-- two answers to "does this circle follow X", free to disagree the moment one
-- write path forgets the other — the failure this codebase has paid for
-- repeatedly (Today and Group reading one circle at two percentages; the
-- unpublish that stranded a circle because the picker and the stored id
-- disagreed). One source, backfilled, and the old one removed in the same
-- transaction.
--
-- WHAT DOES NOT CHANGE, and this is the important half:
--
--   * `roadmap_progress` stays keyed `(user_id, item_id)`. A member's progress
--     belongs to the MEMBER (D55) — following a second programme adds items to
--     record against, it does not partition what is already recorded, and a
--     member in two circles that both follow one programme still has one row.
--   * Completion is computed per ROADMAP already (`levels_complete` takes a
--     roadmap id), so nothing about scoring, rewards or the report moves.
--   * The three readers of progress are unchanged in meaning; arm 2 simply
--     joins through the new table instead of the column.
-- ============================================================================

create table public.group_roadmaps (
  group_id   uuid not null references public.groups   on delete cascade,
  roadmap_id uuid not null references public.roadmaps on delete cascade,
  -- Which circle opted in, and when. Not `created_by`: the opt-in is the
  -- circle's, and an admin who leaves does not un-follow it.
  created_at timestamptz not null default now(),
  primary key (group_id, roadmap_id)
);

-- The hot direction is "what does this circle follow" (the nav tab, the roadmap
-- screen, manage). The PK already serves that. The reverse — "who follows this
-- roadmap" — is what `follows_roadmap` and the roster ask, and needs its own.
create index group_roadmaps_roadmap_idx on public.group_roadmaps (roadmap_id);

comment on table public.group_roadmaps is
  'Which programmes a circle follows (0028, D58). Replaces groups.roadmap_id, '
  'which allowed only one. Progress is still keyed on the MEMBER and the item '
  '(D55) — following a second programme adds work, it does not partition what '
  'has already been recorded.';

-- Backfill before the column goes, so no circle loses its programme.
insert into public.group_roadmaps (group_id, roadmap_id)
select id, roadmap_id from public.groups where roadmap_id is not null
on conflict do nothing;

alter table public.groups drop column roadmap_id;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.group_roadmaps enable row level security;

-- READ: any member of the circle. They need it — the nav tab, the roadmap
-- screen and the switcher all ask "what does my circle follow", and a member
-- who cannot read the row cannot be shown the programme they are enrolled on.
create policy group_roadmaps_select_member on public.group_roadmaps
  for select to authenticated
  using (private.is_group_member(group_id) or private.is_super_admin());

-- WRITE: the circle's owner or co-admins. Following a programme is an ordinary
-- act of running a circle (the same authority that sets the task list), which
-- is exactly what 0025 granted on the old column and what pgTAP 014 pinned.
create policy group_roadmaps_insert_admin on public.group_roadmaps
  for insert to authenticated
  with check (private.is_group_admin(group_id));

create policy group_roadmaps_delete_admin on public.group_roadmaps
  for delete to authenticated
  using (private.is_group_admin(group_id));

-- 0006 revoked default privileges for every role, so these are explicit.
-- No UPDATE grant: the row is a pair of ids and a timestamp — there is nothing
-- to amend, only to add or remove.
grant select, insert, delete on public.group_roadmaps to authenticated;

-- ----------------------------------------------------------------------------
-- The predicates that named the old column
-- ----------------------------------------------------------------------------

create or replace function private.follows_roadmap(r uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.group_roadmaps gr on gr.group_id = m.group_id
    where m.user_id = (select auth.uid())
      and gr.roadmap_id = r
  );
$$;

create or replace function private.can_read_roadmap_progress(p_user uuid, p_item uuid)
  returns boolean
  language sql security definer stable set search_path = '' as $$
  select p_user = (select auth.uid())
      or private.is_super_admin()
      or exists (
        select 1
        from public.roadmap_items i
        join public.group_roadmaps gr   on gr.roadmap_id = i.roadmap_id
        join public.memberships me      on me.group_id = gr.group_id
        join public.memberships them    on them.group_id = gr.group_id
        where i.id = p_item
          and me.user_id = (select auth.uid())
          and me.role in ('owner', 'admin')
          and them.user_id = p_user
      );
$$;

create or replace function public.roadmap_roster()
  returns table (roadmap_id uuid, user_id uuid, name text)
  language sql security definer stable set search_path = '' as $$
  select distinct gr.roadmap_id, pr.id, pr.name
  from public.memberships them
  join public.group_roadmaps gr on gr.group_id = them.group_id
  join public.profiles pr       on pr.id = them.user_id
  where them.user_id = (select auth.uid())
     or private.is_super_admin()
     or exists (
          select 1
          from public.memberships me
          where me.group_id = gr.group_id
            and me.user_id = (select auth.uid())
            and me.role in ('owner', 'admin')
        );
$$;
