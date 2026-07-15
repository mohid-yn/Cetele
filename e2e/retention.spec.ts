import { test, expect, type Page } from "@playwright/test";

/**
 * The v2 retention layer, end-to-end against the real local stack (CET-17…22).
 *
 * Covers the surfaces the mock only ever pretended at:
 *   * CET-21 endowed progress — a new member is welcomed with the circle's REAL
 *     momentum, and never with a fabricated count of their own (D43)
 *   * CET-18 peer reactions — a one-tap dua lands on a peer who closed their
 *     rings, persists across a reload, and a second tap takes it back
 *   * CET-17 group garden + CET-22 pair goal — derived surfaces on the Group hub
 *   * CET-20 badges — the earned/aspirational grid on Progress
 */
const MAILPIT = "http://127.0.0.1:54324";
const STAMP = Date.now();
const A = `e2e-v2-a-${STAMP}@example.com`;
const B = `e2e-v2-b-${STAMP}@example.com`;

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

async function closeCelebration(page: Page) {
  await expect(page.getByText("Ring closed!")).toBeVisible();
  await page.getByRole("dialog").click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("v2: welcome → peer reaction → garden, pair goal, badges", async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // A creates the circle with one quick task, and opens an invite for B.
  await signIn(pageA, A);
  await pageA.goto("/groups");
  await pageA.click('button:has-text("New group")');
  await pageA.fill("#new-group-name", "Garden Circle");
  await pageA.click('button:has-text("Create group")');
  // Creating a circle lands you straight in its Manage screen (CET-30).
  await pageA.waitForURL("**/group/manage");
  await pageA.getByPlaceholder("Label (e.g. La ilaha illallah)").fill("Tasbih");
  await pageA.getByPlaceholder("Daily target").last().fill("3");
  await pageA.click('button:has-text("Add task")');
  await expect(pageA.getByText("target 3 / day")).toBeVisible();
  await pageA.click('button:has-text("Create invite")');
  const joinLink = await pageA
    .locator("code", { hasText: "/join/" })
    .first()
    .innerText();
  const joinPath = new URL(joinLink).pathname;

  // ---- CET-21: endowed progress, told truthfully -----------------------------
  // A is brand new and has logged nothing, so Today welcomes them. The circle
  // has done nothing yet either — so it says so, rather than inventing progress.
  await pageA.goto("/today");
  await expect(pageA.getByText("Welcome to Garden Circle")).toBeVisible();
  await expect(
    pageA.getByText("The circle's day is just beginning"),
  ).toBeVisible();
  // D43: the welcome must NOT have written a count on A's behalf.
  await expect(pageA.getByText("Your circle is")).toContainText("0%");

  // B joins and closes every ring (3/3) — the trigger for a peer reaction.
  await signIn(pageB, B);
  await pageB.goto(joinPath);
  await pageB.click('button:has-text("Join the group")');
  await pageB.waitForURL(/\/g\/.*\/today/);
  await pageB.click('a:has-text("Continue Tasbih")');
  await pageB.waitForURL("**/count/**");
  const pad = pageB.getByRole("button", { name: "Tap to count" });
  await pad.click();
  await pad.click();
  await pad.click();
  await closeCelebration(pageB);
  await pageB.click('button:has-text("Back to today")');
  await pageB.waitForURL("**/today");

  // ---- CET-18: one-tap peer reactions ---------------------------------------
  // A sees B finished, and can cheer them. (A has closed nothing, so A gets no
  // reaction row of their own — you cannot cheer yourself.)
  await pageA.reload();
  const bRow = pageA.locator("li", { hasText: "all rings closed" });
  await expect(bRow).toBeVisible();

  const dua = bRow.getByRole("button", { name: /^Dua for / });
  await expect(dua).toHaveAttribute("aria-pressed", "false");
  await dua.click();
  await expect(dua).toHaveAttribute("aria-pressed", "true");
  await expect(dua).toContainText("1");

  // It really persisted — this is a row in `reactions`, not optimistic state.
  await pageA.reload();
  const duaAgain = pageA
    .locator("li", { hasText: "all rings closed" })
    .getByRole("button", { name: /^Dua for / });
  await expect(duaAgain).toHaveAttribute("aria-pressed", "true");
  await expect(duaAgain).toContainText("1");

  // B sees the encouragement they received.
  await pageB.reload();
  await expect(pageB.getByText("you received 1 today")).toBeVisible();

  // Tapping the same glyph again takes it back (the unique key IS the toggle).
  await duaAgain.click();
  await expect(duaAgain).toHaveAttribute("aria-pressed", "false");
  await pageA.reload();
  await expect(
    pageA
      .locator("li", { hasText: "all rings closed" })
      .getByRole("button", { name: /^Dua for / }),
  ).toHaveAttribute("aria-pressed", "false");

  // ---- CET-17 garden + CET-22 pair goal --------------------------------------
  await pageA.goto("/group");
  await pageA.waitForURL(/\/g\/.*\/group/);
  // A brand-new circle is resting — calm, never shaming (D8).
  await expect(pageA.getByText("Your circle's garden")).toContainText(
    "Resting",
  );

  await pageA.click('button:has-text("Standings")');
  // The pair goal leads the ranking: B is A's only possible buddy.
  await expect(pageA.getByText("Pair goal · this week")).toBeVisible();
  await expect(pageA.getByText(/more active days? between you/)).toBeVisible();

  // ---- CET-20 badges ---------------------------------------------------------
  await pageA.goto("/progress");
  await pageA.waitForURL(/\/g\/.*\/progress/);
  await expect(pageA.getByText("Achievements")).toBeVisible();
  // Nothing earned on day one — the six sit there as calm aspirations.
  await expect(pageA.getByText("0 of 6 earned")).toBeVisible();
  await expect(pageA.getByText("First week")).toBeVisible();
});
