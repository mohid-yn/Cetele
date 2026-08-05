import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * The roadmap loop (D55, migration 0025): a circle follows a published
 * programme, its members record progress against items done OUTSIDE the app,
 * and rewards unlock at milestones.
 *
 * The seed publishes one "2026 programme" for local/CI, which is what these
 * tests pick. Nothing here asserts on its contents beyond the item it edits —
 * the real programme is the owner's to supply (STATUS §2, roadmap Q1), so a
 * spec that pinned titles would break the moment it lands.
 */
const STAMP = Date.now();
const OWNER = `e2e-roadmap-${STAMP}@example.com`;
const OUTSIDER = `e2e-roadmap-out-${STAMP}@example.com`;

test.describe.configure({ mode: "serial" });

/** Create a circle and return the manage URL it lands on. */
async function newCircle(
  page: import("@playwright/test").Page,
  name: string,
): Promise<string> {
  await page.goto("/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", name);
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  return page.url();
}

test("a circle follows a programme, and its members can record against it", async ({
  page,
}) => {
  await signIn(page, OWNER);
  const manageUrl = await newCircle(page, `Roadmap Circle ${STAMP}`);

  // Before opting in there is no way in from Progress, and the roadmap route
  // itself says so rather than redirecting.
  await page.getByRole("link", { name: "Progress", exact: true }).click();
  await expect(page.getByText("The circle’s programme")).toHaveCount(0);

  // Back to Manage by URL, not history: Manage STREAMS, so for a beat the only
  // thing on the page is the circle name, and an immediate selectOption on a
  // half-rendered screen is a false negative (a trap this suite has hit before).
  await page.goto(manageUrl);
  await expect(page.locator("#group-roadmap")).toBeVisible();
  await page.selectOption("#group-roadmap", { label: "2026 programme" });

  // The way IN is a card on Progress, not a nav tab — see the commit for why.
  await page.getByRole("link", { name: "Progress", exact: true }).click();
  const entry = page.getByRole("link", { name: /2026 programme/ });
  await expect(entry).toBeVisible();
  await entry.click();
  await page.waitForURL("**/roadmap");

  await expect(
    page.getByRole("heading", { level: 1, name: "Roadmap" }),
  ).toBeVisible();

  // Nothing recorded yet.
  await expect(page.getByText("0 of 6 items complete")).toBeVisible();

  // A one-unit item is a yes/no thing and gets a single toggle, not a counter.
  // `ul > li`, not `li`: the reward LADDER is an <ol> and one of its rungs
  // reads "Winter retreat, travel covered", so a bare li filter matched a
  // reward rung — which has no button on it — instead of the item card.
  const retreat = page
    .locator("ul > li")
    .filter({ hasText: "Winter retreat" })
    .first();
  await retreat.getByRole("button", { name: "Mark done" }).click();
  await expect(retreat.getByRole("button", { name: "Undo" })).toBeVisible();

  // A multi-unit item counts up. Three taps in a row is the case that matters:
  // the buttons send an ABSOLUTE value, so out-of-order replies would let the
  // loser win — the count-dip family. All three must land.
  const seerah = page
    .locator("ul > li")
    .filter({ hasText: "Seerah series" })
    .first();
  const plus = seerah.getByRole("button", { name: /^Add one to/ });
  await plus.click();
  await plus.click();
  await plus.click();
  await expect(seerah.getByText("3 of 24 videos")).toBeVisible();

  // THE ASSERTION THAT CARRIES THE FEATURE: it survives a reload. Everything
  // above is satisfied by optimistic state with nothing written.
  await page.reload();
  await expect(page.getByText("3 of 24 videos")).toBeVisible();
  await expect(page.getByText("1 of 6 items complete")).toBeVisible();

  // The ladder moved with it — the reward is the only thing on this screen
  // that answers "why", so it has to track what was recorded.
  await expect(page.getByText("1 to go")).toBeVisible();

  // Recording is reversible. A number a member can only push upward is one
  // they will eventually be afraid to touch.
  const minus = seerah.getByRole("button", { name: /^Remove one from/ });
  await minus.click();
  await expect(seerah.getByText("2 of 24 videos")).toBeVisible();

  // The member is TOLD who reads this (D55) — being read without knowing is
  // the thing the disclosure exists to prevent.
  await expect(
    page.getByText(/admins and the programme’s organisers can see/),
  ).toBeVisible();
});

test("the roadmap never touches the daily engine", async ({ page }) => {
  await signIn(page, OWNER);

  // A day spent not reading must never break a streak (D8). Recording six
  // items above changed nothing on Progress: no streak, no consistency, no
  // completed day — the roadmap can only ever ADD.
  await page.goto("/groups");
  await page.getByRole("link", { name: /Roadmap Circle/ }).click();
  await page.getByRole("link", { name: "Progress", exact: true }).click();

  await expect(page.getByText("of the last 14 days")).toBeVisible();
  await expect(page.getByText("every day is a fresh start")).toBeVisible();
  // `exact`, because "every day is a fresh start" above also contains it —
  // the strict-mode violation this suite keeps re-learning.
  await expect(page.getByText("Fresh start", { exact: true })).toBeVisible();
});

test("an outsider's circle sees no programme, and the report shows them nobody", async ({
  page,
}) => {
  await signIn(page, OUTSIDER);
  const manageUrl = await newCircle(page, `Outsider Circle ${STAMP}`);

  // A circle that follows nothing gets an explanation, not a redirect — and
  // crucially not the rewards, which are the administration's real promises to
  // people it has actually enrolled.
  await page.goto(manageUrl.replace("/group/manage", "/roadmap"));
  await expect(page.getByText("isn’t following a programme")).toBeVisible();
  await expect(page.getByText("Retreat place held")).toHaveCount(0);

  // The report is scoped by RLS, not by app code: this admin leads a circle
  // that follows nothing, so there is nobody they are entitled to see — least
  // of all the owner above, who is on the same programme in another circle.
  await page.goto("/programme");
  await expect(page.getByText("Nothing recorded yet")).toBeVisible();
});
