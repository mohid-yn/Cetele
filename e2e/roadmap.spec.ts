import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * The roadmap loop (D55, migration 0025): a circle follows a published
 * programme, its members record progress against work done OUTSIDE the app in
 * sequential LEVELS, and a reward unlocks at the end of each level.
 *
 * The seed carries the real Islamic Development Program for local/CI. These
 * tests pin the STRUCTURE (levels, the budgeted listening category, the
 * compulsory rule) rather than the catalogue, so replacing the placeholder
 * lecture URLs or the reward figures does not break them — but they do name a
 * few items, because a spec that asserts nothing about content cannot tell a
 * rendered programme from an empty one.
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
  await page.selectOption("#group-roadmap", {
    label: "Islamic Development Program",
  });

  // BEFORE recording anything: the report already knows this person is on the
  // programme. Built from `roadmap_progress` alone it could not — a member with
  // no rows was indistinguishable from someone not enrolled, and the person an
  // admin most needs to notice is the one who has not started. The roster comes
  // from membership (`roadmap_roster`), carrying the same three readers as the
  // progress policy.
  await page.goto("/programme");
  await expect(page.getByText("Nothing recorded yet")).toHaveCount(0);
  await expect(page.getByText("0 of 3 levels")).toBeVisible();

  // The way IN is a card on Progress, not a nav tab — see the commit for why.
  await page.goto(manageUrl);
  await page.getByRole("link", { name: "Progress", exact: true }).click();
  const entry = page.getByRole("link", {
    name: /Islamic Development Program/,
  });
  await expect(entry).toBeVisible();
  await entry.click();
  await page.waitForURL("**/roadmap");

  await expect(
    page.getByRole("heading", { level: 1, name: "Roadmap" }),
  ).toBeVisible();

  // A fresh member starts at LEVEL 1 and has finished nothing. Everyone begins
  // there and logs their way up — there is no level to pick and none to assign.
  await expect(page.getByText("3 levels · none finished yet")).toBeVisible();
  await expect(page.getByText(/Level 1/).first()).toBeVisible();

  // A one-unit item is a yes/no thing and gets a single toggle, not a counter.
  // `ul > li`, not `li`: the reward LADDER is an <ol>, so a bare li filter
  // matches a reward rung — which has no button on it — not the item card.
  const book = page
    .locator("ul > li")
    .filter({ hasText: "Calling to Good" })
    .first();
  await book.getByRole("button", { name: "Mark done" }).click();
  await expect(book.getByRole("button", { name: "Undo" })).toBeVisible();

  // A multi-unit item counts up. Three taps in a row is the case that matters:
  // the buttons send an ABSOLUTE value, so out-of-order replies would let the
  // loser win — the count-dip family. All three must land.
  const khatm = page.locator("ul > li").filter({ hasText: "½ Khatm" }).first();
  const plus = khatm.getByRole("button", { name: /^Add one to/ });
  await plus.click();
  await plus.click();
  await plus.click();
  await expect(khatm.getByText("3 of 15 juz")).toBeVisible();

  // THE ASSERTION THAT CARRIES THE FEATURE: it survives a reload. Everything
  // above is satisfied by optimistic state with nothing written.
  await page.reload();
  await expect(khatm.getByText("3 of 15 juz")).toBeVisible();
  await expect(book.getByRole("button", { name: "Undo" })).toBeVisible();

  // Recording is reversible. A number a member can only push upward is one
  // they will eventually be afraid to touch.
  const minus = khatm.getByRole("button", { name: /^Remove one from/ });
  await minus.click();
  await expect(khatm.getByText("2 of 15 juz")).toBeVisible();

  // ---- the budgeted category, which is scored differently to every other ----
  // "Listen to a total of 600 minutes" from a menu — so the heading reports the
  // BUDGET, not how many of the ten lectures are ticked, and a lecture is worth
  // its whole minute value the moment it is marked done.
  await expect(page.getByText("0 of 600 minutes")).toBeVisible();

  const lecture = page
    .locator("ul > li")
    .filter({ hasText: "Lessons From The Qur'an" })
    .first();
  await lecture.getByRole("button", { name: "Mark done" }).click();

  // 555, not 1: a lecture is recorded all-or-nothing but counts for what it is
  // worth. Writing 1 here would credit a nine-hour playlist as a single minute.
  await expect(page.getByText("555 of 600 minutes")).toBeVisible();

  // THE NEGATIVE THAT CARRIES THE COMPULSORY RULE: the two required lectures
  // are still unwatched, so the level cannot be complete however the minutes
  // add up — and the row says so before the member finds out the hard way.
  await expect(page.getByText("Required").first()).toBeVisible();

  // And now OVER the budget, which is reachable on the real content: level 1's
  // optional lectures are worth 943 minutes against a 600 requirement. 555 + 134
  // is 689 of 600 with neither required lecture watched. The category bar used
  // to read 100% here, over a category that was not complete — the number and
  // the rule beside it saying opposite things. Nothing may be finished by this.
  await page
    .locator("ul > li")
    .filter({ hasText: "The Way of Ascension" })
    .first()
    .getByRole("button", { name: "Mark done" })
    .click();

  await expect(page.getByText("689 of 600 minutes")).toBeVisible();
  await expect(page.getByText("Required").first()).toBeVisible();
  await expect(page.getByText("3 levels · none finished yet")).toBeVisible();

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
  await expect(page.getByText("Level 1 complete")).toHaveCount(0);

  // The report is scoped by RLS, not by app code: this admin leads a circle
  // that follows nothing, so there is nobody they are entitled to see — least
  // of all the owner above, who is on the same programme in another circle.
  await page.goto("/programme");
  await expect(page.getByText("Nothing recorded yet")).toBeVisible();
});
