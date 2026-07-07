"use server";

/**
 * DEV-ONLY sign-in helper. After the login page sends a magic-link OTP, this
 * fetches the resulting link straight from the local Mailpit inbox (the same
 * trick the e2e suite uses) so a developer lands in the app without opening the
 * mailbox by hand.
 *
 * Hard-gated to the LOCAL stack: it only ever talks to `127.0.0.1` Supabase +
 * Mailpit, and returns null against any remote (prod) URL — so even if the
 * NEXT_PUBLIC_AUTH_DEV button were somehow rendered in production, this does
 * nothing. Never wire a real mail sender through here.
 */

const MAILPIT = "http://127.0.0.1:54324";

function isLocalStack(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.includes("127.0.0.1") || url.includes("localhost");
}

/**
 * Poll Mailpit for the newest message to `email` sent at/after `since`, and
 * return the first URL in its body (the magic link). Returns null if the stack
 * isn't local or nothing arrives within the window.
 */
export async function devMagicLink(
  email: string,
  since: number,
): Promise<string | null> {
  if (!isLocalStack()) return null;

  for (let i = 0; i < 20; i++) {
    try {
      const list = await (
        await fetch(
          `${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}&limit=1`,
          { cache: "no-store" },
        )
      ).json();
      const msg = list.messages?.[0];
      // Only accept a message from THIS request, not a stale earlier link.
      if (msg?.ID && Date.parse(msg.Created) >= since - 1000) {
        const full = await (
          await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`, {
            cache: "no-store",
          })
        ).json();
        const link = full.Text?.match(/https?:\/\/[^\s"')\]]+/)?.[0];
        if (link) return link;
      }
    } catch {
      // stack not up yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}
