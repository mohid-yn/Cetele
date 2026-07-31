import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Personal stretch goals (D51), end-to-end against the real local stack.
 *
 * The feature is easy to build and easy to get subtly wrong, and the wrong
 * version is the one that punishes ambition — so the assertions that matter
 * most here are the NEGATIVE ones: after raising the bar three-fold, the
 * streak that was already earned is still 1, the day is still marked kept, and
 * the circle still reads 100%. A regression that quietly re-pointed any of
 * those at the personal goal would pass a build and fail here.
 */
const STAMP = Date.now();
const USER = `e2e-goal-${STAMP}@example.com`;

test.describe.configure({ mode: "serial" });

async function closeCelebration(page: Page) {
  await expect(page.getByText("Ring closed!")).toBeVisible();
  await page.getByRole("dialog").click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("raise my own bar → ring re-opens, streak and circle untouched", async ({
  page,
}) => {
  await signIn(page, USER);

  await page.goto("/today");
  await page.waitForURL("**/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", "Stretch Circle");
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  await page.getByPlaceholder("Label (e.g. La ilaha illallah)").fill("Salawat");
  await page.getByPlaceholder("Daily target").last().fill("3");
  await page.click('button:has-text("Add task")');
  await expect(page.getByText("target 3 / day")).toBeVisible();

  // ---- close the ring at the circle's share, the ordinary way ---------------
  await page.goto("/today");
  await page.click('a:has-text("Continue Salawat")');
  await page.waitForURL("**/count/**");
  const pad = page.getByRole("button", { name: "Tap to count" });
  await pad.click();
  await pad.click();
  await pad.click();
  await expect(page.getByText("Completed — tap to keep going")).toBeVisible();
  await closeCelebration(page);

  // ---- now raise the bar to 6 ----------------------------------------------
  await page.click('button:has-text("Set my goal")');
  const goalInput = page.getByLabel("My daily goal for Salawat");
  await expect(goalInput).toBeVisible();
  await goalInput.fill("6");
  await page.getByRole("button", { name: "Save" }).click();
  // The dialog closes only once the write has LANDED, so this doubles as the
  // wait: navigating on the optimistic value alone let /today's read overtake
  // the write under a loaded machine, and the rings came back on the old
  // number with nothing on the way to correct them.
  await expect(page.getByRole("dialog")).toBeHidden();

  // The ring re-opens against MY number, and says whose number the other one is.
  await expect(page.getByText("of 6")).toBeVisible();
  await expect(page.getByText(/The circle asks/)).toBeVisible();
  await expect(page.getByText(/done, the rest is yours/)).toBeVisible();
  // Re-opened, so the primary action is back — and it fills to MY goal, not 3.
  await expect(page.getByRole("button", { name: "Mark done" })).toBeVisible();

  // ---- THE POINT: nothing already earned moved ------------------------------
  await page.goto("/today");
  await expect(
    page.getByText(
      /Your circle's share is done — 1 ring left on your own goal/,
    ),
  ).toBeVisible();
  // The streak counted this day at the circle's share and must STAY counted:
  // raising your goal cannot take back a day you already kept (D8).
  await expect(page.getByText("1 day streak")).toBeVisible();
  // ...and the ring reads against my goal while the share is flagged done.
  await expect(page.getByText("3 / 6")).toBeVisible();
  // `.` not `'`: the JSX renders a curly apostrophe (&rsquo;), so a straight
  // one in the pattern silently never matches.
  await expect(page.getByText(/circle.s share 3/)).toBeVisible();

  // A reload proves it is the server's view, not optimistic client state.
  await page.reload();
  await expect(page.getByText("1 day streak")).toBeVisible();
  await expect(page.getByText("3 / 6")).toBeVisible();

  // ---- closing the raised ring celebrates, once ----------------------------
  await page.click('a:has-text("Continue Salawat")');
  await page.waitForURL("**/count/**");
  await pad.click();
  await pad.click();
  await pad.click();
  await expect(page.getByText("Completed — tap to keep going")).toBeVisible();
  await closeCelebration(page);

  // ---- and dropping back to the circle's share clears it -------------------
  await page.click('button:has-text("My goal")');
  await page.getByRole("button", { name: /Back to the circle/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("of 3")).toBeVisible();
  await expect(page.getByText(/The circle asks/)).toBeHidden();

  await page.goto("/today");
  await expect(page.getByText(/All rings closed today/)).toBeVisible();
  await expect(page.getByText("1 day streak")).toBeVisible();
});

test("a goal below the circle's share is refused, not stored", async ({
  page,
}) => {
  await signIn(page, USER);
  await page.goto("/today");
  // The ring card, not the "Continue" CTA: the previous test left this ring
  // closed, and the gold CTA only exists while something is unfinished.
  await page
    .getByRole("link", { name: /Salawat/ })
    .first()
    .click();
  await page.waitForURL("**/count/**");

  // The whole raise-only rule in one gesture: ask for less than the circle
  // asked, and the app puts you back on the circle's number rather than
  // letting you owe it less.
  await page.click('button:has-text("Set my goal")');
  await page.getByLabel("My daily goal for Salawat").fill("1");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("of 3")).toBeVisible();
  await expect(page.getByText(/The circle asks/)).toBeHidden();
});
