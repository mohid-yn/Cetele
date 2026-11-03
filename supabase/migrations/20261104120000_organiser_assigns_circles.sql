-- ============================================================================
-- Migration 0037: an organiser can see and assign the circles on a roadmap (D72)
-- ----------------------------------------------------------------------------
-- Publishing a roadmap only makes it AVAILABLE. Members see it once their circle
-- follows it, and until now only that circle's own admins could arrange that.
-- The organiser who built the roadmap could not see who was on it, so "is this
-- reaching anyone?" had no answer on the screen where it mattered.
--
-- WHAT CHANGES (owner's call, 2026-11-04):
--   * An organiser may list every circle and add or remove one from a roadmap.
--   * Circle admins KEEP their own control in Manage. This adds a second writer,
--     it does not move the decision away from the circle.
--
-- WHAT DOES NOT CHANGE:
--   * `groups` and `memberships` stay unreadable to an organiser. D27 keeps them
--     out of circles; this function returns a name and a head-count and nothing
--     else about the people inside.
--   * Removing a circle deletes the `group_roadmaps` row only. Progress is keyed
--     on the member and the item (D55), so nothing recorded is touched.
--
-- ALSO HERE: an atomic reorder. Ordering used to be a number typed into a form,
-- and swapping two rows through `set_roadmap_item_shape` is two writes that can
-- half-land. Position has no bearing on completion, so it is not frozen.
-- ============================================================================

-- Every circle, and whether it is on this roadmap. Organisers only: the refusal
-- is a raised exception rather than an empty list, so a member can never mistake
-- a refused call for "no circles exist".
create or replace function public.roadmap_circles(p_roadmap uuid)
  returns table (group_id uuid, name text, member_count integer, following boolean)
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
           exists (select 1
                     from public.group_roadmaps gr
                    where gr.group_id = g.id
                      and gr.roadmap_id = p_roadmap)
      from public.groups g
     order by g.name, g.id;
end;
$$;

-- Add or remove one circle. Works on a draft too: an organiser can line circles
-- up first, and members see nothing until the roadmap is published, because
-- `roadmaps_select_published` still decides whether the row is readable.
create or replace function public.set_circle_on_roadmap(
  p_roadmap uuid,
  p_group   uuid,
  p_follow  boolean
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
  if not exists (select 1 from public.groups where id = p_group) then
    raise exception 'circle not found';
  end if;

  if p_follow then
    insert into public.group_roadmaps (group_id, roadmap_id)
    values (p_group, p_roadmap)
    on conflict (group_id, roadmap_id) do nothing;
  else
    delete from public.group_roadmaps
     where group_id = p_group and roadmap_id = p_roadmap;
  end if;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'set_circle_on_roadmap', null,
          jsonb_build_object('roadmap', p_roadmap, 'group', p_group,
                             'follow', p_follow));
end;
$$;

-- Set the order of one category's items in a single statement. Every id must
-- belong to that roadmap, level and category, and every item in it must be
-- listed, so a stale screen is refused instead of leaving two rows tied.
create or replace function public.reorder_roadmap_items(
  p_roadmap  uuid,
  p_level    integer,
  p_category text,
  p_items    uuid[]
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;

  if coalesce(cardinality(p_items), 0) <> (
       select count(*) from public.roadmap_items
        where roadmap_id = p_roadmap
          and level = p_level
          and category = p_category)
     or exists (
       select 1 from public.roadmap_items
        where roadmap_id = p_roadmap
          and level = p_level
          and category = p_category
          and not (id = any (p_items)))
     or (select count(distinct x) from unnest(p_items) as x)
          <> cardinality(p_items)
  then
    raise exception 'this list has changed since you opened it. Reload and try again';
  end if;

  update public.roadmap_items i
     set sort_order = o.position
    from unnest(p_items) with ordinality as o(id, position)
   where i.id = o.id;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'reorder_roadmap_items', null,
          jsonb_build_object('roadmap', p_roadmap, 'level', p_level,
                             'category', p_category));
end;
$$;

revoke all on function public.roadmap_circles(uuid) from public, anon;
grant execute on function public.roadmap_circles(uuid) to authenticated;

revoke all on function public.set_circle_on_roadmap(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_circle_on_roadmap(uuid, uuid, boolean) to authenticated;

revoke all on function public.reorder_roadmap_items(uuid, integer, text, uuid[]) from public, anon;
grant execute on function public.reorder_roadmap_items(uuid, integer, text, uuid[]) to authenticated;
