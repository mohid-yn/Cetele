import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * As-of task configuration (0024), end-to-end against the real local stack.
 *
 * The last third of the retroactivity family. `private.obligations` used to
 * answer "what did this member owe on THIS DAY" out of `tasks.target_count`,
 * which has no notion of when — so an admin raising the bar re-judged every
 * past day at the new number, a day genuinely kept became a miss, and a rebuilt
 * chain collapsed for every member of the circle at once.
 *
 * The assertion that carries it is the NEGATIVE one, and it is on the SCREEN
 * rather than in the engine: after the raise, yesterday keeps its tick. pgTAP
 * 013 pins the database (and was verified to fail against the old predicate);
 * this pins the half a green build cannot see, because the day-strip does its
 * own comparison in the client and would go on reading the live target long
 * after the streak stopped. The member would then be told ten days by the
 * streak and one by the strip — the same history-erased read that keying the
 * strip on a personal goal produced, with the admin holding the pen.
 */
const STAMP = Date.now();
const USER = `e2e-cfg-${STAMP}@example.com`;

test.describe.configure({ mode: "serial" });

let manageUrl = "";

async function closeCelebration(page: Page) {
  await expect(page.getByText("Ring closed!")).toBeVisible();
  await page.getByRole("dialog").click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

/** The day-strip cell for a given label ("Yesterday", "Today"). */
function day(page: Page, name: RegExp) {
  return page.getByRole("button", { name });
}

test("a circle, a task at 3, and yesterday closed at 3", async ({ page }) => {
  await signIn(page, USER);

  await page.goto("/today");
  await page.waitForURL("**/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", "History Circle");
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  manageUrl = page.url();

  await page.getByPlaceholder("Label (e.g. La ilaha illallah)").fill("Tasbih");
  await page.getByPlaceholder("Daily target").last().fill("3");
  await page.click('button:has-text("Add task")');
  await expect(page.getByText("target 3 · daily")).toBeVisible();

  await page.goto("/today");
  await page.click('a:has-text("Continue Tasbih")');
  await page.waitForURL("**/count/**");

  // Back-fill YESTERDAY, which is the day the whole test is about: today would
  // legitimately move to the new target, so it cannot tell the two behaviours
  // apart. D48 makes a repaired day count, and the 14-day window allows it.
  await day(page, /Yest\./).click();
  await expect(day(page, /Yest\./)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Logging for/)).toBeVisible();

  const pad = page.getByRole("button", { name: "Tap to count" });
  await pad.click();
  await pad.click();
  await pad.click();
  await closeCelebration(page);

  // Yesterday now carries its tick — one `svg` inside that cell.
  await expect(day(page, /Yest\./).locator("svg")).toHaveCount(1);

  // In-app, never `page.goto`: the tap queue flushes on a 600ms debounce plus a
  // best-effort dispatch on unmount, and a hard navigation tears the JS context
  // down before either lands (§7). The three taps would simply vanish and every
  // assertion below would be measuring an empty day.
  await page.click('button:has-text("Back to today")');
  await page.waitForURL("**/today");
});

test("the admin raises the bar from 3 to 30", async ({ page }) => {
  await signIn(page, USER);
  await page.goto(manageUrl);
  await expect(page.getByText("Add people")).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Target each time").fill("30");
  // `.first()`: the circle-settings panel has its own (disabled) Save, so the
  // bare name is a strict-mode violation. The task row's is the first in DOM
  // order and the only enabled one.
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("target 30 · daily")).toBeVisible();
});

test("THE NEGATIVE: yesterday keeps its tick, and only today asks for 30", async ({
  page,
}) => {
  await signIn(page, USER);
  await page.goto("/today");
  await page.click('a:has-text("Continue Tasbih")');
  await page.waitForURL("**/count/**");

  // The whole migration, on screen. Against the live target this cell loses its
  // tick the moment the admin saves — 3 of 30 — and a fortnight of kept days
  // goes with it.
  await expect(day(page, /Yest\./).locator("svg")).toHaveCount(1);

  // ...while TODAY is measured against the new number, because an edit applies
  // from the day it is made. Today is empty, so the ring reads 0 of 30.
  await expect(page.getByText("of 30")).toBeVisible();

  // And selecting yesterday shows the day still asking what it asked.
  await day(page, /Yest\./).click();
  await expect(page.getByText("of 3", { exact: false })).toBeVisible();
});
