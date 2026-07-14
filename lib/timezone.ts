/**
 * Learning the member's timezone at SIGN-IN (D44).
 *
 * profiles.timezone is the member's day boundary (D34) — every date the server
 * renders is computed from it. A fresh profile starts at the 'UTC' default, so
 * for the window between "signed in" and "browser zone written", every date is
 * a guess. That window used to be real, and it was harmful:
 *
 *   * /today rendered with UTC, and CET-25's prefetch immediately cached the
 *     `/count/[taskId]` payload with the UTC date baked in;
 *   * the real zone landed a moment later, but `revalidatePath` cannot reach a
 *     payload already in the CLIENT Router Cache;
 *   * so the first taps posted the stale date. For anyone whose local date
 *     differs from UTC's at signup (Sydney between midnight and 10am, say),
 *     their first counts were silently written to YESTERDAY.
 *
 * Fixing it by correcting-then-refreshing was worse: a router.refresh() landing
 * while someone is typing in the "New group" dialog resets it under them.
 *
 * So the zone is captured BEFORE the redirect, in a cookie the browser can set
 * (it's the only party that knows the zone), and applied on the way back
 * through the auth callback — before the first authenticated render exists.
 * Same shape as AUTH_NEXT_COOKIE.
 */

// Type-only imports: erased at compile time, so this module stays safe to pull
// into the client bundle (the login page imports stashTimeZoneCookie).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export const TZ_COOKIE = "cetele-tz";

/** Long enough to survive an OAuth round-trip / a magic-link click. */
export const TZ_COOKIE_MAX_AGE = 60 * 30; // 30 minutes

/**
 * Is this a real IANA zone? The DB has a guard trigger that throws on garbage,
 * and this cookie is attacker-controlled, so it is validated before it is used.
 */
export function isValidTimeZone(tz: string | undefined | null): tz is string {
  if (!tz || tz.length > 64) return false;
  try {
    // Throws RangeError on an unknown zone.
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Browser-side: stash the detected zone for the auth callback to pick up. */
export function stashTimeZoneCookie(): void {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!isValidTimeZone(tz)) return;
  document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=${TZ_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Server-side, in the auth routes: write the stashed zone onto the profile that
 * the signup trigger just created, so the member's very first render already
 * knows their day. Best-effort — a failure here must never block a sign-in that
 * otherwise succeeded (they'd simply keep the 'UTC' default, and the shell's
 * TimezoneSync fallback would correct it on the next navigation).
 */
export async function applyStashedTimeZone(
  supabase: SupabaseClient<Database>,
  userId: string | undefined,
  cookieValue: string | undefined,
): Promise<void> {
  if (!userId) return;
  const tz = cookieValue ? decodeURIComponent(cookieValue) : undefined;
  if (!isValidTimeZone(tz)) return;
  try {
    await supabase.from("profiles").update({ timezone: tz }).eq("id", userId);
  } catch {
    // ignore — see above
  }
}
