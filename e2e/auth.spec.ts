import { test, expect } from "@playwright/test";

/**
 * The M1 core loop, end-to-end against the real local stack:
 * sign-in → session → gated routes → /groups from the DB → create a real group
 * (create_group RPC) → sign out re-gates.
 *
 * Sign-in is driven from the login page through the dev button, which mints the
 * credential server-side (service role) instead of sending mail. Everything
 * this test actually protects still runs for real: the /auth/confirm exchange,
 * the session cookie, the route gates, the RPC. What it no longer asserts is
 * that GoTrue hands a message to SMTP — that's Supabase's infrastructure, it
 * was the single flakiest step in the whole suite, and prod doesn't even use
 * this mailer (Resend, pending the domain).
 */
const EMAIL = `e2e-${Date.now()}@example.com`;

test.describe.configure({ mode: "serial" });

test("signed-out visitors are gated back to login", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Email me a magic link")).toBeVisible();
});

test("sign in → session → real /groups → create group → sign out", async ({
  page,
}) => {
  // 1-3. sign in from the login page → /auth/confirm exchanges the credential
  //      for a session cookie → landed inside the app
  await page.goto("/");
  await page.fill('input[type="email"]', EMAIL);
  await page.click('button:has-text("Dev sign-in")');
  await page.waitForURL(/\/today|\/groups|\/g\//);

  // 4. /groups renders the no-circle front door from the real DB
  await page.goto("/groups");
  await expect(page.getByText("Start your first circle")).toBeVisible();

  // 5. create a real group via the create_group RPC. Creating lands you in the
  //    new circle's Manage screen (CET-30); returning to /groups then shows it
  //    in the list (which also exercises that the list is fresh on return).
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", "E2E Circle");
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  await page.goto("/groups");
  // Scoped to <main> — the sidebar switcher also shows the active circle's
  // name on /groups, so a bare getByText is ambiguous (strict mode).
  await expect(page.getByRole("main").getByText("E2E Circle")).toBeVisible();
  await expect(page.getByText("1 member")).toBeVisible();

  // 6. sign out → gates snap shut
  await page.goto("/profile");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("/");
  await page.goto("/today");
  await expect(page).toHaveURL("/");
});
