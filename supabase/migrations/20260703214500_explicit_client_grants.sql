-- ============================================================================
-- CET-2 · Migration 0006 — explicit client-role grants (cloud↔local drift fix)
-- ----------------------------------------------------------------------------
-- Clarity-check finding (2026-07-03, verified live on both environments): the
-- migrations wrote RLS meticulously but never wrote GRANTs — each environment
-- inherited its platform defaults, and those DIFFER:
--   * cloud project:  anon/authenticated hold near-full DML on public tables
--   * fresh local CLI stack: anon/authenticated hold NO DML at all
-- Consequences: local dev would fail every query at M1 while cloud works, and
-- "replay the files onto a fresh project" (the IaC guarantee) produces a dead
-- API. Fails closed, not open — but grants must be explicit to be reproducible.
--
-- Posture set here (least privilege, matching what the RLS policies expect):
--   * future tables start with ZERO client access (default-privileges revoke);
--     every new table's migration grants explicitly alongside its policies
--   * anon: nothing (no policy targets it; auth'd app only)
--   * authenticated: exactly the verbs each table's policies allow, column-
--     scoped where a column must never be client-writable
--   * service_role / postgres / supabase_admin: untouched (server-side paths)
--
-- Bonus hardening while column-scoping INSERTs: profiles.is_super_admin was
-- guarded only by a BEFORE UPDATE trigger — an INSERT could in principle set it
-- (only exploitable if the auto-profile row were ever missing, but why leave the
-- door). Column-scoped INSERT closes it at the privilege layer.
-- ============================================================================

-- Future tables created by migrations (which run as postgres) start locked.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

-- Wipe the drift-inherited table-level grants (incl. the odd TRUNCATE/TRIGGER
-- defaults). NOTE: a table-level REVOKE does not remove column-level grants —
-- groups' 0004 update(name, invite_code) survives; restated below anyway so
-- this migration reads as the complete client-grant picture.
revoke all on table public.profiles, public.groups, public.memberships
  from anon, authenticated;

-- profiles — policies: select (self or shared-group), insert self, update self.
-- No DELETE (account deletion flows through auth.users ON DELETE CASCADE).
-- is_super_admin + created_at are never client-writable (column-scoped; the
-- UPDATE guard trigger remains as defense-in-depth).
-- (M3/D34: the timezone column's migration must add it to both grants below.)
grant select                          on public.profiles to authenticated;
grant insert (id, name, avatar_url)   on public.profiles to authenticated;
grant update (name, avatar_url)       on public.profiles to authenticated;

-- groups — policies: select member, update admin, delete owner. INSERT stays
-- ungranted: creation is RPC-only (create_group, SECURITY DEFINER). UPDATE
-- stays column-locked to rename + re-share exactly as 0004 set it.
grant select, delete                  on public.groups to authenticated;
grant update (name, invite_code)      on public.groups to authenticated;

-- memberships — policies: select member; admin insert/update/delete of
-- non-owner rows; self delete (leave). INSERT column-scoped (id/defaults stay
-- server-side); UPDATE scoped to role — an admin changes what someone IS, never
-- rewrites who a membership row BELONGS to (user_id/group_id immutable to
-- clients). M2 (D34 invite-only) will further tighten the INSERT policy.
grant select, delete                  on public.memberships to authenticated;
grant insert (user_id, group_id, role) on public.memberships to authenticated;
grant update (role)                   on public.memberships to authenticated;
