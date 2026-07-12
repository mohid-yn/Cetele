import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";

/**
 * The active group's "real home" (F5): a long-lived cookie, written by Server
 * Actions (open-manage / join), read by server screens. Always validated
 * against the user's actual memberships — a stale or forged cookie falls back
 * to the best real membership (owner > co-admin > member), or null when the
 * user has no groups.
 */
// Imported from the pure module (client-safe) but re-exported so existing
// server callers can keep importing it from here.
import { ACTIVE_GROUP_COOKIE } from "@/lib/group-href";
export { ACTIVE_GROUP_COOKIE };

const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, member: 2 };

/**
 * Resolve a group from a `/g/[groupId]` route param (CET-25). Validates that
 * the caller is really a member under RLS — a group you can't see returns null
 * (callers redirect to /groups). Unlike resolveActiveGroup this reads no
 * cookie: the URL is the source of truth. The proxy records the last-visited
 * group cookie from the path so bare `/today` can redirect back here.
 */
export async function resolveGroup(groupId: string): Promise<{
  groupId: string;
  role: "owner" | "admin" | "member";
} | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;
  if (!me) return null;

  const { data: row } = await q(
    "resolveGroup.membership",
    supabase
      .from("memberships")
      .select("role")
      .eq("user_id", me)
      .eq("group_id", groupId)
      .maybeSingle(),
  );
  if (!row) return null;

  return { groupId, role: row.role as "owner" | "admin" | "member" };
}

export async function resolveActiveGroup(): Promise<{
  groupId: string;
  role: "owner" | "admin" | "member";
} | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;
  if (!me) return null;

  const { data: rows } = await q(
    "activeGroup.memberships",
    supabase.from("memberships").select("group_id, role").eq("user_id", me),
  );
  if (!rows?.length) return null;

  const preferred = (await cookies()).get(ACTIVE_GROUP_COOKIE)?.value;
  const match = preferred
    ? rows.find((r) => r.group_id === preferred)
    : undefined;
  const best =
    match ??
    [...rows].sort(
      (a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9),
    )[0];

  return {
    groupId: best.group_id,
    role: best.role as "owner" | "admin" | "member",
  };
}
