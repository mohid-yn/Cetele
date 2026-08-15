import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AUTH_NEXT_COOKIE, sanitizeNextPath } from "@/lib/auth-next";
import { redirectSameOrigin } from "@/lib/auth-redirect";
import { TZ_COOKIE, applyStashedTimeZone } from "@/lib/timezone";

/**
 * OAuth (Google) landing: PKCE code → session cookie → into the app. The
 * post-sign-in destination rides the AUTH_NEXT_COOKIE (see lib/auth-next.ts),
 * consumed here.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next =
    sanitizeNextPath(request.cookies.get(AUTH_NEXT_COOKIE)?.value) ?? "/today";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Write the browser's timezone onto the freshly-created profile BEFORE
      // the first authenticated render, so no screen ever computes a date from
      // the 'UTC' default guess (D44).
      await applyStashedTimeZone(
        supabase,
        data.user?.id,
        request.cookies.get(TZ_COOKIE)?.value,
      );
      // Relative, so the browser stays on the host that just received the
      // session cookie (lib/auth-redirect.ts — the 127.0.0.1/localhost loop).
      const res = redirectSameOrigin(next);
      res.cookies.delete(AUTH_NEXT_COOKIE);
      res.cookies.delete(TZ_COOKIE);
      return res;
    }
  }

  return redirectSameOrigin("/?auth-error=1");
}
