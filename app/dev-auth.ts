"use server";

import { createClient } from "@supabase/supabase-js";

/**
 * DEV-ONLY sign-in helper, so a developer lands in the app in one click.
 *
 * It used to send a real OTP and then poll the local Mailpit inbox for the
 * resulting message. That made an SMTP round-trip a hard dependency of simply
 * signing in locally, and it was flaky in exactly the way the e2e suite was:
 * when GoTrue couldn't hand the mail off, sign-in just failed. Now the link is
 * minted directly with the service role — `generateLink` returns the token
 * hash the email template would have embedded, without sending anything.
 *
 * Hard-gated to the LOCAL stack: it returns null against any remote (prod)
 * URL, so even if the NEXT_PUBLIC_AUTH_DEV button were somehow rendered in
 * production this does nothing. Never point it at a real project.
 */

function isLocalStack(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.includes("127.0.0.1") || url.includes("localhost");
}

/**
 * Mint a magic-link URL for `email`, creating the account if needed. Returns
 * the app's own `/auth/confirm` URL (the same one the email template builds),
 * or null if the stack isn't local or the admin call fails.
 */
export async function devMagicLink(
  email: string,
  origin: string,
): Promise<string | null> {
  if (!isLocalStack()) return null;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (
      createError &&
      !/already|exists|registered/i.test(createError.message)
    ) {
      return null;
    }

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (error || !data.properties?.hashed_token) return null;

    return `${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`;
  } catch {
    return null;
  }
}
