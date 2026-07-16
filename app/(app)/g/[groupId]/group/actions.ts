"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import {
  groupHref,
  GROUP_WRITE_PATHS,
  ACTIVE_GROUP_COOKIE,
} from "@/lib/group-href";

/** Bust every group screen a count-write can change — concrete paths, so the
 *  client Router Cache drops its prefetched (pre-write) payloads too. */
function revalidateGroup(groupId: string) {
  for (const sub of GROUP_WRITE_PATHS) revalidatePath(groupHref(groupId, sub));
}

/**
 * M5 Server Actions for the group hub's admin-oversight writes (D29). Both
 * relay to the `set_count` RPC — all authority (admin-or-self, the sanity cap,
 * the 14-day window, and self-vs-proxy attribution via `logged_by`) lives in
 * the RPC (migration 0008), so these stay thin and never make a trust decision
 * client-side. A blocked write comes back as a Postgres error.
 */

/** D29: set the exact count for one member/task/day — admin proxy-log or the
 *  member correcting their own record (the editable fortnight grid). */
export async function setCount(
  groupId: string,
  userId: string,
  taskId: string,
  date: string,
  count: number,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await q(
    `rpc.set_count (=${count})`,
    supabase.rpc("set_count", {
      p_user: userId,
      p_task: taskId,
      p_date: date,
      p_count: count,
    }),
  );
  if (error) return { error: error.message };

  revalidateGroup(groupId);
  return { error: null };
}

/** D29: the in-person halaqah "log for the group" — mark one task done for
 *  every member on a day. Fans out to `set_count` per member (the RPC re-checks
 *  admin authority + membership on each); at halaqah scale a handful of calls. */
export async function logForGroup(
  groupId: string,
  taskId: string,
  date: string,
  count: number,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  // Readable under RLS (I'm a member of this group). RPC re-verifies I'm admin.
  const { data: members, error: membersError } = await q(
    "logForGroup.members",
    supabase.from("memberships").select("user_id").eq("group_id", groupId),
  );
  if (membersError) return { error: membersError.message };
  if (!members?.length) return { error: null };

  const results = await q(
    `logForGroup.set_count ×${members.length}`,
    Promise.all(
      members.map((m) =>
        supabase.rpc("set_count", {
          p_user: m.user_id,
          p_task: taskId,
          p_date: date,
          p_count: count,
        }),
      ),
    ),
  );
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) return { error: firstError.message };

  revalidateGroup(groupId);
  return { error: null };
}

/**
 * Leave a circle (CET-27 follow-up — `/privacy` has always promised this).
 *
 * Authority is the `memberships_delete_self` policy (0001): you may delete your
 * own row, and only if `role <> 'owner'`. So an owner leaving is refused by RLS
 * rather than by a check here — which is the invariant that keeps the 0012
 * last-member trigger a safety net rather than a routine path: the owner must
 * transfer or delete the circle first, so nobody can walk out of a group and
 * strand it. A blocked delete matches no row (RLS filters, it doesn't error),
 * so a zero-row result IS the refusal.
 *
 * Your logs stay (D41): every group-facing figure is derived from the current
 * member list, so leaving stops you counting without erasing dhikr that happened
 * — and rejoining brings your history back with you.
 */
export async function leaveGroup(
  groupId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) return { error: "You are signed out." };

  const { data, error } = await q(
    "leaveGroup.delete membership",
    supabase
      .from("memberships")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", me)
      .select("group_id"),
  );
  if (error) return { error: error.message };
  if (!data?.length) {
    return {
      error:
        "You own this circle — transfer ownership or delete it before leaving.",
    };
  }

  // If the circle you just left was your last-visited one, forget the hint —
  // otherwise the switcher/nav on group-independent screens (/profile) would
  // resolve the active group to one you no longer belong to. (deleteGroup clears
  // it unconditionally; here we only clear when it matches, so leaving circle A
  // doesn't wipe an active-group cookie pointing at circle B.)
  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_GROUP_COOKIE)?.value === groupId) {
    cookieStore.delete(ACTIVE_GROUP_COOKIE);
  }

  revalidatePath("/groups");
  redirect("/groups");
}
