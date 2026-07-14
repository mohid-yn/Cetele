import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AUTH_NEXT_COOKIE, sanitizeNextPath } from "@/lib/auth-next";
import { TZ_COOKIE, applyStashedTimeZone } from "@/lib/timezone";

/**
 * Magic-link landing: exchanges the emailed credential for a session cookie.
 * Supports both formats Supabase sends — `token_hash`+`type` (SSR email
 * template) and PKCE `?code=` (default template's redirect). The post-sign-in
 * destination rides the AUTH_NEXT_COOKIE (see lib/auth-next.ts), consumed
 * here.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next =
    sanitizeNextPath(request.cookies.get(AUTH_NEXT_COOKIE)?.value) ?? "/today";

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next;
  redirectTo.search = "";

  const supabase = await createClient();

  const success = (res: NextResponse) => {
    res.cookies.delete(AUTH_NEXT_COOKIE);
    res.cookies.delete(TZ_COOKIE);
    return res;
  };

  // Same as the OAuth callback: the browser's timezone lands on the profile
  // before the first authenticated render, so no date is ever a guess (D44).
  const withTimezone = async (userId: string | undefined) =>
    applyStashedTimeZone(
      supabase,
      userId,
      request.cookies.get(TZ_COOKIE)?.value,
    );

  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      await withTimezone(data.user?.id);
      return success(NextResponse.redirect(redirectTo));
    }
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await withTimezone(data.user?.id);
      return success(NextResponse.redirect(redirectTo));
    }
  }

  redirectTo.pathname = "/";
  redirectTo.search = "?auth-error=1";
  return NextResponse.redirect(redirectTo);
}
