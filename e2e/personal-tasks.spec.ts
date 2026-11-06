import { test, expect, type Page } from "@playwright/test";
import { signIn, openManageTab } from "./helpers";

/**
 * A task the member adds for THEMSELVES (0036, D70).
 *
 * Owner: "students should be able to add tasks for only themselves through the
 * my tasks tab since logic already exists to add tasks for specific people."
 *
 * WHAT THIS SPEC IS ACTUALLY FOR. The database half is pinned by pgTAP 021 —
 * the RPC, the grants, the policies, and the one assertion that stands for all
 * six downstream mechanics (`private.obligations` returns it the day it is
 * made). None of that is repeated here.
 *
 * What pgTAP CANNOT reach is the half D70 deliberately put in app code: the
 * personal task is out of the collective goal and out of the weekly standings,
 * and those two figures are computed in `today/page.tsx` and `group/page.tsx`
 * rather than in SQL. A rule with no database twin has no test but this one —
 * so the load-bearing assertions below are the PAIR on the circle's bar:
 *
 *   * the denominator does not grow when the task is added, and
 *   * the numerator does not grow when it is counted.
 *
 * Either one alone passes against a broken build. Excluding it from `total`
 * only would measure the member against a bar including work the screen refuses
 * to count; excluding it from `goal` only would draw a circle permanently over
 * 100%. The test that matters is that the number does not move at all, while
 * the member's OWN ring fills — which is the whole trade D70 makes.
 */
const STAMP = Date.now();
const OWNER = `e2e-own-owner-${STAMP}@example.com`;
const MEMBER = `e2e-own-member-${STAMP}@example.com`;
const memberName = MEMBER.split("@")[0];

test.describe.configure({ mode: "serial" });

let inviteLink = "";
/** `/group/manage` is not a route — the real one is group-scoped. Captured off
 *  the redirect at creation and reused, as task-assignees.spec does. */
let manageUrl = "";

async function signOut(page: Page) {
  await page.goto("/profile");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("/");
}

/** Open "My goals" from Today — the member's own axis, and D70's third entry. */
async function openGoals(page: Page) {
  await page.goto("/today");
  await page.getByRole("button", { name: "My goals" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/**
 * The circle's headline, read off the group screen rather than Today.
 *
 * Today states a PERCENTAGE, and a percentage can be right by coincidence —
 * 0 of 20 and 0 of 27 are both 0%. The group screen prints both sides of the
 * fraction, which is the only place the denominator is visible at all.
 */
async function expectCircleBar(page: Page, text: string) {
  await page.goto("/group");
  await expect(page.getByText(text)).toBeVisible();
}

test("a circle of two, on the circle's own task", async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto("/today");
  await page.waitForURL("**/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", "Own Circle");
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  manageUrl = page.url();
  await page.fill('input[aria-label="New task label"]', "Salawat");
  await page.fill('input[aria-label="New task daily target"]', "10");
  await page.click('button:has-text("Add task")');
  await expect(page.getByText("Salawat")).toBeVisible();

  await openManageTab(page, "Members");
  inviteLink = await page
    .locator("code", { hasText: "/join/" })
    .first()
    .innerText();
  await signOut(page);
});

test("the member joins, and the bar is the circle's alone", async ({
  page,
}) => {
  await signIn(page, MEMBER);
  await page.goto(inviteLink);
  await page.getByRole("button", { name: /Accept|Join/i }).click();
  await page.waitForURL("**/today**");

  await expect(
    page.getByRole("main").getByText("0 / 10").first(),
  ).toBeVisible();
  // Two members, 10 each. This is the number the next two tests must not move.
  await expectCircleBar(page, "0 of 20 toward today’s goal");
  await signOut(page);
});

test("the member adds a task for themselves, and it is theirs today", async ({
  page,
}) => {
  await signIn(page, MEMBER);
  await openGoals(page);

  await page.getByRole("button", { name: "Add a task for myself" }).click();
  await expect(
    page.getByRole("dialog").getByText("Add a task for yourself"),
  ).toBeVisible();

  await page.locator("#own-label").fill("Wird");
  await page.locator("#own-target").fill("7");
  await page.getByRole("button", { name: "Add it" }).click();
  // Saving returns to the goals list rather than closing the dialog: the form
  // is a PANE inside this one dialog, not a dialog of its own (D67's rule —
  // nested modals on a phone are two backdrops and two dismiss gestures).
  await expect(page.getByRole("dialog", { name: "My goals" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // An obligation the day it is made — the member's own ring, on their Today.
  // This is `private.obligations` reading it like any other task (pgTAP 021),
  // arriving on the screen.
  await expect(page.getByRole("main").getByText("0 / 7").first()).toBeVisible();
});

test("THE DENOMINATOR DOES NOT GROW — adding it cannot move the circle's goal", async ({
  page,
}) => {
  await signIn(page, MEMBER);
  // Still 20, not 27. A shared bar a member can raise by inventing work for
  // themselves is not a shared bar.
  await expectCircleBar(page, "0 of 20 toward today’s goal");
});

test("THE NUMERATOR DOES NOT GROW — counting it fills MY ring and nothing else", async ({
  page,
}) => {
  await signIn(page, MEMBER);
  await page.goto("/today");
  // The RING itself, not the "Continue …" CTA — that one names the circle's
  // primary task, and a task of my own never takes it over.
  await page.getByRole("link", { name: /Wird 0 \/ 7/ }).click();
  await page.waitForURL("**/count/**");

  const pad = page.getByRole("button", { name: "Tap to count" });
  const wird = page.url();
  for (let i = 0; i < 7; i++) await pad.click();

  // Closing it moves on by itself (D71), and that navigation waits for the flush,
  // so the DB has the count before anything below reads it. Today is reached
  // in-app from wherever that landed.
  await expect.poll(() => page.url()).not.toBe(wird);
  await page.goto("/today");

  // It counted for ME.
  await expect(page.getByRole("main").getByText("7 / 7").first()).toBeVisible();
  // And for nobody else: not "7 of 20", not "7 of 27", not "0 of 27".
  await expectCircleBar(page, "0 of 20 toward today’s goal");
});

test("the circle SEES it, named and marked as not its own", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.goto("/group");

  // No secret work (D70): it is listed with its count, exactly as any
  // single-assignee task has been since 0023.
  const row = page.getByRole("listitem").filter({ hasText: "Wird" });
  await expect(row).toBeVisible();
  // ...and the row says WHY it is not in the total above it, or the arithmetic
  // on this card reads as a bug rather than as a rule.
  await expect(row.getByText(/their own/)).toBeVisible();

  await expect(page.getByText("0 of 20 toward today’s goal")).toBeVisible();
});

test("an admin may not reassign it — the row states its carrier", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.goto(`${manageUrl}?tab=tasks`);

  const row = page.getByRole("listitem").filter({ hasText: "Wird" });
  await expect(
    row.getByText(`${memberName}’s own task · not part of the circle’s total`),
  ).toBeVisible();

  // The "who is this for" control is absent on this row and present on the
  // circle's own task — `set_task_assignees` refuses a personal task outright,
  // so a button here would have exactly one outcome and it would be an error.
  await expect(
    row.getByRole("button", { name: /Who is Wird for\?/ }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Salawat" })
      .getByRole("button", { name: /Who is Salawat for\?/ }),
  ).toBeVisible();
});

test("the member removes it, and their day is the circle's again", async ({
  page,
}) => {
  await signIn(page, MEMBER);
  await openGoals(page);

  await page
    .getByRole("button", { name: "Wird. Your own task, edit it" })
    .click();
  await expect(
    page.getByRole("dialog").getByText("Your own task"),
  ).toBeVisible();

  // Two taps, and the first only arms it. A confirm DIALOG inside a dialog is
  // the nesting this pane exists to avoid.
  await page.getByRole("button", { name: "Remove this task" }).click();
  await page.getByRole("button", { name: "Yes, remove it" }).click();
  // Back to the goals list, same as saving — and the row's door is gone with it.
  await expect(page.getByRole("dialog", { name: "My goals" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Wird. Your own task, edit it" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect(page.getByRole("main").getByText("7 / 7")).toHaveCount(0);
  await expect(
    page.getByRole("main").getByText("0 / 10").first(),
  ).toBeVisible();
});
