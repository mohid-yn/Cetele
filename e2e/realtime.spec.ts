import { test, expect, type Page } from "@playwright/test";

/**
 * M4 (CET-7) — the live collective counter, end-to-end against the real local
 * stack. Two users in ONE group, in separate browser contexts: user A sits on
 * /today while user B taps a task to completion in their own session. A never
 * navigates or reloads by hand — the counter climbs LIVE, driven by the
 * postgres_changes subscription (migration 0009) → debounced router.refresh.
 */
const MAILPIT = "http://127.0.0.1:54324";
const STAMP = Date.now();
const A = `e2e-rt-a-${STAMP}@example.com`;
const B = `e2e-rt-b-${STAMP}@example.com`;

/** Magic-link sign-in via Mailpit (same flow the other specs verify). */
async function signIn(page: Page, email: string) {
  await page.goto("/");
  await page.fill('input[type="email"]', email);
  await page.click('button:has-text("Email me a magic link")');
  await expect(page.getByText("Check your email")).toBeVisible();

  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const list = await (
          await fetch(`${MAILPIT}/api/v1/search?query=to:${email}&limit=1`)
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

  await page.goto(link!);
  await page.waitForURL(/\/groups|\/g\//);
}

/**
 * Wait for the ring-close celebration, then tap it away. It's a full-screen
 * modal that only self-dismisses after 4.2s, so clicking straight through to
 * the page underneath just races that timer (the click gets intercepted and
 * retried until the card clears) — which is what made these specs flaky.
 */
async function closeCelebration(page: Page) {
  await expect(page.getByText("Ring closed!")).toBeVisible();
  await page.getByRole("dialog").click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("collective counter climbs live when a peer taps", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // A creates a group + one task (target 10) + an open invite.
  await signIn(pageA, A);
  await pageA.goto("/groups");
  await pageA.click('button:has-text("New group")');
  await pageA.fill("#new-group-name", "Live Circle");
  await pageA.click('button:has-text("Create group")');
  await pageA.waitForURL("**/group/manage");
  await pageA.getByPlaceholder("Label (e.g. La ilaha illallah)").fill("Tasbih");
  await pageA.getByPlaceholder("Daily target").last().fill("10");
  await pageA.click('button:has-text("Add task")');
  await expect(pageA.getByText("target 10 / day")).toBeVisible();
  await pageA.click('button:has-text("Create invite")');
  const joinLink = await pageA
    .locator("code", { hasText: "/join/" })
    .first()
    .innerText();
  const joinPath = new URL(joinLink).pathname;

  // B signs in and joins the same group via the open link.
  await signIn(pageB, B);
  await pageB.goto(joinPath);
  await expect(
    pageB.getByText("You’ve been invited to Live Circle"),
  ).toBeVisible();
  await pageB.click('button:has-text("Join the group")');
  await pageB.waitForURL(/\/g\/.*\/today/);

  // A sits on /today. Goal is now 10 × 2 members = 20; nobody has logged → 0%.
  await pageA.goto("/today");
  await expect(pageA.getByText("Your circle is")).toContainText("0%");

  // B taps the task to completion (10/10) in their own session; heading back
  // awaits the debounced increment_count flush, so the DB really has count=10.
  await pageB.goto("/today");
  await pageB.click('a:has-text("Continue Tasbih")');
  await pageB.waitForURL("**/count/**");
  const pad = pageB.getByRole("button", { name: "Tap to count" });
  for (let i = 0; i < 10; i++) await pad.click();
  await closeCelebration(pageB);
  await pageB.click('button:has-text("Back to today")');
  await pageB.waitForURL("**/today");

  // A never touched their tab — the counter climbs to 10/20 = 50% LIVE.
  await expect(pageA.getByText("Your circle is")).toContainText("50%", {
    timeout: 15_000,
  });

  await ctxA.close();
  await ctxB.close();
});
