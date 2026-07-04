/**
 * Post-sign-in destination handoff (e.g. an invite link /join/<code>).
 *
 * The proxy gate bounces a signed-out visitor to `/?next=<path>`; the login
 * page stashes that path in this SHORT-LIVED COOKIE before starting the auth
 * flow, and the /auth/confirm + /auth/callback routes consume it after the
 * session lands. A cookie (not a ?next= on the emailRedirectTo/redirectTo)
 * because Supabase's redirect-URL allowlists — local config.toml AND the
 * cloud dashboard — are exact-match: a query-string variant falls back to the
 * Site URL and silently drops the destination.
 *
 * Same-device only by construction — exactly the PKCE constraint the auth
 * flow already has (the magic link must be opened where it was requested).
 */
export const AUTH_NEXT_COOKIE = "cetele-auth-next";
export const AUTH_NEXT_MAX_AGE = 600; // seconds — one sign-in attempt

/**
 * Only same-origin absolute paths may be redirect targets. Decodes first —
 * the cookie value is written URL-encoded (a second decode of a plain path
 * is a no-op; a malformed forged value returns null instead of throwing).
 */
export function sanitizeNextPath(next: string | null | undefined) {
  if (!next) return null;
  let value = next;
  try {
    value = decodeURIComponent(next);
  } catch {
    return null;
  }
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}
