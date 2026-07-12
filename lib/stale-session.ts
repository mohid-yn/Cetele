import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * SQLSTATE raised by `private.require_caller_profile()` (migration 0012) when
 * the caller's JWT outlived its account — the token still verifies (Supabase
 * checks the signature, not the DB), but `profiles` cascade-deleted with
 * `auth.users`, so every write FK'd to `profiles` would fail.
 *
 * PostgREST maps a `PT4xx` SQLSTATE to HTTP 4xx, so this arrives as a 401.
 */
const STALE_SESSION = "PT401";

/**
 * Turn "your account no longer exists" into an actual sign-out. Without this the
 * user is stuck: the JWT keeps passing the gate (so the login page's self-heal
 * bounces them straight back in) while every write fails. Throws the Next.js
 * redirect, so callers can `await` it and carry on for any other error.
 */
export async function signOutIfStaleSession(
  error: {
    code?: string;
  } | null,
): Promise<void> {
  if (error?.code !== STALE_SESSION) return;

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/?auth-error=expired");
}
