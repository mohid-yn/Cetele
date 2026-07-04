import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AUTH_NEXT_COOKIE, sanitizeNextPath } from "@/lib/auth-next";

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
    return res;
  };

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return success(NextResponse.redirect(redirectTo));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return success(NextResponse.redirect(redirectTo));
  }

  redirectTo.pathname = "/";
  redirectTo.search = "?auth-error=1";
  return NextResponse.redirect(redirectTo);
}
