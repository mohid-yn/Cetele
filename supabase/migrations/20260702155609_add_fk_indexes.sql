-- ============================================================================
-- CET-2 · Migration 0005 — index the unindexed foreign keys (M0 hygiene)
-- ----------------------------------------------------------------------------
-- Postgres auto-indexes the *referenced* (PK) side of a FK, never the
-- *referencing* column. Two FKs were left unindexed:
--   * memberships.group_id — group-scoped reads ("members of this group") and
--     the group-delete cascade otherwise seq-scan memberships.
--   * groups.created_by     — the profile-delete `ON DELETE SET NULL` cascade
--     otherwise seq-scans groups.
-- Trivial at today's row counts; a latency cliff on hot paths as data grows.
-- Flagged by Supabase's unindexed_foreign_keys performance lint.
-- ============================================================================

create index if not exists memberships_group_id_idx on public.memberships (group_id);
create index if not exists groups_created_by_idx     on public.groups (created_by);
