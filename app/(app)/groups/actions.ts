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

/**
 * Create a group via the create_group RPC (atomic group + owner membership).
 * Returns the new group's id so the client can navigate INTO it (CET-30): a
 * route change is a guaranteed server fetch, where refetching the /groups list
 * in place raced the dialog unmount and the new circle was intermittently
 * missing. `revalidatePath` stays too, so a later return to the list is fresh.
 */
export async function createGroup(
  name: string,
): Promise<{ groupId: string | null; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { groupId: null, error: "Group name is required" };

  const supabase = await createClient();
  const { data, error } = await q(
    "rpc.create_group",
    supabase.rpc("create_group", { p_name: trimmed }),
  );
  await signOutIfStaleSession(error);
  if (error) return { groupId: null, error: error.message };

  revalidatePath("/groups");
  return { groupId: data?.id ?? null, error: null };
}
