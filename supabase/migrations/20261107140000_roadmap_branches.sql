-- ============================================================================
-- Migration 0044: a roadmap can be assigned to a BRANCH (D81)
-- ----------------------------------------------------------------------------
-- Until now a roadmap reached circles one at a time (0028, 0037), while events
-- flow down the branch tree (0043). Two models, and nothing on screen said
-- which was which. The owner's call (2026-11-07): allow both.
--
--   * An organiser assigns a roadmap to a branch. Every circle in that branch
--     or any branch under it follows it, including circles that join later.
--   * Assigning single circles still works, from the organiser's editor and
--     from the circle's own Manage screen.
--
-- HOW: branch assignments are MATERIALISED into `group_roadmaps`, tagged with
-- `via_branch`. Every reader of "what does this circle follow" (the nav tab,
-- the roadmap screen, the roster, the progress readers, `follows_roadmap`)
-- keeps reading one table and needs no change.
--
--   * A direct row has `via_branch` null. A branch row names the nearest
--     assigned branch above the circle.
--   * A circle that already followed directly keeps its direct row: removing
--     the branch assignment later leaves it following.
--   * `private.sync_branch_roadmaps` recomputes the branch rows. It runs when
--     an assignment changes and when a circle's `branch_id` changes (joining,
--     leaving, being removed), by trigger, so no path can miss it.
--   * A circle's admin cannot remove a branch row: it belongs to the branch,
--     like an event. They see who set it instead.
--
-- Branches cannot move (no parent change exists), so `branch_id` changes and
-- assignment changes are the only things that move reach.
-- ============================================================================

create table public.branch_roadmaps (
  branch_id  uuid not null references public.branches (id) on delete cascade,
  roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (branch_id, roadmap_id)
);
create index branch_roadmaps_roadmap_idx on public.branch_roadmaps (roadmap_id);

comment on table public.branch_roadmaps is
  'Roadmaps assigned to a branch (0044, D81). Materialised into group_roadmaps '
  'with via_branch set, for every circle at or under the branch.';

alter table public.branch_roadmaps enable row level security;

-- READ: organisers, and anyone whose circle is reached by the branch (so the
-- member screens can say "set by Melbourne"), and stewards of it.
create policy branch_roadmaps_select on public.branch_roadmaps
  for select to authenticated
  using (
    private.is_super_admin()
    or private.is_steward_of(branch_id)
    or branch_id in (select private.my_reach())
  );

-- No write grant: only `set_branch_on_roadmap` writes.
grant select on public.branch_roadmaps to authenticated;

alter table public.group_roadmaps
  add column via_branch uuid references public.branches (id) on delete cascade;

comment on column public.group_roadmaps.via_branch is
  'Null for a circle that follows directly. Otherwise the assigned branch this '
  'row comes from (0044, D81). Written only by private.sync_branch_roadmaps.';

-- A circle admin keeps adding and removing DIRECT rows only, and only for a
-- PUBLISHED roadmap: 0041 (D77) added that check, and this policy replaces
-- 0041's, so it must carry it forward.
drop policy group_roadmaps_insert_admin on public.group_roadmaps;
create policy group_roadmaps_insert_admin on public.group_roadmaps
  for insert to authenticated
  with check (
    private.is_group_admin(group_id)
    and via_branch is null
    and exists (
      select 1 from public.roadmaps r
       where r.id = roadmap_id and r.published
    )
  );

drop policy group_roadmaps_delete_admin on public.group_roadmaps;
create policy group_roadmaps_delete_admin on public.group_roadmaps
  for delete to authenticated
  using (private.is_group_admin(group_id) and via_branch is null);

-- ----------------------------------------------------------------------------
-- The sync. `p_group` null = every circle; otherwise just that one.
-- ----------------------------------------------------------------------------
-- What each circle SHOULD follow through its branch: for each roadmap, the
-- nearest assigned branch in the circle's lineage.
create or replace function private.wanted_branch_roadmaps(p_group uuid)
  returns table (group_id uuid, roadmap_id uuid, via uuid)
  language sql security definer stable set search_path = '' as $$
  select distinct on (g.id, br.roadmap_id) g.id, br.roadmap_id, br.branch_id
    from public.groups g
    join lateral (
      with recursive up (id, parent_id, depth) as (
        select b.id, b.parent_id, 0 from public.branches b where b.id = g.branch_id
        union all
        select p.id, p.parent_id, up.depth + 1
          from public.branches p join up on p.id = up.parent_id
         where up.depth < 32
      )
      select up.id, up.depth from up
    ) l on true
    join public.branch_roadmaps br on br.branch_id = l.id
   where g.branch_id is not null
     and (p_group is null or g.id = p_group)
   order by g.id, br.roadmap_id, l.depth;
$$;

revoke all on function private.wanted_branch_roadmaps(uuid) from public;

create or replace function private.sync_branch_roadmaps(p_group uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  -- Branch rows that should no longer exist.
  delete from public.group_roadmaps gr
   where gr.via_branch is not null
     and (p_group is null or gr.group_id = p_group)
     and not exists (select 1 from private.wanted_branch_roadmaps(p_group) w
                      where w.group_id = gr.group_id
                        and w.roadmap_id = gr.roadmap_id);

  -- Re-point rows whose nearest branch changed.
  update public.group_roadmaps gr
     set via_branch = w.via
    from private.wanted_branch_roadmaps(p_group) w
   where gr.group_id = w.group_id
     and gr.roadmap_id = w.roadmap_id
     and gr.via_branch is not null
     and gr.via_branch <> w.via;

  -- New ones. A direct row already there wins (do nothing).
  insert into public.group_roadmaps (group_id, roadmap_id, via_branch)
  select w.group_id, w.roadmap_id, w.via
    from private.wanted_branch_roadmaps(p_group) w
  on conflict (group_id, roadmap_id) do nothing;
end;
$$;

revoke all on function private.sync_branch_roadmaps(uuid) from public;

create or replace function private.groups_branch_changed()
  returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_branch_roadmaps(new.id);
  return new;
end;
$$;

create trigger groups_branch_roadmaps
  after update of branch_id on public.groups
  for each row
  when (old.branch_id is distinct from new.branch_id)
  execute function private.groups_branch_changed();

-- ----------------------------------------------------------------------------
-- The organiser's RPCs
-- ----------------------------------------------------------------------------
create or replace function public.set_branch_on_roadmap(
  p_roadmap uuid,
  p_branch  uuid,
  p_assign  boolean
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;
  if not exists (select 1 from public.roadmaps where id = p_roadmap) then
    raise exception 'roadmap not found';
  end if;
  if not exists (select 1 from public.branches where id = p_branch) then
    raise exception 'branch not found';
  end if;

  if p_assign then
    -- A draft is still being written: nobody can follow it (D77), so no
    -- branch can be given it either.
    if not exists (select 1 from public.roadmaps
                    where id = p_roadmap and published) then
      raise exception 'publish this roadmap before adding it to a branch';
    end if;
    insert into public.branch_roadmaps (branch_id, roadmap_id, created_by)
    values (p_branch, p_roadmap, v_uid)
    on conflict (branch_id, roadmap_id) do nothing;
  else
    delete from public.branch_roadmaps
     where branch_id = p_branch and roadmap_id = p_roadmap;
  end if;

  perform private.sync_branch_roadmaps(null);

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'set_branch_on_roadmap', null,
          jsonb_build_object('roadmap', p_roadmap, 'branch', p_branch,
                             'assign', p_assign));
end;
$$;

revoke all on function public.set_branch_on_roadmap(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_branch_on_roadmap(uuid, uuid, boolean) to authenticated;

-- Removing a circle that follows through its branch would be undone by the
-- next sync, so it is refused with the reason instead.
create or replace function public.set_circle_on_roadmap(
  p_roadmap uuid,
  p_group   uuid,
  p_follow  boolean
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
  v_via text;
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;
  if not exists (select 1 from public.roadmaps where id = p_roadmap) then
    raise exception 'roadmap not found';
  end if;
  if not exists (select 1 from public.groups where id = p_group) then
    raise exception 'circle not found';
  end if;

  if p_follow then
    -- Carried forward from 0041 (D77), which this replaces.
    if not exists (select 1 from public.roadmaps
                    where id = p_roadmap and published) then
      raise exception 'publish this roadmap before adding circles to it';
    end if;
    insert into public.group_roadmaps (group_id, roadmap_id)
    values (p_group, p_roadmap)
    on conflict (group_id, roadmap_id) do nothing;
  else
    select b.name into v_via
      from public.group_roadmaps gr
      join public.branches b on b.id = gr.via_branch
     where gr.group_id = p_group and gr.roadmap_id = p_roadmap;
    if v_via is not null then
      raise exception 'this circle follows it through %. Remove the roadmap from that branch instead', v_via;
    end if;
    delete from public.group_roadmaps
     where group_id = p_group and roadmap_id = p_roadmap;
  end if;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'set_circle_on_roadmap', null,
          jsonb_build_object('roadmap', p_roadmap, 'group', p_group,
                             'follow', p_follow));
end;
$$;

-- The circle list gains WHY a circle follows: null (direct) or a branch name.
drop function public.roadmap_circles(uuid);
create function public.roadmap_circles(p_roadmap uuid)
  returns table (group_id uuid, name text, member_count integer,
                 following boolean, via_branch_name text)
  language plpgsql security definer stable set search_path = '' as $$
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;

  return query
    select g.id,
           g.name,
           (select count(*)::integer
              from public.memberships m
             where m.group_id = g.id),
           gr.group_id is not null,
           b.name
      from public.groups g
      left join public.group_roadmaps gr
        on gr.group_id = g.id and gr.roadmap_id = p_roadmap
      left join public.branches b on b.id = gr.via_branch
     order by g.name, g.id;
end;
$$;

revoke all on function public.roadmap_circles(uuid) from public, anon;
grant execute on function public.roadmap_circles(uuid) to authenticated;
