"use server";

import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";

type Result = { error: string | null; done?: number };

/**
 * Record how far I have got with one roadmap item.
 *
 * An RPC, not an update: `authenticated` holds no write grant on
 * `roadmap_progress` at all (0025). The rule the RPC carries cannot live on the
 * client — it clamps to the ITEM's own target, which the caller would otherwise
 * have to be trusted to have looked up, and it refuses an item on a programme
 * the caller does not follow.
 *
 * It returns the STORED value, and this action hands that back rather than
 * revalidating: the +/- buttons fire faster than a round trip, and reconciling
 * from the write's own outcome is the only thing that survives that (D45). A
 * `revalidatePath` here would also be wrong on its own terms — it would refetch
 * the whole screen to learn one integer the RPC just told us.
 *
 * No proxy path, deliberately. Counting has one (D29 — the halaqah leader
 * tallying), because a leader can watch someone do their dhikr. Nobody can
 * observe how much of a book you have read, so this writes `auth.uid()`'s row
 * and nothing else.
 */
export async function setRoadmapProgress(
  itemId: string,
  done: number,
): Promise<Result> {
  const supabase = await createClient();

  const { data, error } = await q(
    `rpc.set_roadmap_progress (${done})`,
    supabase.rpc("set_roadmap_progress", {
      p_item: itemId,
      p_done: Math.trunc(done),
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  return { error: null, done: data ?? undefined };
}
