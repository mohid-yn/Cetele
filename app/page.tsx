"use client";

import * as React from "react";
import { Button, Input } from "@/components/ui";
import { GoogleIcon, MailIcon } from "@/components/demo/icons";
import { createClient } from "@/lib/supabase/client";
import {
  AUTH_NEXT_COOKIE,
  AUTH_NEXT_MAX_AGE,
  sanitizeNextPath,
} from "@/lib/auth-next";

/**
 * Google sign-in is hidden until the provider is actually configured
 * (Supabase dashboard creds + local config.toml). Flipping it on without
 * creds sends users to a raw GoTrue "provider is not enabled" JSON error.
 * Enable by setting NEXT_PUBLIC_AUTH_GOOGLE=1 (env, per environment).
 */
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE === "1";

/**
 * Email magic-link sign-in. Hidden by default because it depends on a working
 * mail sender: Supabase's built-in sender is rate-limited (~2/hr) and can't be
 * used for real testers, and custom SMTP (Resend) needs a verified domain we
 * don't own yet. Enable by setting NEXT_PUBLIC_AUTH_EMAIL=1 — e.g. in
 * .env.local for local dev (magic links land in Mailpit), or in Vercel once a
 * domain + Resend are configured. Off in prod for now → Google is the only
 * public sign-in.
 */
const EMAIL_ENABLED = process.env.NEXT_PUBLIC_AUTH_EMAIL === "1";

/**
 * Post-sign-in destination (set by the proxy gate as `/?next=` — e.g. an
 * invite link /join/<code>), stashed in the AUTH_NEXT_COOKIE for the auth
 * routes to consume. A cookie, not a ?next= on the redirect URL: Supabase's
 * redirect allowlists are exact-match and would drop it (lib/auth-next.ts).
 * Read at call time so the client page needs no Suspense/useSearchParams.
 */
function stashNextPath() {
  const next = sanitizeNextPath(
    new URLSearchParams(location.search).get("next"),
  );
  if (next) {
    document.cookie = `${AUTH_NEXT_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${AUTH_NEXT_MAX_AGE}; samesite=lax`;
  }
}

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function signInWithGoogle() {
    setError(null);
    stashNextPath();
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    stashNextPath();
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/confirm` },
    });
    setPending(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[28rem] flex-col justify-center gap-8 px-6 py-10">
      {/* Wordmark */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          aria-hidden
          className="size-16 rounded-full border-8 border-brand"
          style={{ borderTopColor: "transparent" }}
        />
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-brand">
            Cetele
          </h1>
          <p className="mt-1 max-w-xs text-sm text-balance text-muted-foreground">
            Track your daily dhikr together. A shared tally that makes
            remembrance a habit.
          </p>
        </div>
      </div>

      {/* Auth */}
      <div className="flex flex-col gap-3">
        {GOOGLE_ENABLED && (
          <Button
            variant="outline"
            className="w-full"
            leadingIcon={<GoogleIcon />}
            onClick={signInWithGoogle}
          >
            Continue with Google
          </Button>
        )}

        {GOOGLE_ENABLED && EMAIL_ENABLED && (
          <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        )}

        {EMAIL_ENABLED &&
          (sent ? (
            <div className="rounded-2xl border border-border bg-card p-4 text-center">
              <MailIcon className="mx-auto size-7 text-primary" />
              <p className="mt-2 text-sm font-medium text-foreground">
                Check your email
              </p>
              <p className="text-xs text-muted-foreground">
                We sent a magic link to {email || "you"}. Open it on this device
                to sign in.
              </p>
            </div>
          ) : (
            <form className="flex flex-col gap-2" onSubmit={sendMagicLink}>
              <Input
                type="email"
                required
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={pending}
                leadingIcon={<MailIcon />}
              >
                {pending ? "Sending…" : "Email me a magic link"}
              </Button>
            </form>
          ))}

        {!GOOGLE_ENABLED && !EMAIL_ENABLED && (
          <p className="text-center text-sm text-muted-foreground">
            Sign-in is being set up. Please check back shortly.
          </p>
        )}

        {error ? (
          <p role="alert" className="text-center text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
