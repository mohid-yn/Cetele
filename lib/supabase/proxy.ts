import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes that need no session (everything else requires sign-in). */
const PUBLIC_PATHS = [
  "/",
  "/auth",
  "/designsystem",
  "/onboarding",
  "/privacy",
  "/terms",
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

  return supabaseResponse;
}
