/**
 * The per-group role (Drive-style ownership, D26 — supersedes D9's three-tier
 * model). There is no app-level admin: "app admin" IS "group owner".
 *
 * - `owner`  — the creator; full control + share/transfer/delete (one per group)
 * - `admin`  — a shared co-admin: manage members & tasks + re-share, but cannot
 *              delete the group or transfer ownership
 * - `member` — participates (logs counts); no management
 *
 * Lived in the mock's types.ts until the M9 cutover; it is a real domain type,
 * not a prototype artefact, so it now has a real home.
 */
export type MemberRole = "owner" | "admin" | "member";
