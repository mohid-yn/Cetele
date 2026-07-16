"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { localDateISO } from "@/lib/local-date";
import { signOutIfStaleSession } from "@/lib/stale-session";
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
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  revalidateGroup(groupId);
  return { error: null };
}

/** D29: the in-person halaqah "log for the group" — mark one task done for
 *  every member TODAY. Fans out to `set_count` per member (the RPC re-checks
 *  admin authority + membership on each); at halaqah scale a handful of calls.
 *
 *  Two rules the fan-out must respect (both bit for real):
 *  * "Today" is each MEMBER's local today (profiles.timezone, D34) — computed
 *    here, not passed in. The admin's date was refused by set_count's window
 *    for any member whose day boundary sits behind the admin's ("date outside
 *    the 14-day correction window"), and the halaqah moment falls on the
 *    member's own calendar day anyway.
 *  * Never LOWER a count. set_count is an exact-set, so blanket-setting the
 *    target erased anything a member had counted past it — extra dhikr is
 *    explicitly welcome (0008's sanity-cap comment), and "mark done" must
 *    top people up, not trim them. At/above target → skip. */
export async function logForGroup(
  groupId: string,
  taskId: string,
  count: number,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  // Members + their timezones (profiles are group-readable under RLS); the
  // RPC re-verifies I'm an admin on every write.
  const { data: members, error: membersError } = await q(
    "logForGroup.members",
    supabase
      .from("memberships")
      .select("user_id, profiles(timezone)")
      .eq("group_id", groupId),
  );
  if (membersError) return { error: membersError.message };
  if (!members?.length) return { error: null };

  const dateOf = new Map(
    members.map((m) => [
      m.user_id,
      localDateISO(m.profiles?.timezone ?? "UTC"),
    ]),
  );

  // What each member already has on THEIR today, so full rings are skipped.
  const { data: existing, error: existingError } = await q(
    "logForGroup.existing counts",
    supabase
      .from("logs")
      .select("user_id, date, count")
      .eq("task_id", taskId)
      .in("date", [...new Set(dateOf.values())]),
  );
  if (existingError) return { error: existingError.message };
  const current = new Map(
    (existing ?? []).map((l) => [`${l.user_id}|${l.date}`, l.count]),
  );

  const due = members
    .map((m) => ({
      userId: m.user_id,
      date: dateOf.get(m.user_id) ?? localDateISO("UTC"),
    }))
    .filter((m) => (current.get(`${m.userId}|${m.date}`) ?? 0) < count);
  if (!due.length) return { error: null };

  const results = await q(
    `logForGroup.set_count ×${due.length}`,
    Promise.all(
      due.map((m) =>
        supabase.rpc("set_count", {
          p_user: m.userId,
          p_task: taskId,
          p_date: m.date,
          p_count: count,
        }),
      ),
    ),
  );
  const firstError = results.find((r) => r.error)?.error;
  await signOutIfStaleSession(firstError ?? null);
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
