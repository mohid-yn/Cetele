import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the production build + the LOCAL Supabase stack
 * (`supabase start` must be running — emails land in Mailpit :54324).
 * Use localhost (not 127.0.0.1): Next normalizes redirect hosts to
 * localhost and cookies don't cross host names.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // auth flows share the Mailpit inbox — keep ordered
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
