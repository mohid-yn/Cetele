import { test, expect, type Page } from "@playwright/test";

/**
 * M5 (CET-9/CET-16) — the reflection surfaces, end-to-end against the real
 * local stack. Two users in one group: B completes a task; A (the owner)
 * reads it back on the server-first /group hub (live collective Overview,
 * weekly Standings, Members contributions) and B reads their own /progress
 * (streak + 14-day grid). Then A proxy-logs a correction on B's record via the
 * editable breakdown (D29, `set_count`) and we confirm it persists.
 *
 * Everything renders from real `logs`/`streaks` under RLS — no mock store.
 */
const MAILPIT = "http://127.0.0.1:54324";
const STAMP = Date.now();
const A = `e2e-m5-a-${STAMP}@example.com`;
const B = `e2e-m5-b-${STAMP}@example.com`;
const bName = B.split("@")[0];

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
 * retried until the card clears) — which is what made this spec flaky.
 */
async function closeCelebration(page: Page) {
  await expect(page.getByText("Ring closed!")).toBeVisible();
  await page.getByRole("dialog").click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

/** Create a group + one task via the real UI (owner flow). */
async function createGroupWithTask(
  page: Page,
  name: string,
  task: string,
  target: number,
) {
  await page.goto("/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", name);
  await page.click('button:has-text("Create group")');
  const card = page.getByRole("listitem").filter({ hasText: name });
  await card.getByRole("link", { name: "Manage" }).click();
  await page.waitForURL("**/group/manage");
  await page.getByPlaceholder("Label (e.g. La ilaha illallah)").fill(task);
  await page.getByPlaceholder("Daily target").last().fill(String(target));
  await page.click('button:has-text("Add task")');
  await expect(page.getByText(`target ${target} / day`)).toBeVisible();
}

test("reflection surfaces read real logs; admin proxy-edit persists", async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // A creates a group + one task (target 10) + an open invite.
  await signIn(pageA, A);
  await pageA.goto("/groups");
  await pageA.click('button:has-text("New group")');
  await pageA.fill("#new-group-name", "Reflect Circle");
  await pageA.click('button:has-text("Create group")');
  await pageA.click('a:has-text("Manage")');
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

  // B joins and completes the task (10/10) in their own session.
  await signIn(pageB, B);
  await pageB.goto(joinPath);
  await expect(
    pageB.getByText("You’ve been invited to Reflect Circle"),
  ).toBeVisible();
  await pageB.click('button:has-text("Join the group")');
  await pageB.waitForURL(/\/g\/.*\/today/);

  await pageB.goto("/today");
  await pageB.click('a:has-text("Continue Tasbih")');
  await pageB.waitForURL("**/count/**");
  const pad = pageB.getByRole("button", { name: "Tap to count" });
  for (let i = 0; i < 10; i++) await pad.click();
  await closeCelebration(pageB);
  await pageB.click('button:has-text("Back to today")');
  await pageB.waitForURL("**/today");

  // B's personal /progress reads their real streak + 14-day grid.
  await pageB.goto("/progress");
  await expect(pageB.getByText("day streak")).toBeVisible();
  await expect(pageB.getByText(/1 of the last 14 days/)).toBeVisible(); // completed today → 1 full day
  await expect(pageB.getByText("Last 14 days · task by task")).toBeVisible();

  // A's server-first /group hub reads the same logs back.
  await pageA.goto("/group");

  // Overview — collective is 10 of (10 × 2 members) = 50%.
  await expect(pageA.getByText("The circle today")).toBeVisible();
  await expect(pageA.getByText("50%")).toBeVisible();
  await expect(pageA.getByText("10 / 20")).toBeVisible();

  // Standings — B is active 1/7 days this week off real logs.
  await pageA.getByRole("tab", { name: "Standings" }).click();
  await expect(pageA.getByText("1/7 days active this week")).toBeVisible();

  // Members — B's today contribution + the admin fortnight breakdown.
  await pageA.getByRole("tab", { name: "Members" }).click();
  await pageA
    .getByRole("button", { name: `See ${bName}'s last 14 days` })
    .click();
  await expect(pageA.getByText("Last 14 days · tap a square")).toBeVisible();
  await expect(pageA.getByText("full days")).toBeVisible();

  // Proxy-edit (D29): correct B's Tasbih today from 10 → 5 via set_count.
  await pageA.getByRole("button", { name: /Tasbih.*10 of 10/ }).click();
  await pageA.getByLabel("Count for this day").fill("5");
  await pageA.getByRole("button", { name: "Save" }).click();
  await expect(pageA.getByText(/5 \/ 10/)).toBeVisible();
  await expect(pageA.getByText(/logged by/)).toBeVisible();

  // Persisted — reload, reopen, the cell reads 5 of 10 from the DB.
  await pageA.goto("/group");
  await pageA.getByRole("tab", { name: "Members" }).click();
  await pageA
    .getByRole("button", { name: `See ${bName}'s last 14 days` })
    .click();
  await pageA.getByRole("button", { name: /Tasbih.*5 of 10/ }).click();
  await expect(pageA.getByLabel("Count for this day")).toHaveValue("5");

  await ctxA.close();
  await ctxB.close();
});

test("switching the active group changes the data shown", async ({ page }) => {
  const C = `e2e-m5-c-${STAMP}@example.com`;
  await signIn(page, C);
  await createGroupWithTask(page, "Alpha Circle", "Tasbih", 10);
  await createGroupWithTask(page, "Beta Circle", "Salawat", 5);

  // Tapping a /groups card makes that circle active and opens Today (no client
  // JS needed — the card is a Server-Action form). Alpha shows only its task.
  await page.goto("/groups");
  await page
    .getByRole("listitem")
    .filter({ hasText: "Alpha Circle" })
    .getByRole("link", { name: /Alpha Circle/ })
    .click();
  await page.waitForURL("**/today");
  await expect(page.getByText("Continue Tasbih")).toBeVisible();
  await expect(page.getByText("Salawat")).toHaveCount(0);

  // Switch to Beta → Today now reflects Beta's task instead.
  await page.goto("/groups");
  await page
    .getByRole("listitem")
    .filter({ hasText: "Beta Circle" })
    .getByRole("link", { name: /Beta Circle/ })
    .click();
  await page.waitForURL("**/today");
  await expect(page.getByText("Continue Salawat")).toBeVisible();
  await expect(page.getByText("Tasbih")).toHaveCount(0);
});
