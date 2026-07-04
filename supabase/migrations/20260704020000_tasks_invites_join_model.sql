-- ============================================================================
-- CET-4/CET-5 · Migration 0007 — M2: tasks, invites, and the join model
-- ----------------------------------------------------------------------------
-- The first product-domain tables on top of the foundation:
--   * tasks    — the group's shared list (D17 generic vocabulary; admin-managed)
--   * invites  — D34/D35 shareable link/code joining, ONE namespace:
--       - code is DB-generated (column default; never client-supplied)
--       - email NULL  → an OPEN invite: reusable until the admin revokes it
--                       (the "one WhatsApp link for the whole halaqah" case)
--       - email set   → LOCKED to that verified sign-in email; single-use
--                       (deleted on accept). Nothing is ever emailed (D34).
--   * groups.invite_code is DROPPED — it predated D34; two join-code
--     namespaces would be confusing and double the leak surface (D35).
--   * memberships tightened (D34): the admin direct-INSERT policy is dropped —
--     a membership row is only ever created by create_group (owner bootstrap)
--     or accept_invite (the invitee, on their own accept). The mock's
--     addUserToGroup direct-add is gone.
--   * RPCs: lookup_invite (the /join/[code] preview — the invitee is NOT a
--     member yet, so no RLS path can show them the group name) and
--     accept_invite (validates the lock, creates the membership, consumes a
--     locked invite). Both SECURITY DEFINER + client-callable with internal
--     auth guards → 2 more accepted "exposed function" advisor WARNs (now 4).
-- Explicit grants ship with each table (cross-cutting standard #6 / 0006).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- tasks (PRD §6; D17: replaces dhikr_items — label/subtitle/target per group)
-- ----------------------------------------------------------------------------

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups on delete cascade,
  label        text not null,
  subtitle     text,
  target_count integer not null check (target_count > 0),
  sort_order   integer not null default 0
);
create index tasks_group_id_idx on public.tasks (group_id);

alter table public.tasks enable row level security;

-- Read: any group member. Write: owner/co-admin (D26 — both manage the list).
create policy tasks_select_member on public.tasks
  for select to authenticated
  using (private.is_group_member(group_id));

create policy tasks_insert_admin on public.tasks
  for insert to authenticated
  with check (private.is_group_admin(group_id));

create policy tasks_update_admin on public.tasks
  for update to authenticated
  using (private.is_group_admin(group_id))
  with check (private.is_group_admin(group_id));

create policy tasks_delete_admin on public.tasks
  for delete to authenticated
  using (private.is_group_admin(group_id));

-- Grants: id is server-generated; group_id immutable after insert (a task
-- never moves between groups — RLS's WITH CHECK alone can't stop an admin of
-- two groups shuffling tasks across them).
grant select, delete                                            on public.tasks to authenticated;
grant insert (group_id, label, subtitle, target_count, sort_order) on public.tasks to authenticated;
grant update (label, subtitle, target_count, sort_order)           on public.tasks to authenticated;

-- ----------------------------------------------------------------------------
-- invites (D34/D35) — admin-visible only; the invitee goes through the RPCs
-- ----------------------------------------------------------------------------

create table public.invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups on delete cascade,
  email      text check (email is null or email = lower(email)), -- null = open/reusable (D35); set = locked/single-use
  role       text not null default 'member' check (role in ('admin','member')), -- never straight to owner
  code       text not null unique
               default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);
create index invites_group_id_idx on public.invites (group_id);

alter table public.invites enable row level security;

-- Owner + co-admins create, list, and revoke (delete) invites; re-share is a
-- co-admin power (D26). No UPDATE — to change an invite, revoke + re-create.
create policy invites_select_admin on public.invites
  for select to authenticated
  using (private.is_group_admin(group_id));

create policy invites_insert_admin on public.invites
  for insert to authenticated
  with check (private.is_group_admin(group_id));

create policy invites_delete_admin on public.invites
  for delete to authenticated
  using (private.is_group_admin(group_id));

-- Grants: `code` deliberately NOT insertable — the DB default generates it, so
-- a client can never mint a vanity/guessable code (D34: "generated in the DB,
-- never the client").
grant select, delete             on public.invites to authenticated;
grant insert (group_id, email, role) on public.invites to authenticated;

-- ----------------------------------------------------------------------------
-- Tighten memberships to invite/accept-only (D34)
-- ----------------------------------------------------------------------------

drop policy memberships_insert_admin on public.memberships;
revoke insert on public.memberships from authenticated;

-- ----------------------------------------------------------------------------
-- Drop groups.invite_code (D35 — one code namespace) + slim create_group
-- ----------------------------------------------------------------------------

-- Replace first (the old body writes invite_code), then drop the column.
create or replace function public.create_group(p_name text)
  returns public.groups
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  g     public.groups;
begin
  if v_uid is null then
    raise exception 'must be authenticated to create a group';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'group name is required';
  end if;

  insert into public.groups (name, created_by)
  values (btrim(p_name), v_uid)
  returning * into g;

  insert into public.memberships (user_id, group_id, role)
  values (v_uid, g.id, 'owner');

  return g;
end;
$$;

-- Drops the unique constraint and the 0004/0006 column grant with it; the
-- groups UPDATE grant is now effectively (name) only.
alter table public.groups drop column invite_code;

-- ----------------------------------------------------------------------------
-- lookup_invite: the /join/[code] preview. SECURITY DEFINER because the
-- invitee is not yet a member — no RLS path lets them see the group. Returns
-- at most one row; an unknown/revoked code returns zero rows (no oracle beyond
-- what holding the capability code already implies).
-- ----------------------------------------------------------------------------

create or replace function public.lookup_invite(p_code text)
  returns table (
    group_id       uuid,
    group_name     text,
    invite_role    text,
    email_locked   boolean,
    email_matches  boolean,
    already_member boolean
  )
  language sql security definer stable set search_path = '' as $$
  select
    g.id,
    g.name,
    i.role,
    i.email is not null,
    i.email is null
      or i.email = lower((select u.email from auth.users u where u.id = (select auth.uid()))),
    exists (
      select 1 from public.memberships m
      where m.group_id = i.group_id and m.user_id = (select auth.uid())
    )
  from public.invites i
  join public.groups g on g.id = i.group_id
  where i.code = p_code
    and (select auth.uid()) is not null; -- authenticated callers only
$$;

revoke all on function public.lookup_invite(text) from public, anon;
grant execute on function public.lookup_invite(text) to authenticated;

-- ----------------------------------------------------------------------------
-- accept_invite: the ONLY client path that creates a membership (besides
-- create_group's owner bootstrap). Validates an email lock against the
-- caller's verified sign-in email (Google/magic-link — D34: enforcement
-- without sending anything), no-ops if already a member, and consumes a
-- locked invite. Returns the group for the post-join redirect.
-- ----------------------------------------------------------------------------

create or replace function public.accept_invite(p_code text)
  returns public.groups
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  inv     public.invites;
  g       public.groups;
begin
  if v_uid is null then
    raise exception 'must be authenticated to accept an invite';
  end if;

  select * into inv from public.invites where code = p_code;
  if not found then
    raise exception 'invite not found or revoked';
  end if;

  select * into g from public.groups where id = inv.group_id;

  -- Already in the group → idempotent no-op, checked BEFORE the email lock
  -- (a member re-opening any join link just lands back in their group). Never
  -- a role change (an invite must not become a sideways promotion path) and
  -- never consumes the invite.
  if exists (
    select 1 from public.memberships
    where group_id = inv.group_id and user_id = v_uid
  ) then
    return g;
  end if;

  if inv.email is not null then
    select lower(u.email) into v_email from auth.users u where u.id = v_uid;
    if v_email is distinct from inv.email then
      raise exception 'this invite is locked to a different email';
    end if;
  end if;

  insert into public.memberships (user_id, group_id, role)
  values (v_uid, inv.group_id, inv.role)
  on conflict (user_id, group_id) do nothing; -- double-tap race

  -- D35: locked = single-use; open invites live until the admin revokes them.
  if inv.email is not null then
    delete from public.invites where id = inv.id;
  end if;

  return g;
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
