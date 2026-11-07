-- ============================================================================
-- Migration 0047: move and archive branches, move circles, delete events (D87)
-- ----------------------------------------------------------------------------
-- Branches are folders (D85), so they get what folders have (owner, 2026-11-07,
-- "move groups through the hierarchy or archive like Google Drive"):
--
--   * MOVE A BRANCH under another parent. Needs the right to run where it is
--     AND where it goes (an organiser for the top level), like Drive needing
--     access at both ends. Never into its own subtree.
--   * A BRANCH ADMIN MOVES A CIRCLE between two branches they run. The circle
--     admin agreed to that part of the tree when they joined, so shuffling
--     inside it hands nobody anything new. Moving anywhere else is still the
--     circle admin's request (`request_branch`).
--   * ARCHIVE A BRANCH: hidden from pickers, reaches nobody, history kept,
--     restorable. Its whole subtree goes quiet with it. Same authority as
--     deleting it.
--
-- Reach is computed through the lineage at read time, so events follow a move
-- or an archive by themselves. Roadmaps are materialised (0044), so every
-- change here re-runs `private.sync_branch_roadmaps`.
--
-- Nothing here reads or changes a circle's members or logs (D27, D86).
--
-- ALSO: proper deletes for events. A camp can be deleted whatever its status
-- (the screen warns that answers and polls go with it); a weekly halaqah can be
-- deleted as a whole. A single week is still cancelled, not deleted, because
-- the series would only lay it out again.
-- ============================================================================

alter table public.branches add column archived_at timestamptz;

comment on column public.branches.archived_at is
  'Set when the branch is archived (0047, D87): it and everything inside it '
  'reach nobody and leave the pickers until restored.';

-- Live = neither this branch nor any branch above it is archived.
create or replace function private.branch_live(b uuid)
  returns boolean
  language sql security definer stable set search_path = '' as $$
  select not exists (
    select 1 from public.branches x
     where x.id in (select private.branch_lineage(b))
       and x.archived_at is not null
  );
$$;
revoke all on function private.branch_live(uuid) from public;
grant execute on function private.branch_live(uuid) to authenticated;

-- A member's reach skips a circle whose branch has gone quiet.
create or replace function private.my_reach()
  returns setof uuid
  language sql security definer stable set search_path = '' as $$
  select distinct l
    from public.memberships m
    join public.groups g on g.id = m.group_id
   cross join lateral private.branch_lineage(g.branch_id) as l
   where m.user_id = (select auth.uid())
     and g.branch_id is not null
     and private.branch_live(g.branch_id);
$$;

-- Roadmaps placed on a branch stop reaching an archived part of the tree.
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
     and private.branch_live(g.branch_id)
     and (p_group is null or g.id = p_group)
   order by g.id, br.roadmap_id, l.depth;
$$;

-- The circle admin's picker leaves archived branches (and what is inside) out.
create or replace function public.branch_directory()
  returns table (id uuid, label text, depth integer)
  language sql security definer stable set search_path = '' as $$
  with recursive tree (id, label, depth, path) as (
    select b.id, b.name, 0, array[lower(b.name)]
      from public.branches b
     where b.parent_id is null and b.archived_at is null
    union all
    select c.id, tree.label || ' › ' || c.name, tree.depth + 1,
           tree.path || lower(c.name)
      from public.branches c join tree on c.parent_id = tree.id
     where tree.depth < 32 and c.archived_at is null
  )
  select id, label, depth from tree
   where (select auth.uid()) is not null
   order by path;
$$;

-- No asking to join a branch that has gone quiet.
create or replace function public.request_branch(p_group uuid, p_branch uuid)
  returns text
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  if not private.is_group_admin(p_group) then
    raise exception 'only the circle''s owner or an admin can do this';
  end if;
  if not exists (select 1 from public.branches where id = p_branch) then
    raise exception 'branch not found';
  end if;
  if not private.branch_live(p_branch) then
    raise exception 'that branch is archived';
  end if;

  if private.is_steward_of(p_branch) then
    delete from public.branch_requests where group_id = p_group;
    update public.groups set branch_id = p_branch where id = p_group;
    insert into public.audit_log (actor_id, action, group_id, detail)
    values (v_uid, 'join_branch', p_group,
            jsonb_build_object('branch_id', p_branch, 'approved_by', v_uid));
    return 'joined';
  end if;

  insert into public.branch_requests (group_id, branch_id, requested_by)
  values (p_group, p_branch, v_uid)
  on conflict (group_id) do update
    set branch_id = excluded.branch_id,
        requested_by = excluded.requested_by,
        created_at = now();
  insert into public.audit_log (actor_id, action, group_id, detail)
  values (v_uid, 'request_branch', p_group,
          jsonb_build_object('branch_id', p_branch));
  return 'requested';
end;
$$;

-- The admin tree gains `archived` (archived itself) and `live` (nothing above
-- it archived either), so screens can hide the quiet part and offer a restore.
drop function public.my_steward_tree();
create function public.my_steward_tree()
  returns table (id uuid, parent_id uuid, name text, depth integer,
                 circles integer, pending integer, direct boolean,
                 archived boolean, live boolean)
  language sql security definer stable set search_path = '' as $$
  with recursive tops as (
    select b.id
      from public.branches b
     where private.is_super_admin() and b.parent_id is null
    union
    select s.branch_id
      from public.branch_stewards s
     where s.user_id = (select auth.uid())
       and not private.is_super_admin()
       and not exists (
             select 1
               from public.branch_stewards s2
              where s2.user_id = s.user_id
                and s2.branch_id <> s.branch_id
                and s2.branch_id in (select private.branch_lineage(s.branch_id))
           )
  ),
  tree (id, parent_id, name, depth, path) as (
    select b.id, b.parent_id, b.name, 0, array[lower(b.name)]
      from public.branches b join tops t on t.id = b.id
    union all
    select c.id, c.parent_id, c.name, tree.depth + 1, tree.path || lower(c.name)
      from public.branches c join tree on c.parent_id = tree.id
     where tree.depth < 32
  )
  select t.id, t.parent_id, t.name, t.depth,
         (select count(*)::integer from public.groups g where g.branch_id = t.id),
         (select count(*)::integer from public.branch_requests r where r.branch_id = t.id),
         exists (select 1 from public.branch_stewards s
                  where s.branch_id = t.id and s.user_id = (select auth.uid())),
         (select b.archived_at is not null from public.branches b where b.id = t.id),
         private.branch_live(t.id)
    from tree t
   order by t.path;
$$;
revoke all on function public.my_steward_tree() from public, anon;
grant execute on function public.my_steward_tree() to authenticated;

-- Who may archive, restore or move a branch away from where it is: whoever may
-- delete it (0042), i.e. the admins of the branch above, or an organiser for a
-- top-level one.
create or replace function private.can_rehome_branch(p_branch uuid)
  returns boolean
  language sql security definer stable set search_path = '' as $$
  select case
           when (select parent_id from public.branches where id = p_branch) is null
             then private.is_super_admin()
           else private.is_steward_of(
                  (select parent_id from public.branches where id = p_branch))
         end;
$$;
revoke all on function private.can_rehome_branch(uuid) from public;

create or replace function public.set_branch_archived(
  p_branch   uuid,
  p_archived boolean
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  if not exists (select 1 from public.branches where id = p_branch) then
    raise exception 'branch not found';
  end if;
  if not private.can_rehome_branch(p_branch) then
    raise exception 'only the admins of the branch above can archive this one';
  end if;

  update public.branches
     set archived_at = case when p_archived then coalesce(archived_at, now()) end
   where id = p_branch;
  perform private.sync_branch_roadmaps(null);

  insert into public.audit_log (actor_id, action, detail)
  values (v_uid, case when p_archived then 'archive_branch' else 'restore_branch' end,
          jsonb_build_object('branch_id', p_branch));
end;
$$;

create or replace function public.move_branch(p_branch uuid, p_parent uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  if not exists (select 1 from public.branches where id = p_branch) then
    raise exception 'branch not found';
  end if;
  if not private.can_rehome_branch(p_branch) then
    raise exception 'only the admins of the branch above can move this one';
  end if;
  if p_parent is null then
    if not private.is_super_admin() then
      raise exception 'only an organiser can make a top-level branch';
    end if;
  else
    if not exists (select 1 from public.branches where id = p_parent) then
      raise exception 'branch not found';
    end if;
    if not private.is_steward_of(p_parent) then
      raise exception 'you do not run the branch you are moving it into';
    end if;
    if p_parent in (select private.branch_subtree(p_branch)) then
      raise exception 'a branch cannot move inside itself';
    end if;
  end if;

  begin
    update public.branches set parent_id = p_parent where id = p_branch;
  exception when unique_violation then
    raise exception 'there is already a branch with that name there';
  end;
  perform private.sync_branch_roadmaps(null);

  insert into public.audit_log (actor_id, action, detail)
  values (v_uid, 'move_branch',
          jsonb_build_object('branch_id', p_branch, 'parent_id', p_parent));
end;
$$;

create or replace function public.move_circle(p_group uuid, p_branch uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := private.require_caller_profile();
  v_from uuid;
begin
  select branch_id into v_from from public.groups where id = p_group;
  if v_from is null then
    raise exception 'that circle is not in a branch';
  end if;
  if not private.is_steward_of(v_from) then
    raise exception 'you do not run the branch it is in';
  end if;
  if not exists (select 1 from public.branches where id = p_branch) then
    raise exception 'branch not found';
  end if;
  if not private.is_steward_of(p_branch) then
    raise exception 'you can only move it to a branch you run';
  end if;
  if not private.branch_live(p_branch) then
    raise exception 'that branch is archived';
  end if;

  -- The trigger from 0044 re-syncs its roadmaps.
  update public.groups set branch_id = p_branch where id = p_group;

  insert into public.audit_log (actor_id, action, group_id, detail)
  values (v_uid, 'move_circle', p_group,
          jsonb_build_object('from', v_from, 'to', p_branch));
end;
$$;

-- Deleting: a camp in any state; a session never (cancel the week).
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
  if v.series_id is not null then
    raise exception 'cancel this week instead; the weekly halaqah would lay it out again';
  end if;
  delete from public.events where id = p_event;
  insert into public.audit_log (actor_id, action, detail)
  values (v_uid, 'delete_event',
          jsonb_build_object('event_id', p_event, 'status', v.status));
end;
$$;

create or replace function public.delete_series(p_series uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_caller_profile();
  v_branch uuid;
begin
  select branch_id into v_branch from public.event_series where id = p_series;
  if v_branch is null then
    raise exception 'halaqah not found';
  end if;
  if not private.is_steward_of(v_branch) then
    raise exception 'you do not run that branch';
  end if;
  -- Its sessions, their answers, polls and questions go with it (cascades).
  delete from public.event_series where id = p_series;
  insert into public.audit_log (actor_id, action, detail)
  values (v_uid, 'delete_series', jsonb_build_object('series_id', p_series));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.set_branch_archived(uuid, boolean)',
    'public.move_branch(uuid, uuid)',
    'public.move_circle(uuid, uuid)',
    'public.delete_event(uuid)',
    'public.delete_series(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
