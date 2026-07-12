-- ============================================================================
-- CET-27 · Migration 0012 — account-deletion integrity
-- ----------------------------------------------------------------------------
-- Found in prod: the owner created a group with a second Google account, then
-- deleted that account from the Supabase console. Two defects fell out.
--
-- (1) GHOST GROUPS. The delete chain is
--       auth.users → profiles (CASCADE) → memberships (CASCADE)
--     but groups.created_by is ON DELETE SET NULL, so the group SURVIVES with
--     no owner AND no members. RLS scopes groups to their members and D26
--     deliberately has no operator god view, so such a group is unreachable by
--     everyone, forever — invisible, unjoinable, undeletable junk (with its
--     tasks/logs behind it).
--
--     SET NULL is still right while members REMAIN — that is exactly D27's
--     succession case (an ownerless circle a co-admin can claim). It is only
--     wrong at ZERO members. Fix: an AFTER DELETE trigger on memberships that
--     drops a group once its last membership is gone.
--
--     The in-app flow can't reach zero members (owner-safety RLS blocks
--     removing an owner, so an owner must transfer or delete the group before
--     leaving) — this is the safety net for account deletion, which is the one
--     path that removes an owner's membership out from under a live group.
--
-- (2) STALE SESSION → RAW FK ERROR. Supabase access tokens are signature-
--     verified, not checked against the DB, so for up to an hour after the
--     account was deleted the browser still presented a valid JWT. create_group
--     only guarded `auth.uid() is null` — never that a profiles row EXISTS — so
--     it inserted created_by = <deleted uuid> and Postgres answered with
--     `violates foreign key constraint "groups_created_by_fkey"`, which the
--     Server Action passed to the UI verbatim. accept_invite has the same hole
--     (memberships.user_id → profiles). Both now go through
--     private.require_caller_profile(), which raises SQLSTATE PT401 →
--     PostgREST maps PT4xx to HTTP 4xx, so the app gets a 401 it can treat as
--     "signed out" instead of a constraint name.
--
--     Not console-only: any real "delete my account" flow reproduces both.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (2) The caller must still have a profile — i.e. the account behind this JWT
--     still exists. Called only from SECURITY DEFINER RPCs (which run as
--     postgres), so it needs no grant to client roles and stays off the
--     /rest/v1/rpc surface (0003 hardening).
-- ----------------------------------------------------------------------------

create or replace function private.require_caller_profile() returns uuid
  language plpgsql security definer stable set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'you are signed out' using errcode = 'PT401';
  end if;
  -- The JWT outlives the account: profiles cascade-deletes with auth.users, so
  -- a missing row means this token belongs to a deleted user.
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'this account no longer exists — sign in again'
      using errcode = 'PT401';
  end if;
  return v_uid;
end;
$$;

revoke all on function private.require_caller_profile() from public, anon, authenticated;

-- create_group: the RPC the deleted-account session actually hit.
create or replace function public.create_group(p_name text)
  returns public.groups
  language plpgsql security definer set search_path = '' as $$
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

  return g;
end;
$$;

-- accept_invite: same hole via memberships.user_id → profiles.
create or replace function public.accept_invite(p_code text)
  returns public.groups
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_caller_profile();
  v_email text;
  inv     public.invites;
  g       public.groups;
begin
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

-- ----------------------------------------------------------------------------
-- (1) A group with no members is unreachable → delete it with its last member.
-- ----------------------------------------------------------------------------

create or replace function private.delete_group_when_last_member_leaves()
  returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  -- Members remain → the group lives on. An ownerless-but-populated group is
  -- D27's succession case (a co-admin claims it), not junk.
  if exists (
    select 1 from public.memberships where group_id = old.group_id
  ) then
    return null;
  end if;

  -- The group itself is already gone — its own ON DELETE CASCADE is what
  -- removed this membership (someone deleted the group in-app). Deleting it
  -- again would re-enter this trigger; the AFTER-trigger snapshot already
  -- reflects the parent delete, so this check is the recursion stop.
  if not exists (select 1 from public.groups where id = old.group_id) then
    return null;
  end if;

  delete from public.groups where id = old.group_id;
  return null;
end;
$$;

revoke all on function private.delete_group_when_last_member_leaves()
  from public, anon, authenticated;

create trigger delete_group_when_last_member_leaves
  after delete on public.memberships
  for each row execute function private.delete_group_when_last_member_leaves();

-- One-time cleanup of the ghosts already stranded in prod (the `mfc` row the
-- owner's account deletion left behind). A no-op on a fresh stack — migrations
-- run before seed.sql, so there are no groups yet.
delete from public.groups g
where not exists (
  select 1 from public.memberships m where m.group_id = g.id
);
