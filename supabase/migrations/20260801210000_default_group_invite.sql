-- ============================================================================
-- Migration 0022 — one default, regenerable, member-level invite per circle
-- ----------------------------------------------------------------------------
-- Owner: "i dont like how you can create invites and revoke them make it so
-- theres a default invite that can be made and it can be regenerated its only a
-- member level invite so admins can only be made manually".
--
-- Two decisions, both the owner's, taken before writing this:
--
--   1. The default link is ALWAYS THERE — every circle owns exactly one open
--      member link from the moment it is created, and the only control is
--      Regenerate. Not "create it when you need it": "default" means default.
--   2. One-off email-locked invites STAY, alongside it. They were offered for
--      removal and kept, so this migration must support BOTH shapes in one
--      table rather than collapsing invites to a single row per group.
--
-- What actually changes:
--
--   * ADMIN INVITES ARE GONE. `role` is pinned to 'member'. A co-admin is now
--     only ever made by promoting an existing member (`setMemberRole`, which
--     already existed) — so the promotion is always a deliberate act against a
--     person you can see, never a link that quietly confers it on whoever
--     opens it. Any pending admin invite is DOWNGRADED, not deleted: the link
--     someone was already given keeps working and now grants member, which is
--     the recoverable failure (deleting it strands an invitee with a dead link
--     and no way to know why).
--   * The default link is the row with `email is null`, and a partial unique
--     index makes "exactly one per circle" a DATABASE fact rather than a UI
--     convention. Email-locked rows are unconstrained in number.
--   * The default link CANNOT BE DELETED — the RLS delete policy now excludes
--     it. Revoke was the thing the owner disliked; the replacement is
--     regenerate, which is an UPDATE of the code. `authenticated` still holds
--     NO update grant on the table (002's invariant), so that happens inside
--     `regenerate_invite`, a SECURITY DEFINER RPC. Membership-shaped writes
--     stay RPC-only, as D42/D35/D43 require.
-- ============================================================================

-- 1. Member-level only ------------------------------------------------------

-- Downgrade before tightening the CHECK, or the constraint cannot be validated.
update public.invites set role = 'member' where role <> 'member';

alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites
  add constraint invites_role_check check (role = 'member');
alter table public.invites alter column role set default 'member';

comment on column public.invites.role is
  'Always ''member'' (0022). Admins are made by promoting an existing member, '
  'never by a link — an invite must not be a sideways promotion path.';

-- 2. Exactly one default (open) link per circle ------------------------------

-- Existing circles may hold several open links. Keep the OLDEST — it is the one
-- most likely to have been shared widely — and drop the rest. Deleting the
-- newest instead would be the wrong bet: a link that has been out for weeks is
-- in more people's chat history than one minted yesterday.
delete from public.invites i
using public.invites keep
where i.email is null
  and keep.email is null
  and keep.group_id = i.group_id
  and (keep.created_at, keep.id) < (i.created_at, i.id);

create unique index if not exists invites_one_default_per_group
  on public.invites (group_id)
  where email is null;

comment on index public.invites_one_default_per_group is
  'The default open link is the row with email is null. Exactly one per circle '
  '(0022) — regenerated, never revoked and re-created.';

-- 3. Every circle has one, including the ones that already exist -------------

insert into public.invites (group_id, email, role)
select g.id, null, 'member'
from public.groups g
where not exists (
  select 1 from public.invites i where i.group_id = g.id and i.email is null
);

-- New circles get theirs at creation, so the manage screen never has to render
-- an "it doesn't exist yet" state.
create or replace function public.create_group(p_name text)
returns public.groups
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := private.require_caller_profile();
  g     public.groups;
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'group name is required';
  end if;

  insert into public.groups (name, created_by)
  values (btrim(p_name), v_uid)
  returning * into g;

  insert into public.memberships (user_id, group_id, role)
  values (v_uid, g.id, 'owner');

  -- 0022: the circle's one default member link, created with the circle.
  insert into public.invites (group_id, email, role)
  values (g.id, null, 'member');

  return g;
end;
$$;

-- 4. The default link is regenerated, never revoked --------------------------

drop policy if exists invites_delete_admin on public.invites;
create policy invites_delete_admin on public.invites
  for delete to authenticated
  using (private.is_group_admin(group_id) and email is not null);

comment on policy invites_delete_admin on public.invites is
  'One-off email-locked invites can be revoked. The default open link cannot '
  '(0022) — it is regenerated instead, so a circle is never left unjoinable.';

create or replace function public.regenerate_invite(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid  uuid := private.require_caller_profile();
  v_code text;
begin
  if not private.is_group_admin(p_group_id) then
    raise exception 'only an admin can regenerate the invite link';
  end if;

  -- Mint through the column default so there is ONE definition of what a code
  -- looks like. Re-reading it here rather than duplicating the expression is
  -- deliberate: 002 pins the 8-hex-char shape, and a second copy would drift.
  update public.invites
  set code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  where group_id = p_group_id and email is null
  returning code into v_code;

  -- A circle that somehow has no default row (created before 0022 and racing
  -- the backfill) gets one rather than an error the admin cannot act on.
  if v_code is null then
    insert into public.invites (group_id, email, role)
    values (p_group_id, null, 'member')
    returning code into v_code;
  end if;

  return v_code;
end;
$$;

revoke all on function public.regenerate_invite(uuid) from public, anon;
grant execute on function public.regenerate_invite(uuid) to authenticated;

comment on function public.regenerate_invite(uuid) is
  'Admin-only. Mints a new code for the circle''s default open link, which '
  'kills every previously shared copy. UPDATE lives here because '
  '`authenticated` holds no update grant on public.invites (002).';
