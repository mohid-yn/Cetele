"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";

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

  revalidatePath("/admin/organisers");
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

  revalidatePath("/admin/organisers");
  return { error: null };
}
