-- ============================================================================
-- Migration 0030 — an organiser AUTHORS a programme, with a guard on the parts
--                  that decide what finishing means
-- ----------------------------------------------------------------------------
-- D55 authored every roadmap row by migration and said so plainly: "no client
-- writes them, so no client may." 0027 moved half a step — url, description and
-- image_url became editable — and kept the rest behind a deploy, because
-- `level`, `category`, `unit`, `target` and `compulsory` are what COMPLETION is
-- computed from, and editing them re-judges progress members have already
-- earned against a rule that changed afterwards.
--
-- That reasoning was never an argument for a deploy. It was an argument for a
-- LOCK. The owner's call (2026-08-09): an organiser creates and deletes
-- programmes, adds and removes the work inside them, and edits any of it — but
-- a field that decides completion freezes the moment somebody has actually
-- recorded something against it.
--
--   ALWAYS editable        title, source, sort_order, url, description, cover,
--                          reward label + description, the programme's name,
--                          dates, and published
--   FROZEN once recorded   level, category, unit, target, compulsory,
--                          reward threshold, level requirement min_total
--   NEVER destroyed        an item anyone has recorded against cannot be
--                          deleted, and neither can the programme holding it
--
-- "RECORDED" MEANS `done > 0`, NOT "a row exists". `set_roadmap_progress`
-- writes a row for a tap and keeps it when the member undoes back to zero, so
-- keying the lock on row existence would let one accidental tap freeze a
-- programme's structure permanently. Work actually done is the thing worth
-- protecting.
--
-- WHAT THIS DELIBERATELY DOES NOT ADD is a per-item "retired" flag. Hiding an
-- item from the member's screen changes what its level requires, which is the
-- same re-judging by another name — a level of five items silently becoming a
-- level of four completes it for everyone who had done the other four. The
-- honest move for a mistake on a live programme is to unpublish the PROGRAMME:
-- it leaves every circle, keeps every record, and is reversible.
--
-- ADDING AN ITEM IS CHECKED AGAINST THE LEVEL, not the programme. A new item
-- makes its level harder, so it is refused where somebody has already FINISHED
-- that level (it would un-finish them) and allowed everywhere else — including
-- on a live programme, which is how a lecture gets added in March.
--
-- Every function here: organiser-only, SECURITY DEFINER with an empty
-- search_path, and audited (D27). None of them is reachable by a circle owner —
-- maximum authority inside a circle is not authorship of the administration's
-- programme (D55).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The guards, as functions, so every RPC below asks the same question
-- ----------------------------------------------------------------------------
create or replace function private.item_recorded(p_item uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.roadmap_progress
     where item_id = p_item and done > 0
  );
$$;

comment on function private.item_recorded(uuid) is
  'Has anyone actually done work against this item (0030)? `done > 0`, not row '
  'existence — an undone tap leaves a zero row behind and must not freeze the '
  'item forever.';

create or replace function private.roadmap_recorded(p_roadmap uuid)
  returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
      from public.roadmap_progress rp
      join public.roadmap_items ri on ri.id = rp.item_id
     where ri.roadmap_id = p_roadmap and rp.done > 0
  );
$$;

-- Has anyone FINISHED this level? Asked before a new item is added to it: the
-- item would make the level harder, and a level that was complete on Monday
-- must not be incomplete on Tuesday because the administration added a lecture.
-- Only members who have recorded something are considered — nobody else can
-- have completed anything.
create or replace function private.level_finished_by_anyone(
  p_roadmap uuid, p_level integer
) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
      from (
        select distinct rp.user_id
          from public.roadmap_progress rp
          join public.roadmap_items ri on ri.id = rp.item_id
         where ri.roadmap_id = p_roadmap and rp.done > 0
      ) u
     where private.level_complete(u.user_id, p_roadmap, p_level)
  );
$$;

-- Callable only by the definer-rights functions below, never by a client.
revoke all on function private.item_recorded(uuid) from public, anon, authenticated;
revoke all on function private.roadmap_recorded(uuid) from public, anon, authenticated;
revoke all on function private.level_finished_by_anyone(uuid, integer)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- The programme itself
-- ----------------------------------------------------------------------------
-- A new programme is born UNPUBLISHED, and that is the whole shape of the
-- authoring flow: nothing a circle can see exists until the organiser says so.
-- `roadmaps_select_published` (0025) already hides it from everyone but an
-- organiser, so a half-built programme is invisible rather than embarrassing.
create or replace function public.create_roadmap(
  p_name      text,
  p_starts_on date,
  p_ends_on   date
) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := private.require_caller_profile();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_id   uuid;
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;
  if v_name is null then
    raise exception 'a programme needs a name';
  end if;
  if p_starts_on is null or p_ends_on is null then
    raise exception 'a programme needs a start and an end';
  end if;
  if p_ends_on < p_starts_on then
    raise exception 'the end cannot come before the start';
  end if;

  insert into public.roadmaps (name, starts_on, ends_on, published)
  values (v_name, p_starts_on, p_ends_on, false)
  returning id into v_id;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'create_roadmap', null,
          jsonb_build_object('roadmap', v_id, 'name', v_name));

  return v_id;
end;
$$;

-- Name and dates are presentation and window. Neither can change whether
-- anyone has finished anything, so neither is ever frozen — a programme whose
-- name was mistyped stays fixable in its last week.
create or replace function public.update_roadmap(
  p_roadmap   uuid,
  p_name      text,
  p_starts_on date,
  p_ends_on   date
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := private.require_caller_profile();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;
  if not exists (select 1 from public.roadmaps where id = p_roadmap) then
    raise exception 'programme not found';
  end if;
  if v_name is null then
    raise exception 'a programme needs a name';
  end if;
  if p_starts_on is null or p_ends_on is null then
    raise exception 'a programme needs a start and an end';
  end if;
  if p_ends_on < p_starts_on then
    raise exception 'the end cannot come before the start';
  end if;

  update public.roadmaps
     set name = v_name, starts_on = p_starts_on, ends_on = p_ends_on
   where id = p_roadmap;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'update_roadmap', null,
          jsonb_build_object('roadmap', p_roadmap, 'name', v_name));
end;
$$;

-- Publishing is the only control that changes who can SEE a programme, and it
-- is reversible in both directions. Unpublishing does not un-follow the circles
-- on it (0028 left that alone deliberately) and destroys nothing: the member's
-- screen falls back to "not following a programme", and everything recorded is
-- exactly where it was if it is published again.
create or replace function public.set_roadmap_published(
  p_roadmap   uuid,
  p_published boolean
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;
  if p_published is null then
    raise exception 'published must be true or false';
  end if;
  if not exists (select 1 from public.roadmaps where id = p_roadmap) then
    raise exception 'programme not found';
  end if;

  update public.roadmaps set published = p_published where id = p_roadmap;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'set_roadmap_published', null,
          jsonb_build_object('roadmap', p_roadmap, 'published', p_published));
end;
$$;

-- DELETE REFUSES ONCE ANYTHING IS RECORDED, and says what to do instead. The
-- cascade would take `roadmap_items` and every `roadmap_progress` row with it —
-- a year of members' records behind one confirm dialog, with no undo and no
-- copy of what the rows held. Nothing a member earned is ever revoked (§4), so
-- the only programmes that can be deleted are the ones nobody has worked on:
-- the mistyped one, the duplicate, the draft that went nowhere.
create or replace function public.delete_roadmap(p_roadmap uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := private.require_caller_profile();
  v_name text;
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;

  select name into v_name from public.roadmaps where id = p_roadmap;
  if v_name is null then
    raise exception 'programme not found';
  end if;

  if private.roadmap_recorded(p_roadmap) then
    raise exception
      'members have recorded progress on this programme — unpublish it instead';
  end if;

  delete from public.roadmaps where id = p_roadmap;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'delete_roadmap', null,
          jsonb_build_object('roadmap', p_roadmap, 'name', v_name));
end;
$$;

-- ----------------------------------------------------------------------------
-- The work inside it
-- ----------------------------------------------------------------------------
create or replace function public.create_roadmap_item(
  p_roadmap    uuid,
  p_level      integer,
  p_category   text,
  p_title      text,
  p_source     text,
  p_unit       text,
  p_target     integer,
  p_compulsory boolean,
  p_sort_order integer
) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_caller_profile();
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_unit  text := nullif(btrim(coalesce(p_unit, '')), '');
  v_src   text := nullif(btrim(coalesce(p_source, '')), '');
  v_id    uuid;
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;
  if not exists (select 1 from public.roadmaps where id = p_roadmap) then
    raise exception 'programme not found';
  end if;
  if v_title is null then
    raise exception 'the work needs a title';
  end if;
  if v_unit is null then
    raise exception 'the work needs a unit — minutes, juz, chapters';
  end if;
  if coalesce(p_target, 0) < 1 then
    raise exception 'the target must be at least 1';
  end if;
  if coalesce(p_level, 0) < 1 then
    raise exception 'the level must be at least 1';
  end if;

  -- The level check, not a programme-wide one: adding work to a level somebody
  -- has already finished would take the finish away from them.
  if private.level_finished_by_anyone(p_roadmap, p_level) then
    raise exception
      'somebody has already finished level % — adding to it would undo that',
      p_level;
  end if;

  insert into public.roadmap_items
    (roadmap_id, level, category, title, source, unit, target, compulsory,
     sort_order)
  values
    (p_roadmap, p_level, p_category, v_title, v_src, v_unit, p_target,
     coalesce(p_compulsory, false), coalesce(p_sort_order, 0))
  returning id into v_id;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'create_roadmap_item', null,
          jsonb_build_object('roadmap', p_roadmap, 'item', v_id,
                             'level', p_level, 'title', v_title));

  return v_id;
end;
$$;

-- THE SHAPE of an item, as opposed to its content (0027 owns url/description/
-- image_url). The freeze is by COMPARISON rather than a blanket refusal: an
-- item people are working on can still have its title corrected or its position
-- changed, and only a field that would re-judge them is refused. Refusing the
-- whole call would have meant a typo in a lecture title standing all year.
create or replace function public.set_roadmap_item_shape(
  p_item       uuid,
  p_level      integer,
  p_category   text,
  p_title      text,
  p_source     text,
  p_unit       text,
  p_target     integer,
  p_compulsory boolean,
  p_sort_order integer
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_caller_profile();
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_unit  text := nullif(btrim(coalesce(p_unit, '')), '');
  v_src   text := nullif(btrim(coalesce(p_source, '')), '');
  v_row   public.roadmap_items%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;

  select * into v_row from public.roadmap_items where id = p_item;
  if v_row.id is null then
    raise exception 'roadmap item not found';
  end if;
  if v_title is null then
    raise exception 'the work needs a title';
  end if;
  if v_unit is null then
    raise exception 'the work needs a unit — minutes, juz, chapters';
  end if;
  if coalesce(p_target, 0) < 1 then
    raise exception 'the target must be at least 1';
  end if;
  if coalesce(p_level, 0) < 1 then
    raise exception 'the level must be at least 1';
  end if;

  if private.item_recorded(p_item)
     and (p_level                    is distinct from v_row.level
       or p_category                 is distinct from v_row.category
       or v_unit                     is distinct from v_row.unit
       or p_target                   is distinct from v_row.target
       or coalesce(p_compulsory, false)
                                     is distinct from v_row.compulsory)
  then
    raise exception
      'members have recorded progress on this item — its level, category, unit, '
      'target and compulsory flag are fixed now';
  end if;

  -- Moving an item INTO a level somebody has finished is the same harm as
  -- creating one there, so it is refused for the same reason.
  if p_level is distinct from v_row.level
     and private.level_finished_by_anyone(v_row.roadmap_id, p_level)
  then
    raise exception
      'somebody has already finished level % — moving work into it would undo that',
      p_level;
  end if;

  update public.roadmap_items
     set level      = p_level,
         category   = p_category,
         title      = v_title,
         source     = v_src,
         unit       = v_unit,
         target     = p_target,
         compulsory = coalesce(p_compulsory, false),
         sort_order = coalesce(p_sort_order, v_row.sort_order)
   where id = p_item;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'set_roadmap_item_shape', null,
          jsonb_build_object('item', p_item, 'level', p_level,
                             'target', p_target, 'title', v_title));
end;
$$;

create or replace function public.delete_roadmap_item(p_item uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_caller_profile();
  v_title text;
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;

  select title into v_title from public.roadmap_items where id = p_item;
  if v_title is null then
    raise exception 'roadmap item not found';
  end if;

  -- Deleting an item destroys what people recorded against it. Same rule as the
  -- programme: only work nobody has done can be taken away.
  if private.item_recorded(p_item) then
    raise exception
      'members have recorded progress on this item — it cannot be removed';
  end if;

  delete from public.roadmap_items where id = p_item;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'delete_roadmap_item', null,
          jsonb_build_object('item', p_item, 'title', v_title));
end;
$$;

-- ----------------------------------------------------------------------------
-- Rewards, and the budget a category is scored against
-- ----------------------------------------------------------------------------
-- The reward's THRESHOLD is a promise about how much work earns it, so it
-- freezes with everything else. Its label and description do not: "$1,000
-- toward the international trip" is the administration describing what it
-- gives, and that wording is exactly the thing still open (Q1). An organiser
-- can now settle it without a migration, on a programme already under way.
-- `p_reward` comes LAST and defaults to null, which is what makes "add" and
-- "edit" one function honestly: a caller creating a reward simply omits it.
-- Postgres requires defaulted parameters at the end, and the ordering also
-- keeps the generated TypeScript truthful — an id typed `string` that callers
-- had to pass as null would have needed a cast at every call site.
create or replace function public.upsert_roadmap_reward(
  p_roadmap     uuid,
  p_threshold   integer,
  p_label       text,
  p_description text,
  p_reward      uuid default null
) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_caller_profile();
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_dsc   text := nullif(btrim(coalesce(p_description, '')), '');
  v_old   integer;
  v_id    uuid;
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;
  if not exists (select 1 from public.roadmaps where id = p_roadmap) then
    raise exception 'programme not found';
  end if;
  if v_label is null then
    raise exception 'a reward needs a label';
  end if;
  if coalesce(p_threshold, 0) < 1 then
    raise exception 'a reward unlocks at level 1 or later';
  end if;

  if p_reward is null then
    if private.roadmap_recorded(p_roadmap) then
      raise exception
        'members have recorded progress on this programme — its rewards are fixed now';
    end if;
    insert into public.roadmap_rewards (roadmap_id, threshold, label, description)
    values (p_roadmap, p_threshold, v_label, v_dsc)
    returning id into v_id;
  else
    select threshold into v_old from public.roadmap_rewards
     where id = p_reward and roadmap_id = p_roadmap;
    if v_old is null then
      raise exception 'reward not found on this programme';
    end if;
    if p_threshold is distinct from v_old
       and private.roadmap_recorded(p_roadmap) then
      raise exception
        'members have recorded progress on this programme — a reward''s level is fixed now';
    end if;
    update public.roadmap_rewards
       set threshold = p_threshold, label = v_label, description = v_dsc
     where id = p_reward;
    v_id := p_reward;
  end if;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'upsert_roadmap_reward', null,
          jsonb_build_object('roadmap', p_roadmap, 'reward', v_id,
                             'threshold', p_threshold, 'label', v_label));

  return v_id;
end;
$$;

create or replace function public.delete_roadmap_reward(p_reward uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := private.require_caller_profile();
  v_roadmap uuid;
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;

  select roadmap_id into v_roadmap from public.roadmap_rewards
   where id = p_reward;
  if v_roadmap is null then
    raise exception 'reward not found';
  end if;

  -- A reward people are working toward is a promise already made.
  if private.roadmap_recorded(v_roadmap) then
    raise exception
      'members have recorded progress on this programme — its rewards are fixed now';
  end if;

  delete from public.roadmap_rewards where id = p_reward;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'delete_roadmap_reward', null,
          jsonb_build_object('roadmap', v_roadmap, 'reward', p_reward));
end;
$$;

-- The budget that turns a category from "finish all of these" into "choose 600
-- minutes of them" (D55). It decides completion outright, so it is frozen from
-- the first recorded minute — creating, changing and removing one alike.
create or replace function public.set_roadmap_level_requirement(
  p_roadmap   uuid,
  p_level     integer,
  p_category  text,
  p_min_total integer
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_caller_profile();
begin
  if not private.is_super_admin() then
    raise exception 'organisers only';
  end if;
  if not exists (select 1 from public.roadmaps where id = p_roadmap) then
    raise exception 'programme not found';
  end if;
  if private.roadmap_recorded(p_roadmap) then
    raise exception
      'members have recorded progress on this programme — how a category is scored is fixed now';
  end if;

  -- NULL clears the budget, turning the category back into "complete every
  -- item". Same convention as 0027's editor: the form always submits, so
  -- removing has to be expressible.
  if p_min_total is null then
    delete from public.roadmap_level_requirements
     where roadmap_id = p_roadmap and level = p_level and category = p_category;
  else
    if p_min_total < 1 then
      raise exception 'a budget must be at least 1';
    end if;
    insert into public.roadmap_level_requirements
      (roadmap_id, level, category, min_total)
    values (p_roadmap, p_level, p_category, p_min_total)
    on conflict (roadmap_id, level, category)
      do update set min_total = excluded.min_total;
  end if;

  insert into public.audit_log (actor_id, action, target_user_id, detail)
  values (v_uid, 'set_roadmap_level_requirement', null,
          jsonb_build_object('roadmap', p_roadmap, 'level', p_level,
                             'category', p_category, 'min_total', p_min_total));
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants — `authenticated` only, and each function decides for itself
-- ----------------------------------------------------------------------------
-- Every one of these refuses a non-organiser in its first three lines, so the
-- grant is not the gate; it is the standard shape (0006: explicit client
-- grants, nothing reachable by `anon`).
revoke all on function public.create_roadmap(text, date, date) from public, anon;
grant execute on function public.create_roadmap(text, date, date) to authenticated;

revoke all on function public.update_roadmap(uuid, text, date, date) from public, anon;
grant execute on function public.update_roadmap(uuid, text, date, date) to authenticated;

revoke all on function public.set_roadmap_published(uuid, boolean) from public, anon;
grant execute on function public.set_roadmap_published(uuid, boolean) to authenticated;

revoke all on function public.delete_roadmap(uuid) from public, anon;
grant execute on function public.delete_roadmap(uuid) to authenticated;

revoke all on function public.create_roadmap_item(
  uuid, integer, text, text, text, text, integer, boolean, integer)
  from public, anon;
grant execute on function public.create_roadmap_item(
  uuid, integer, text, text, text, text, integer, boolean, integer)
  to authenticated;

revoke all on function public.set_roadmap_item_shape(
  uuid, integer, text, text, text, text, integer, boolean, integer)
  from public, anon;
grant execute on function public.set_roadmap_item_shape(
  uuid, integer, text, text, text, text, integer, boolean, integer)
  to authenticated;

revoke all on function public.delete_roadmap_item(uuid) from public, anon;
grant execute on function public.delete_roadmap_item(uuid) to authenticated;

revoke all on function public.upsert_roadmap_reward(uuid, integer, text, text, uuid)
  from public, anon;
grant execute on function public.upsert_roadmap_reward(uuid, integer, text, text, uuid)
  to authenticated;

revoke all on function public.delete_roadmap_reward(uuid) from public, anon;
grant execute on function public.delete_roadmap_reward(uuid) to authenticated;

revoke all on function public.set_roadmap_level_requirement(uuid, integer, text, integer)
  from public, anon;
grant execute on function public.set_roadmap_level_requirement(uuid, integer, text, integer)
  to authenticated;

comment on function public.delete_roadmap(uuid) is
  'Delete a programme outright (0030). REFUSES once any member has recorded '
  'work on it — unpublish instead, which hides it from every circle and keeps '
  'every record. Organisers only, audited.';

comment on function public.set_roadmap_item_shape(
  uuid, integer, text, text, text, text, integer, boolean, integer) is
  'Edit the parts of an item that decide completion (0030). Level, category, '
  'unit, target and compulsory FREEZE once anyone has recorded against it; '
  'title, source and sort_order stay editable. Content (url, description, '
  'cover) belongs to set_roadmap_item_content instead (0027).';
