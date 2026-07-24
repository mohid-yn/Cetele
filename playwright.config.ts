import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * The suite mints its own sign-in links with the service role (see
 * e2e/helpers.ts), so the test process needs the same `.env.local` that Next
 * loads for the server. Parsed by hand rather than pulling in dotenv for four
 * lines — only `KEY=value`, which is all this file holds. Real environment
 * variables always win, so CI can inject the key without a file.
 */
for (const line of (() => {
  try {
    return readFileSync(".env.local", "utf8").split("\n");
  } catch {
    return [];
  }
})()) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!match) continue;
  const [, key, raw] = match;
  if (process.env[key] === undefined) {
    process.env[key] = raw.trim().replace(/^["']|["']$/g, "");
  }
}

/**
 * E2E against the production build + the LOCAL Supabase stack
 * (`supabase start` must be running).
 * Use localhost (not 127.0.0.1): Next normalizes redirect hosts to
 * localhost and cookies don't cross host names.
 *
 * Sign-in no longer goes through email at all — no SMTP, no Mailpit poll, no
 * auth rate limit. See the note in e2e/helpers.ts for why.
 */
export default defineConfig({
  testDir: "./e2e",
  // Specs still share DB fixtures and run their own steps in order.
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
