import { NextResponse } from "next/server";

/**
 * A redirect that CANNOT change the host it is answering on.
 *
 * WHY THIS EXISTS: a sign-in loop, 2026-08-15. The auth routes built their
 * destination from `request.nextUrl.clone()`, which is an ABSOLUTE url — and
 * Next normalises its host to `localhost` in dev. So `/auth/confirm` reached on
 * `http://127.0.0.1:3000` set the session cookie for 127.0.0.1 (correctly: that
 * is the host that served the request) and then sent the browser to
 * `http://localhost:3000/today`, which is a DIFFERENT host with a different
 * cookie jar and therefore no session. The member landed back on the login page,
 * signed in again, and went round again — reported, exactly, as "login doesn't
 * stay persistent".
 *
 * A relative `Location` is resolved by the BROWSER against the origin it asked,
 * so the redirect always lands where the cookie was just written. It is not a
 * local-only fix wearing a workaround's clothes: it also means no auth route
 * ever reconstructs an absolute URL out of a host it was told about, which is
 * the shape open-redirect bugs come in.
 *
 * `path` must already be a sanitized app path (`lib/auth-next.ts` does that) —
 * this helper does not validate, it only refuses to add a host.
 */
export function redirectSameOrigin(path: string): NextResponse {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: path },
  });
}
