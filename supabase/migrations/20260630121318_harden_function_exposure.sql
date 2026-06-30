-- ============================================================================
-- CET-2 · Migration 0003 — harden SECURITY DEFINER exposure
-- ----------------------------------------------------------------------------
-- Supabase security advisor (lints 0028/0029) flagged that SECURITY DEFINER
-- functions in the exposed `public` schema are reachable as REST RPC endpoints.
-- Fixes:
--   * permission helpers → moved to a non-exposed `private` schema (still
--     callable inside RLS policies, NOT reachable via /rest/v1/rpc)
--   * groups owner-pointer guard → SECURITY INVOKER (needs no elevated privilege)
--   * trigger funcs (handle_new_user, guard_group_owner_pointer) → EXECUTE
--     revoked from anon/authenticated/public (triggers still fire regardless)
-- create_group / transfer_ownership intentionally stay public + authenticated
-- (the app calls them; each has an internal auth.uid() guard).
-- ============================================================================

create schema if not exists private;
grant usage on schema private to authenticated;

-- Helpers recreated in `private` (identical bodies; SECURITY DEFINER avoids RLS
-- recursion on memberships; search_path pinned).
create function private.is_group_member(g uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.memberships m
                 where m.group_id = g and m.user_id = (select auth.uid())); $$;
create function private.is_group_admin(g uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.memberships m
                 where m.group_id = g and m.user_id = (select auth.uid())
                   and m.role in ('owner','admin')); $$;
create function private.is_group_owner(g uuid) returns boolean
  language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.groups gr
                 where gr.id = g and gr.created_by = (select auth.uid())); $$;
create function private.is_super_admin() returns boolean
  language sql security definer stable set search_path = '' as $$
  select coalesce((select is_super_admin from public.profiles
                   where id = (select auth.uid())), false); $$;

revoke all on function private.is_group_member(uuid) from public;
revoke all on function private.is_group_admin(uuid) from public;
revoke all on function private.is_group_owner(uuid) from public;
revoke all on function private.is_super_admin() from public;
grant execute on function private.is_group_member(uuid) to authenticated;
grant execute on function private.is_group_admin(uuid) to authenticated;
grant execute on function private.is_group_owner(uuid) to authenticated;
grant execute on function private.is_super_admin() to authenticated;

-- Repoint policies to the private helpers.
drop policy groups_select_member on public.groups;
drop policy groups_update_admin on public.groups;
drop policy groups_delete_owner on public.groups;
drop policy memberships_select_member on public.memberships;
drop policy memberships_insert_admin on public.memberships;
drop policy memberships_update_admin on public.memberships;
drop policy memberships_delete_admin on public.memberships;

create policy groups_select_member on public.groups
  for select to authenticated using (private.is_group_member(id));
create policy groups_update_admin on public.groups
  for update to authenticated
  using (private.is_group_admin(id)) with check (private.is_group_admin(id));
create policy groups_delete_owner on public.groups
  for delete to authenticated using (private.is_group_owner(id));
create policy memberships_select_member on public.memberships
  for select to authenticated using (private.is_group_member(group_id));
create policy memberships_insert_admin on public.memberships
  for insert to authenticated
  with check (private.is_group_admin(group_id) and role <> 'owner');
create policy memberships_update_admin on public.memberships
  for update to authenticated
  using (private.is_group_admin(group_id) and role <> 'owner')
  with check (private.is_group_admin(group_id) and role <> 'owner');
create policy memberships_delete_admin on public.memberships
  for delete to authenticated
  using (private.is_group_admin(group_id) and role <> 'owner');

-- transfer_ownership now references the private helper.
create or replace function public.transfer_ownership(p_group uuid, p_new_owner uuid)
  returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if not private.is_group_owner(p_group) then
    raise exception 'only the current owner can transfer ownership';
  end if;
  if p_new_owner = v_uid then
    raise exception 'you already own this group';
  end if;
  if not exists (select 1 from public.memberships
                 where group_id = p_group and user_id = p_new_owner) then
    raise exception 'the new owner must already be a member of the group';
  end if;
  perform set_config('app.allow_owner_change', 'on', true);
  update public.memberships set role = 'admin'
    where group_id = p_group and user_id = v_uid and role = 'owner';
  update public.memberships set role = 'owner'
    where group_id = p_group and user_id = p_new_owner;
  update public.groups set created_by = p_new_owner where id = p_group;
  perform set_config('app.allow_owner_change', 'off', true);
end; $$;

-- Drop the now-unused public helpers.
drop function public.is_group_member(uuid);
drop function public.is_group_admin(uuid);
drop function public.is_group_owner(uuid);
drop function public.is_super_admin();

-- Owner-pointer guard needs no elevated privilege → SECURITY INVOKER.
create or replace function public.guard_group_owner_pointer() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.created_by is not null
     and new.created_by is distinct from old.created_by
     and coalesce(current_setting('app.allow_owner_change', true), 'off') <> 'on' then
    raise exception 'group ownership changes only via the transfer/recovery path';
  end if;
  return new;
end; $$;

-- Trigger funcs are not RPCs — revoke EXECUTE from every client role (PUBLIC +
-- the explicit anon/authenticated grants Supabase adds). Triggers still fire
-- them; they are simply no longer reachable via /rest/v1/rpc.
revoke all on function public.guard_group_owner_pointer() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
