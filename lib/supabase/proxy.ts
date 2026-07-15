import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes that need no session (everything else requires sign-in). */
const PUBLIC_PATHS = [
  "/",
  "/auth",
  "/designsystem",
  "/privacy",
  "/terms",
  // The push dispatcher (M8) is called by pg_cron, which has no session — it
  // authenticates with a Bearer secret instead (see the route). Without this
  // the gate 307s it to the login page and no reminder is ever sent.
  "/api/push",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)),
  );
}

/**
 * Refresh the auth token on every request (Server Components can't write
 * cookies) and gate protected routes. Runs from proxy.ts (Next 16 convention).
 */
export async function updateSession(request: NextRequest) {
  // OAuth safety net: if the provider round-trip lands the PKCE `code` on `/`
  // (Supabase falls back to the Site URL when the exact redirect URL isn't in
  // its allowlist), the client-only login page can't run the server exchange —
  // it picks the code up async via detectSessionInUrl, so the first render
  // misses the session and the user has to click again. Route it to the real
  // /auth/callback handler so the exchange happens server-first, every time.
  // (The code verifier lives in an @supabase/ssr cookie, readable there.)
  if (
    request.nextUrl.pathname === "/" &&
    request.nextUrl.searchParams.has("code")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value as string),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims() — a mistake
  // here makes "users randomly logged out" bugs very hard to debug.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && !isPublic(request.nextUrl.pathname)) {
    // Signed out on a protected route → back to the login page, carrying the
    // intended destination so sign-in can land there (e.g. /join/<code>).
    // /today is already the default post-sign-in landing — skip the noise.
    const url = request.nextUrl.clone();
    const dest = request.nextUrl.pathname;
    url.pathname = "/";
    url.search = "";
    if (dest !== "/" && dest !== "/today") url.searchParams.set("next", dest);
    return NextResponse.redirect(url);
  }

  // NB: the last-visited-group cookie (CET-25) is NOT written here any more.
  // It used to be — "a signed-in visit to /g/<id>/… refreshes the cookie" — but
  // Next 16 gives middleware no way to tell a real navigation from a PREFETCH
  // (prefetch requests arrive with no Next-Router-Prefetch / RSC / Sec-Purpose
  // header at all here), and both the switcher and the /groups cards prefetch
  // every circle's route. So merely rendering those silently rewrote the "active
  // group" to a circle the user never opened, and /profile + bare /today then
  // resolved to the wrong one. It's now set client-side, only when a group page
  // actually mounts (components/app/remember-active-group) — an effect a
  // prefetch never runs.

  return supabaseResponse;
}
