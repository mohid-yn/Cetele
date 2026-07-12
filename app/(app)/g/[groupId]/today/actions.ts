"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { groupHref, GROUP_WRITE_PATHS } from "@/lib/group-href";

/**
 * The tap path (M3). All integrity rules live in the increment_count RPC
 * (delta bounds, sanity cap, 14-day window in the user's timezone, membership)
 * — this action just relays and revalidates. Returns the authoritative count
 * so the optimistic client can reconcile.
 */
export async function incrementCount(
  groupId: string,
  taskId: string,
  date: string,
  delta: number,
): Promise<{ count: number | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await q(
    `rpc.increment_count (+${delta})`,
    supabase.rpc("increment_count", {
      p_task: taskId,
      p_date: date,
      p_delta: delta,
    }),
  );
  if (error) return { count: null, error: error.message };

  // Concrete paths, not the route template — see GROUP_WRITE_PATHS.
  for (const sub of GROUP_WRITE_PATHS) revalidatePath(groupHref(groupId, sub));
  return { count: data, error: null };
}

/**
 * Auto-detected browser timezone → profiles.timezone (D34). The DB trigger
 * validates the IANA name (garbage throws), so this stays a thin relay.
 */
export async function setTimezone(
  groupId: string,
  timezone: string,
): Promise<{ error: string | null }> {
  if (!timezone || timezone.length > 64) return { error: "Invalid timezone" };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;
  if (!me) return { error: "Not signed in" };

  const { error } = await supabase
    .from("profiles")
    .update({ timezone })
    .eq("id", me);
  if (error) return { error: error.message };

  revalidatePath(groupHref(groupId, "/today"));
  return { error: null };
}
