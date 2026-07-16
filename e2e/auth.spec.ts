import { test, expect } from "@playwright/test";

/**
 * The M1 core loop, end-to-end against the real local stack:
 * magic link (via Mailpit) → session → gated routes → /groups from the DB →
 * create a real group (create_group RPC) → sign out re-gates.
 */
const MAILPIT = "http://127.0.0.1:54324";
const EMAIL = `e2e-${Date.now()}@example.com`;

test.describe.configure({ mode: "serial" });

test("signed-out visitors are gated back to login", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Email me a magic link")).toBeVisible();
});

test("magic link → session → real /groups → create group → sign out", async ({
  page,
}) => {
  // 1. request the magic link
  await page.goto("/");
  await page.fill('input[type="email"]', EMAIL);
  await page.click('button:has-text("Email me a magic link")');
  await expect(page.getByText("Check your email")).toBeVisible();

  // 2. fish it out of Mailpit (poll — delivery is near-instant but async)
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const list = await (
          await fetch(`${MAILPIT}/api/v1/search?query=to:${EMAIL}&limit=1`)
        ).json();
        const id = list.messages?.[0]?.ID;
        if (!id) return false;
        const msg = await (
          await fetch(`${MAILPIT}/api/v1/message/${id}`)
        ).json();
        link = msg.Text.match(/https?:\/\/[^\s"')\]]+/)?.[0];
        return Boolean(link);
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  // 3. open it in the same browser (PKCE) → signed in on /today
  await page.goto(link!);
  await page.waitForURL(/\/groups|\/g\//);

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
