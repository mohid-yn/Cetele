-- ============================================================================
-- CET-2 · Migration 0004 — lock the group ownership pointer (owner-orphan fix)
-- ----------------------------------------------------------------------------
-- Review finding: `groups_update_admin` lets any co-admin UPDATE the group, and
-- the 0001 created_by guard only blocked a change to a *non-null* value. So a
-- co-admin could run `UPDATE groups SET created_by = NULL`, which:
--   * makes is_group_owner() false for everyone → the real owner permanently
--     loses delete + transfer powers,
--   * desyncs groups.created_by from the memberships 'owner' row, and
--   * is unrecoverable in-app until the D27 claim/reassign RPCs exist.
-- (Reproduced live before this migration; the ownership *seize* path was already
--  blocked — only the NULL path was open.)
--
-- No client role should EVER write created_by. It moves only via the SECURITY
-- DEFINER ownership RPCs (run as `postgres`) and the FK `ON DELETE SET NULL`
-- cascade (runs as the auth admin role) — neither is a client role, so both keep
-- working. Two independent layers:
--
--   (1) Column privilege (primary). A table-level UPDATE grant covers ALL
--       columns, so a column-level REVOKE alone is a no-op — the table grant must
--       be revoked and re-granted per writable column. Clients may write only
--       `name` (rename) and `invite_code` (re-share); never created_by/id/created_at.
--   (2) The owner-pointer guard (defense-in-depth) now fires on ANY created_by
--       change (incl. → NULL) from a client role.
-- ============================================================================

-- (1) Column-level lock.
revoke update on public.groups from authenticated, anon;
grant  update (name, invite_code) on public.groups to authenticated;

-- (2) Close the guard's NULL gap. Gated on current_user so the ownership RPCs
-- (run as postgres) and the FK cascade (run as the auth admin role) still pass.
create or replace function public.guard_group_owner_pointer() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.created_by is distinct from old.created_by
     and current_user in ('authenticated', 'anon')
     and coalesce(current_setting('app.allow_owner_change', true), 'off') <> 'on' then
    raise exception 'group ownership changes only via the transfer/recovery path';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_group_owner_pointer() from public, anon, authenticated;
