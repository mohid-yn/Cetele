#!/usr/bin/env node
/**
 * Fail loudly, and by NAME, when the e2e environment is incomplete.
 *
 * This exists because of a specific failure we already paid for: e2e sign-in
 * changed to mint its own magic link with the service role, CI's env never
 * gained that key, and the result was ELEVEN specs failing across five files
 * at once. Nothing pointed at the missing variable — it read like a real
 * regression in auth, routing, groups and reminders simultaneously, and it
 * stayed red for days while local runs (which had the key in .env.local)
 * passed. A single named error beats a wall of red every time.
 *
 * Wired into `pnpm test:e2e`, so it guards every path that runs the suite —
 * local and CI alike — rather than only the one someone remembered to patch.
 */

import { readFileSync } from "node:fs";

/** Each key with the reason it is load-bearing, printed on failure. */
const REQUIRED = [
  [
    "NEXT_PUBLIC_SUPABASE_URL",
    "the browser client and e2e's own admin client both read it",
  ],
  [
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "the browser client; `/` prerenders one, so the BUILD throws without it",
  ],
  [
    "SUPABASE_SERVICE_ROLE_KEY",
    "e2e sign-in mints its magic link with it instead of sending email (e2e/helpers.ts)",
  ],
  [
    "NEXT_PUBLIC_AUTH_EMAIL",
    "renders the email sign-in field the login specs fill",
  ],
  [
    "NEXT_PUBLIC_AUTH_DEV",
    'renders "Dev sign-in", which auth.spec + manage.spec click to test the real ?next= redirect',
  ],
  [
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    'the profile screen branches on it — absent, it shows "reminders aren\'t configured" instead of the toggle or the iOS install steps',
  ],
];

// Same precedence the Playwright config uses: real environment wins, then
// .env.local. Parsed the same minimal way — only KEY=value.
const fromFile = new Map();
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) {
      fromFile.set(match[1], match[2].trim().replace(/^["']|["']$/g, ""));
    }
  }
} catch {
  // No .env.local is fine as long as the real environment carries the values.
}

const missing = REQUIRED.filter(([key]) => {
  const value = process.env[key] ?? fromFile.get(key);
  return value === undefined || value === "";
});

if (missing.length > 0) {
  const plural = missing.length === 1 ? "variable" : "variables";
  console.error(
    `\ne2e cannot run — ${missing.length} required ${plural} missing from the environment and .env.local:\n`,
  );
  for (const [key, why] of missing) console.error(`  ${key}\n      ${why}`);
  console.error(
    "\nLocal: copy the committed defaults with `cp .env.ci .env.local`, then add" +
      "\n       SUPABASE_SERVICE_ROLE_KEY from `supabase status -o env`." +
      "\nCI:    the stack-tests job builds .env.local from .env.ci — fix it there.\n",
  );
  process.exit(1);
}

// NEXT_PUBLIC_* values are inlined at build time, so a build made before the
// env was complete stays broken even once the variables appear. Say so here
// rather than letting it surface as a spec that cannot find a button.
console.log(
  `env ok — ${REQUIRED.length} required variables present (NEXT_PUBLIC_* must have been set before \`pnpm build\`)`,
);
