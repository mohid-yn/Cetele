"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";

/**
 * Auto-detected browser timezone → profiles.timezone (D34). The DB trigger
 * validates the IANA name (garbage throws), so this stays a thin relay.
 *
 * Lives here, not under a group route, because the timezone is a property of
 * the PERSON, not of a circle — and it must be learnable on /groups, before the
 * member ever reaches a screen that renders a date (D44; see TimezoneSync).
 * Revalidating the layout busts every cached date-derived figure at once.
 */
export async function setTimezone(
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

  revalidatePath("/", "layout");
  return { error: null };
}

/** Create a group via the create_group RPC (atomic group + owner membership). */
export async function createGroup(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Group name is required" };

  const supabase = await createClient();
  const { error } = await q(
    "rpc.create_group",
    supabase.rpc("create_group", { p_name: trimmed }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  revalidatePath("/groups");
  return { error: null };
}
