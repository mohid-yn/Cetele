-- ============================================================================
-- CET-2 · Migration 0001 — Foundation: identity, groups, memberships
-- ----------------------------------------------------------------------------
-- The dependency root of the whole backend:
--   * SECURITY DEFINER permission helpers (so RLS policies never recurse on
--     `memberships` — the standard Supabase pattern, migration doc §4)
--   * profiles (1:1 with auth.users) · groups (owner = created_by, D26)
--   * memberships (owner | admin | member; exactly one owner per group)
--   * RLS ON for every table from day one (never "secure it later")
--   * auto-create a profile row when an auth user signs up
-- Model: D26/D27 Drive-style ownership. Generic D17 vocabulary.
-- ============================================================================

-- gen_random_uuid() is built into Postgres 13+ on Supabase; no extension needed.

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- profiles: a row per auth user. NO app-admin flag (D26 removed the tier).
-- One out-of-band recovery/moderation flag, set ONLY in Supabase (D27) — it is
-- never self-writable (enforced by the UPDATE policy below).
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
  created_by  uuid references public.profiles on delete set null, -- D26: the OWNER (authoritative; follows transfer/succession)
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
-- search_path is pinned to '' to harden each SECURITY DEFINER function.
-- ----------------------------------------------------------------------------

create or replace function public.is_group_member(g uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = g and m.user_id = auth.uid()
  );
$$;

-- "Can manage" = owner OR co-admin (D26 — both hold full management authority).
create or replace function public.is_group_admin(g uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = g and m.user_id = auth.uid()
      and m.role in ('owner','admin')
  );
$$;

-- Owner-only powers: delete group + transfer ownership (D26).
create or replace function public.is_group_owner(g uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.groups gr
    where gr.id = g and gr.created_by = auth.uid()
  );
$$;

-- D27: the out-of-band recovery/moderation flag (set only in Supabase).
-- NOT a god-view — it gates recovery + moderation, never group content reads.
create or replace function public.is_super_admin() returns boolean
  language sql security definer stable set search_path = '' as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false);
$$;

-- ----------------------------------------------------------------------------
-- Row-Level Security — ON for every table (migration doc §4)
-- ----------------------------------------------------------------------------

alter table public.profiles    enable row level security;
alter table public.groups      enable row level security;
alter table public.memberships enable row level security;

-- profiles: read self + anyone sharing a group; update self only; the
-- is_super_admin column is NOT self-writable (set in Supabase directly).
create policy profiles_select_self_or_shared on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships me
      join public.memberships them on them.group_id = me.group_id
      where me.user_id = auth.uid() and them.user_id = public.profiles.id
    )
  );

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- Block self-escalation of is_super_admin: an update must keep the flag equal to
-- its current stored value (a normal user can only ever leave it false → false).
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_super_admin = (select p.is_super_admin from public.profiles p where p.id = auth.uid())
  );

-- groups: read if a member; anyone authenticated may create (as owner); admins
-- update; owner-only delete; super-admin may reassign created_by for recovery (D27).
create policy groups_select_member on public.groups
  for select to authenticated
  using (public.is_group_member(id));

create policy groups_insert_authenticated on public.groups
  for insert to authenticated
  with check (created_by = auth.uid());

create policy groups_update_admin_or_superadmin on public.groups
  for update to authenticated
  using (public.is_group_admin(id) or public.is_super_admin())
  with check (public.is_group_admin(id) or public.is_super_admin());

create policy groups_delete_owner on public.groups
  for delete to authenticated
  using (public.is_group_owner(id));

-- memberships: read if a member of the same group; admins manage members.
-- (Last-admin / one-owner / dormant-succession guards are enforced additionally
-- in Server Actions + a trigger in a later migration — migration doc §4 note.)
create policy memberships_select_member on public.memberships
  for select to authenticated
  using (public.is_group_member(group_id));

create policy memberships_insert_admin on public.memberships
  for insert to authenticated
  with check (public.is_group_admin(group_id));

create policy memberships_update_admin on public.memberships
  for update to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

create policy memberships_delete_admin on public.memberships
  for delete to authenticated
  using (public.is_group_admin(group_id));

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
