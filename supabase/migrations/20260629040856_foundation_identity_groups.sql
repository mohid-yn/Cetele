-- ============================================================================
-- CET-2 · Migration 0001 — Foundation: identity, groups, memberships
-- ----------------------------------------------------------------------------
-- The dependency root of the whole backend:
--   * SECURITY DEFINER permission helpers (no recursion on `memberships`)
--   * profiles (1:1 with auth.users) · groups (owner = created_by, D26)
--   * memberships (owner | admin | member; exactly one owner per group)
--   * RLS ON for every table from day one (never "secure it later")
--   * owner-safety enforced at the RLS layer + a created_by guard trigger, so a
--     co-admin can never demote/remove the owner or seize the ownership pointer
--   * auto-create a profile row when an auth user signs up
-- Model: D26/D27 Drive-style ownership. Generic D17 vocabulary.
-- NOTE: all ownership *mutations* (create / transfer / claim / reassign) are
--   SECURITY DEFINER RPCs (later migrations) — they bypass RLS by definer
--   privilege and set `app.allow_owner_change` to pass the created_by guard.
-- ============================================================================

-- gen_random_uuid() is built into Postgres 13+ on Supabase; no extension needed.

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- profiles: a row per auth user. NO app-admin flag (D26 removed the tier).
-- One out-of-band recovery/moderation flag (D27), set ONLY in Supabase — the
-- guard trigger below blocks any client from changing it.
create table public.profiles (
  id             uuid primary key references auth.users on delete cascade,
  name           text not null,
  avatar_url     text,
  is_super_admin boolean not null default false,
  created_at     timestamptz not null default now()
);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  created_by  uuid references public.profiles on delete set null, -- D26: the OWNER pointer (ON DELETE SET NULL → succession catches the orphan)
  created_at  timestamptz not null default now()
);

-- D26 roles: owner | admin (co-admin) | member. Exactly one owner per group
-- (= groups.created_by, kept in sync on transfer/succession).
create table public.memberships (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.profiles on delete cascade,
  group_id uuid not null references public.groups on delete cascade,
  role     text not null default 'member' check (role in ('owner','admin','member')),
  unique (user_id, group_id)
);
create unique index one_owner_per_group on public.memberships (group_id) where role = 'owner';

-- ----------------------------------------------------------------------------
-- Permission helpers (SECURITY DEFINER → bypass RLS for the check, so policies
-- that ask "am I a member of this group?" don't recurse on `memberships`).
-- search_path pinned to '' to harden each SECURITY DEFINER function.
-- ----------------------------------------------------------------------------

create or replace function public.is_group_member(g uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = g and m.user_id = (select auth.uid())
  );
$$;

-- "Can manage" = owner OR co-admin (D26 — both hold full management authority).
create or replace function public.is_group_admin(g uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = g and m.user_id = (select auth.uid())
      and m.role in ('owner','admin')
  );
$$;

-- Owner-only powers: delete group + transfer ownership (D26).
create or replace function public.is_group_owner(g uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.groups gr
    where gr.id = g and gr.created_by = (select auth.uid())
  );
$$;

-- D27: the out-of-band recovery/moderation flag (set only in Supabase).
-- NOT a god-view — it gates recovery + moderation, never group content reads.
create or replace function public.is_super_admin() returns boolean
  language sql security definer stable set search_path = '' as $$
  select coalesce((select is_super_admin from public.profiles where id = (select auth.uid())), false);
$$;

-- ----------------------------------------------------------------------------
-- Guard triggers (the bits RLS can't express: old-vs-new column comparison)
-- ----------------------------------------------------------------------------

-- profiles: a client (role `authenticated`/`anon`) can never flip is_super_admin.
-- The dashboard / service_role / postgres run as a different role → allowed (D27).
-- MUST be SECURITY INVOKER (the default): the guard keys off `current_user`, and
-- under SECURITY DEFINER that would resolve to the function owner (postgres), not
-- the caller — the check would never fire and self-escalation would be open. The
-- function only compares OLD/NEW + reads current_user, so it needs no elevated
-- privilege.
create or replace function public.guard_profile_super_admin() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.is_super_admin is distinct from old.is_super_admin
     and current_user in ('authenticated', 'anon') then
    raise exception 'is_super_admin is set out-of-band in Supabase only (D27)';
  end if;
  return new;
end;
$$;

create trigger guard_profile_super_admin
  before update on public.profiles
  for each row execute function public.guard_profile_super_admin();

-- groups: created_by (the ownership pointer) changes only via the sanctioned
-- ownership RPCs (transfer_ownership / reassign_owner), which set a txn-local
-- flag. `→ null` is allowed so the FK ON DELETE SET NULL cascade still works.
create or replace function public.guard_group_owner_pointer() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by is not null
     and new.created_by is distinct from old.created_by
     and coalesce(current_setting('app.allow_owner_change', true), 'off') <> 'on' then
    raise exception 'group ownership changes only via the transfer/recovery path';
  end if;
  return new;
end;
$$;

create trigger guard_group_owner_pointer
  before update on public.groups
  for each row execute function public.guard_group_owner_pointer();

-- ----------------------------------------------------------------------------
-- Row-Level Security — ON for every table (migration doc §4)
-- ----------------------------------------------------------------------------

alter table public.profiles    enable row level security;
alter table public.groups      enable row level security;
alter table public.memberships enable row level security;

-- profiles: read self + anyone sharing a group; update/insert self.
-- (is_super_admin is protected by the guard trigger above, not a policy.)
create policy profiles_select_self_or_shared on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.memberships me
      join public.memberships them on them.group_id = me.group_id
      where me.user_id = (select auth.uid()) and them.user_id = public.profiles.id
    )
  );

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- groups: read if a member; admins update (created_by guarded by trigger);
-- owner-only delete. NO direct INSERT policy → creation goes through the
-- create_group() RPC (atomic group + owner membership; later migration).
create policy groups_select_member on public.groups
  for select to authenticated
  using (public.is_group_member(id));

create policy groups_update_admin on public.groups
  for update to authenticated
  using (public.is_group_admin(id))
  with check (public.is_group_admin(id));

create policy groups_delete_owner on public.groups
  for delete to authenticated
  using (public.is_group_owner(id));

-- memberships: read if a member; admins manage NON-owner rows only — the
-- `role <> 'owner'` guard means a co-admin can never demote/remove/seize the
-- owner (owner-safety lives here, not in a deferred trigger). A non-owner may
-- also remove their own row (leave). Owner changes go through the RPCs.
create policy memberships_select_member on public.memberships
  for select to authenticated
  using (public.is_group_member(group_id));

create policy memberships_insert_admin on public.memberships
  for insert to authenticated
  with check (public.is_group_admin(group_id) and role <> 'owner');

create policy memberships_update_admin on public.memberships
  for update to authenticated
  using (public.is_group_admin(group_id) and role <> 'owner')
  with check (public.is_group_admin(group_id) and role <> 'owner');

create policy memberships_delete_admin on public.memberships
  for delete to authenticated
  using (public.is_group_admin(group_id) and role <> 'owner');

create policy memberships_delete_self on public.memberships
  for delete to authenticated
  using (user_id = (select auth.uid()) and role <> 'owner');

-- ----------------------------------------------------------------------------
-- Auto-create a profile when an auth user signs up (standard Supabase pattern).
-- Name falls back to the email local-part if no metadata was supplied.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
