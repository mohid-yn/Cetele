-- ============================================================================
-- Migration 0027 — a roadmap item gets a description, a picture, and an EDITOR
-- ----------------------------------------------------------------------------
-- D55 authored every roadmap field by migration and granted no client write:
-- "roadmaps / items / rewards / requirements are authored by migration. No
-- client writes them, so no client may." That was right about the SHAPE and
-- wrong about the SURFACE, and the URLs proved it — the booklet's links are
-- placeholders (`www.youtube.com/playlist1`), so every `url` shipped NULL and
-- the only way to enter a real one was a migration and a deploy. A programme
-- whose links cannot be fixed without an engineer is a programme with no links.
--
-- SO THE LINE MOVES, BUT ONLY HALF-WAY, AND THE HALF MATTERS.
--
--   EDITABLE by an organiser:  url, description, image_url
--   AUTHORED by migration:     level, category, title, unit, target, compulsory
--
-- The second list is everything COMPLETION is computed from. `target` decides
-- what finishing means; `level` decides which stage it belongs to; `compulsory`
-- decides whether a budget can be met without it. Let an organiser edit those
-- and every member's recorded progress is silently re-judged against a rule
-- that changed after they earned it — the exact failure D54 built
-- `task_config_versions` to stop, and this table has no interval history to
-- absorb it. The editable list is presentation and destination: nothing in it
-- can change whether anyone has finished anything.
--
-- That is also why this is a column-scoped RPC and not an UPDATE policy. A
-- policy governs which ROWS you may touch, not which COLUMNS; the column grant
-- would carry the real restriction, and it would sit far away from the reason
-- for it. One function, the rule and its justification in the same place, and
-- every edit audited.
-- ============================================================================

alter table public.roadmap_items
  add column description text,
  add column image_url   text;

comment on column public.roadmap_items.description is
  'What the item IS, in prose — the booklet''s own blurb (0027). Editable by an '
  'organiser through set_roadmap_item_content; never by a plain member.';

comment on column public.roadmap_items.image_url is
  'A picture for the item: a book cover, a playlist thumbnail. Either an app '
  'path (/roadmap/x.png, which is how the booklet''s own covers ship) or an '
  'absolute http(s) URL. NULL renders as the category''s icon, never a broken '
  'image or a placeholder box.';

-- ----------------------------------------------------------------------------
-- set_roadmap_item_content — the organiser's editor
-- ----------------------------------------------------------------------------
-- Every argument is nullable and NULL means "clear it", not "leave it alone".
-- The caller is a form that always submits all three fields, and a partial-
-- update convention would make clearing a wrong URL impossible to express —
-- the single most likely thing anyone will want to do here.
create or replace function public.set_roadmap_item_content(
  p_item        uuid,
  p_url         text,
  p_description text,
  p_image_url   text
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
  v_img text := nullif(btrim(coalesce(p_image_url, '')), '');
  v_dsc text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;

  if not exists (select 1 from public.roadmap_items where id = p_item) then
    raise exception 'roadmap item not found';
  end if;

  -- A link the app will render as an anchor has to be a link. Without this a
  -- pasted `javascript:` URL becomes a stored XSS vector aimed at every member
  -- of every circle following the programme — the widest blast radius in the
  -- app, and reachable by exactly one compromised organiser account.
  if v_url is not null and v_url !~* '^https?://' then
    raise exception 'a link must start with http:// or https://';
  end if;

  -- The picture is either one of ours (an app-absolute path) or a remote
  -- http(s) image. Same reasoning; `/` is allowed because that is how the
  -- booklet's own covers ship, and it cannot carry a scheme.
  if v_img is not null and v_img !~* '^(https?://|/)' then
    raise exception 'a picture must be a link, or a path beginning with /';
  end if;

  update public.roadmap_items
     set url = v_url, description = v_dsc, image_url = v_img
   where id = p_item;

  -- Audited like every other organiser action (D27/D56). `group_id` is null:
  -- a programme belongs to no circle, which is the whole of D55.
  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'edit_roadmap_item', null,
          jsonb_build_object('item', p_item, 'url', v_url,
                             'has_description', v_dsc is not null,
                             'has_image', v_img is not null));
end;
$$;

revoke all on function public.set_roadmap_item_content(uuid, text, text, text)
  from public, anon;
grant execute on function public.set_roadmap_item_content(uuid, text, text, text)
  to authenticated;

comment on function public.set_roadmap_item_content(uuid, text, text, text) is
  'Edit an item''s link, description and picture (0027, D57). Organisers only, '
  'audited. Deliberately CANNOT reach level/category/title/unit/target/'
  'compulsory — those decide what completion means, and editing them would '
  're-judge progress members have already earned. NULL clears a field.';
