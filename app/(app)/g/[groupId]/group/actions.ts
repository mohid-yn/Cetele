"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { groupHref, GROUP_WRITE_PATHS } from "@/lib/group-href";

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
