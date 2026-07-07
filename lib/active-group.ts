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
export const ACTIVE_GROUP_COOKIE = "cetele-active-group";

const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, member: 2 };

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
