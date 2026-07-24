import { type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Shared e2e sign-in.
 *
 * This used to be copy-pasted into all nine specs, and every copy drove the
 * real magic-link flow: fill the form → GoTrue sends an email → poll Mailpit
 * for it → open the link. That made an SMTP round-trip a hard dependency of
 * EVERY test, and it was the single biggest source of false failures — the
 * suite would fail at `signIn` on a different spec each run (routing, then
 * retention, then core-loop, then manage), which reads exactly like a
 * regression somewhere in the app and never was. It also burned the local
 * auth email rate limit, so repeated runs degraded on their own.
 *
 * Instead we mint the same credential directly with the service role:
 * `generateLink` returns the token hash the email template would have
 * embedded, WITHOUT sending anything. The URL below is byte-for-byte the one
 * the SSR template builds, so `/auth/confirm` still does the real work —
 * verifyOtp, the session cookie, and the timezone capture that D44 depends on.
 * The only thing no longer exercised is GoTrue handing a message to SMTP,
 * which is Supabase's infrastructure, not ours.
 *
 * Service-role and local-only, by construction: it reads the local stack's
 * URL + key from the environment (playwright.config.ts loads .env.local).
 */
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "e2e sign-in needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (from .env.local)",
    );
  }
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
    throw new Error(
      `refusing to mint sign-in links against a remote stack: ${url}`,
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Sign `email` in, creating the account if it doesn't exist yet. */
export async function signIn(page: Page, email: string) {
  const supabase = admin();

  // The specs use a fresh timestamped address per run, so the account usually
  // needs creating. Pre-confirming it keeps this to one round trip.
  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  // "already registered" is fine — several specs sign the same user back in.
  if (createError && !/already|exists|registered/i.test(createError.message)) {
    throw createError;
  }

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;

  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) throw new Error(`no token hash returned for ${email}`);

  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=magiclink`);
  // Landing anywhere inside the app means the session cookie stuck.
  await page.waitForURL(/\/today|\/groups|\/g\//);
}
