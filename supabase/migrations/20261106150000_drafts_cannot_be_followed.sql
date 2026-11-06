-- ============================================================================
-- Migration 0041: a circle can only follow a PUBLISHED roadmap (D77)
-- ----------------------------------------------------------------------------
-- Two writers add a `group_roadmaps` row: a circle's admins (Manage, through the
-- table's insert policy) and an organiser (`set_circle_on_roadmap`, 0037). Both
-- accepted a draft. For an organiser it was deliberate ("line circles up before
-- publishing"), and it leaked into Manage too: `roadmaps_select_published` lets
-- an organiser read drafts, so their Manage checklist offered them unlabelled.
--
-- OWNER'S CALL (2026-11-06): following a draft is a weird choice. Block it
-- everywhere. A draft is something being written, not something to join.
--
-- TWO WRITERS, TWO CHECKS, NOT A TRIGGER. A BEFORE INSERT trigger would be one
-- choke point, but triggers run BEFORE row-level security: a plain member trying
-- to follow a draft would get "publish this roadmap" instead of the RLS refusal,
-- which tells them a hidden draft exists (pgTAP 014 pins that there is no such
-- oracle). So the policy refuses for circle admins with the ordinary RLS error,
-- and the organiser RPC refuses with a readable message, having checked the
-- caller first.
--
-- WHAT DOES NOT CHANGE:
--   * Unpublishing a roadmap still leaves its circles on it (Manage shows the
--     row as "isn't published right now"), so publishing it again restores it.
--     Only NEW rows are checked.
--   * Rows that already point at a draft are left alone. Deleting them here
--     would drop an organiser's arrangement without telling them.
-- ============================================================================

-- Circle admins (Manage). Same as 0028, plus `published`. Spelled out rather
-- than left to `roadmaps_select_published`, because that policy lets an
-- organiser read drafts, and organisers are often circle admins too.
drop policy group_roadmaps_insert_admin on public.group_roadmaps;
create policy group_roadmaps_insert_admin on public.group_roadmaps
  for insert to authenticated
  with check (
    private.is_group_admin(group_id)
    and exists (
      select 1 from public.roadmaps r
       where r.id = roadmap_id and r.published
    )
  );

-- Organisers (the builder's Circles panel). Same as 0037, plus `published` on
-- the adding branch. Removing a circle stays possible whatever the state.
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
    if not exists (select 1 from public.roadmaps
                    where id = p_roadmap and published) then
      raise exception 'publish this roadmap before adding circles to it';
    end if;
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

-- 0037's comment said the opposite. Say what is true now.
comment on function public.set_circle_on_roadmap(uuid, uuid, boolean) is
  'Organisers add or remove one circle on a roadmap (0037, D72). Adding needs the '
  'roadmap to be published (0041, D77); removing always works.';
