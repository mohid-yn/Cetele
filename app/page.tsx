"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { AppIconLogo } from "@/components/ui/logo";
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

/** Read `?next=` (set by the proxy gate for e.g. an invite link). */
function readNextPath() {
  return sanitizeNextPath(new URLSearchParams(location.search).get("next"));
}

/**
 * Post-sign-in destination, stashed in the AUTH_NEXT_COOKIE for the auth routes
 * to consume. A cookie, not a ?next= on the redirect URL: Supabase's redirect
 * allowlists are exact-match and would drop it (lib/auth-next.ts).
 */
function stashNextPath() {
  const next = readNextPath();
  if (next) {
    document.cookie = `${AUTH_NEXT_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${AUTH_NEXT_MAX_AGE}; samesite=lax`;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Self-heal: if a session already exists (e.g. we landed back on `/` after a
  // successful OAuth round-trip, or the gate bounced us here on a transient
  // miss), go straight into the app instead of showing the login screen.
  React.useEffect(() => {
    let cancelled = false;
    supabase.auth.getClaims().then(({ data }) => {
      if (cancelled) return;
      if (data?.claims) {
        router.replace(readNextPath() ?? "/today");
        return;
      }
      // Not signed in: surface a failed OAuth exchange (callback →
      // /?auth-error=1) instead of a silent bounce back to login.
      if (new URLSearchParams(location.search).get("auth-error")) {
        setError("Sign-in didn't complete. Please try again.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  async function signInWithGoogle() {
    setError(null);
    stashNextPath();
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/confirm` },
    });
    setPending(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* Left — brand imagery (desktop only) */}
      <div className="relative hidden bg-primary-700 lg:block">
        <Image
          src="/login-hero.png"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
      </div>

      {/* Right — sign-in */}
      <div className="grid min-h-dvh place-items-center bg-background px-6 py-10">
        <div className="w-full max-w-[24rem]">
          {/* Brand */}
          <div className="flex flex-col items-center gap-4 text-center">
            <AppIconLogo className="size-20 rounded-[1.25rem] shadow-lg" />
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-primary">
                Cetele
              </h1>
              <p className="mt-2 text-sm text-balance text-muted-foreground">
                Track your daily dhikr together — a shared tally that makes
                remembrance a habit.
              </p>
            </div>
          </div>

          {/* Sign-in card */}
          <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-md">
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
                <div className="rounded-xl border border-border bg-muted p-4 text-center">
                  <MailIcon className="mx-auto size-7 text-primary" />
                  <p className="mt-2 text-sm font-medium text-foreground">
                    Check your email
                  </p>
                  <p className="text-xs text-muted-foreground">
                    We sent a magic link to {email || "you"}. Open it on this
                    device to sign in.
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

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Private by default. Your circle, your data.
          </p>
          <p className="mt-1.5 text-center text-xs text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <span aria-hidden> · </span>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
