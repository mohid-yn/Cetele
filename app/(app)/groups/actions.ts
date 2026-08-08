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

/**
 * Appoint an organiser, by exact email (D56, migration 0026).
 *
 * A thin relay over `grant_super_admin`, which does the whole of the gating:
 * the caller must ALREADY be an organiser, the address must match an account
 * exactly, and the appointment is written to `audit_log`. Nothing is checked
 * here that the database does not also check — this action cannot be the place
 * the rule lives, because a Server Action is reachable by anyone who can guess
 * its name and the database is not.
 *
 * The RPC's exceptions are surfaced verbatim: "that person is already an
 * organiser" and "no account with that email address" are written to be read by
 * whoever typed the address, which is the only person who can act on either.
 */
export async function grantSuperAdmin(
  email: string,
): Promise<{ name: string | null; error: string | null }> {
  const trimmed = email.trim();
  if (!trimmed) return { name: null, error: "Enter an email address" };

  const supabase = await createClient();
  const { data, error } = await q(
    "rpc.grant_super_admin",
    supabase.rpc("grant_super_admin", { p_email: trimmed }),
  );
  await signOutIfStaleSession(error);
  if (error) return { name: null, error: error.message };

  revalidatePath("/groups");
  return { name: data?.[0]?.name ?? null, error: null };
}

/**
 * Stand an organiser down (D56, migration 0026).
 *
 * Standing YOURSELF down is allowed and is the ordinary hand-over; the last
 * organiser is refused, because an app locked out of its own administration can
 * only be recovered from the Supabase dashboard. Both rules are the RPC's, for
 * the reason above — and the last-organiser one in particular has to be, since
 * it needs a lock that no Server Action can hold.
 */
export async function revokeSuperAdmin(
  userId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.revoke_super_admin",
    supabase.rpc("revoke_super_admin", { p_user: userId }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  revalidatePath("/groups");
  return { error: null };
}
