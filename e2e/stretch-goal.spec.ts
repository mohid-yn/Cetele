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
 *
 * The control is driven from TODAY — "My goals" on the rings heading, one
 * dialog for the whole circle. It moved there from the count screen's
 * correction tray because the owner, who asked for the feature and knew it had
 * shipped, could not find it while looking for it. These specs therefore also
 * pin the entry point itself: `openGoals` failing is the discoverability
 * regression, not an incidental selector change.
 */
const STAMP = Date.now();
const USER = `e2e-goal-${STAMP}@example.com`;

test.describe.configure({ mode: "serial" });

async function closeCelebration(page: Page) {
  await expect(page.getByText("Ring closed!")).toBeVisible();
  await page.getByRole("dialog").click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

/** Open the circle-wide goals dialog from Today. */
async function openGoals(page: Page) {
  await page.getByRole("button", { name: "My goals" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/**
 * Set one task's goal and commit. The dialog closes only once every write has
 * LANDED, so this doubles as the wait: saving optimistically and navigating let
 * Today's read overtake the write under a loaded machine, and the rings came
 * back on the old number with nothing on the way to correct them.
 */
async function setGoal(page: Page, task: string, value: string) {
  await page.getByLabel(task, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Save" }).click();
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
  await expect(page.getByText("target 3 · daily")).toBeVisible();

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

  // Head back IN-APP, never `page.goto`: the tap queue flushes on a 600ms
  // debounce with a best-effort dispatch on unmount, and a hard navigation
  // tears the JS context down before either can land — the three taps are then
  // silently lost and every assertion below fails against a count of 0.
  // Client-side nav runs the unmount flush, which is also the real user's path.
  await page.click('button:has-text("Back to today")');
  await page.waitForURL("**/today");
  await expect(page.getByText(/All rings closed today/)).toBeVisible();
  await expect(page.getByText("1 day streak")).toBeVisible();

  // ---- now raise the bar to 6, from Today -----------------------------------
  await openGoals(page);
  // The dialog names the floor rather than making the member guess it, and
  // states the rule the whole feature turns on.
  await expect(page.getByText(/The circle asks/)).toBeVisible();
  await setGoal(page, "Salawat", "6");

  // ---- THE POINT: nothing already earned moved ------------------------------
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

  // A reload proves it is the server's view, not optimistic client state — and
  // that the write landed before the dialog closed.
  await page.reload();
  await expect(page.getByText("1 day streak")).toBeVisible();
  await expect(page.getByText("3 / 6")).toBeVisible();

  // ---- the count screen honours the goal it no longer sets -------------------
  await page.click('a:has-text("Continue Salawat")');
  await page.waitForURL("**/count/**");
  // The ring re-opens against MY number, and says whose number the other one is.
  await expect(page.getByText("of 6")).toBeVisible();
  await expect(page.getByText(/The circle asks/)).toBeVisible();
  await expect(page.getByText(/done, the rest is yours/)).toBeVisible();
  // Re-opened, so the primary action is back — and it fills to MY goal, not 3.
  await expect(page.getByRole("button", { name: "Mark done" })).toBeVisible();
  // The goal is no longer EDITABLE here: one entry point, on Today.
  await expect(page.getByRole("button", { name: /my goal/i })).toBeHidden();

  // The day-strip must STILL tick today. This strip is a record of days kept,
  // and raising a bar cannot un-keep a day already kept — keying it on the
  // goal silently un-ticked every past day the moment a goal went up, which
  // reads as history being erased.
  //
  // Selected via aria-pressed, not by name: the cell READS "TODAY" only because
  // of a CSS text-transform, and Playwright computes the accessible name from
  // the DOM text ("Today 31"), so a /TODAY/ pattern silently matches nothing.
  // The header's Back-to-Today button would also collide on the name.
  await expect(page.locator('button[aria-pressed="true"] svg')).toHaveCount(1);

  // ---- closing the raised ring celebrates, once ----------------------------
  await pad.click();
  await pad.click();
  await pad.click();
  await expect(page.getByText("Completed — tap to keep going")).toBeVisible();
  await closeCelebration(page);

  // ---- and the per-row reset drops back to the circle's share ---------------
  await page.click('button:has-text("Back to today")');
  await page.waitForURL("**/today");
  await openGoals(page);
  await page.getByRole("button", { name: /Back to the circle/ }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect(page.getByText(/All rings closed today/)).toBeVisible();
  await expect(page.getByText("1 day streak")).toBeVisible();
  await page
    .getByRole("link", { name: /Salawat/ })
    .first()
    .click();
  await page.waitForURL("**/count/**");
  await expect(page.getByText("of 3")).toBeVisible();
  await expect(page.getByText(/The circle asks/)).toBeHidden();
});

test("a goal below the circle's share is refused, not stored", async ({
  page,
}) => {
  await signIn(page, USER);
  await page.goto("/today");

  // The whole raise-only rule in one gesture: ask for less than the circle
  // asked, and the app puts you back on the circle's number rather than
  // letting you owe it less. It must be VISIBLE that it did so — silently
  // ignoring the number is what makes the control read as broken.
  await openGoals(page);
  await setGoal(page, "Salawat", "1");

  await page
    .getByRole("link", { name: /Salawat/ })
    .first()
    .click();
  await page.waitForURL("**/count/**");
  await expect(page.getByText("of 3")).toBeVisible();
  await expect(page.getByText(/The circle asks/)).toBeHidden();
});

test("a goal above the cap is refused in the dialog, not by the server", async ({
  page,
}) => {
  await signIn(page, USER);
  await page.goto("/today");
  await openGoals(page);

  // set_task_goal caps a goal at greatest(target×10, target+1000) — 1,003 on a
  // target-3 task. Past it the dialog must refuse and STAY OPEN with the
  // problem named against the row it belongs to; closing on a value the server
  // will reject is the failure mode this pins.
  await page.getByLabel("Salawat", { exact: true }).fill("99999");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/Up to 1,003 on this one/)).toBeVisible();

  // Correcting the row clears its error rather than leaving it stuck.
  await page.getByLabel("Salawat", { exact: true }).fill("600");
  await expect(page.getByText(/Up to 1,003 on this one/)).toBeHidden();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("on a phone, a circle with many tasks can still reach Save", async ({
  page,
}) => {
  // The reported-by-measurement bug: `Dialog` had no max-height and its
  // container is `fixed inset-0` centring its child, so an oversized card
  // overflowed in BOTH directions with nothing able to scroll it. Measured on
  // a 6-task circle at 390x844: the card was 901px tall, Save sat at y=852-896
  // — off-screen — and `elementFromPoint` at its centre returned null. A member
  // in an ordinary six-dhikr cetele could not save their goals AT ALL.
  //
  // The assertion is deliberately the HIT TEST, not visibility: a button can be
  // "visible" to Playwright and still have nothing on top of it to click.
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, USER);

  // Six tasks is an ordinary cetele, not a stress case.
  await page.goto("/groups");
  await page.click('a:has-text("Manage")');
  await page.waitForURL("**/group/manage");
  for (const label of ["Tahlil", "Tasbih", "Tahmid", "Takbir", "Hawqala"]) {
    await page.getByPlaceholder("Label (e.g. La ilaha illallah)").fill(label);
    await page.getByPlaceholder("Daily target").last().fill("33");
    await page.click('button:has-text("Add task")');
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  await page.goto("/today");
  await openGoals(page);

  const save = page.getByRole("button", { name: "Save" });
  const box = (await save.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(844);

  // Nothing is covering it, and it is the element the tap actually lands on.
  const landsOnSave = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x as number, y as number)
        ?.closest("button")
        ?.textContent?.trim() ?? null,
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(landsOnSave).toBe("Save");

  // The list scrolls inside the card, so the LAST row is reachable too — a cap
  // that simply clipped the overflow would pass the assertions above.
  const lastInput = page.getByLabel("Hawqala", { exact: true });
  await lastInput.scrollIntoViewIfNeeded();
  await lastInput.fill("99");
  await save.click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("0 / 99")).toBeVisible();
});

test("a goal above 500 can still be closed in one press", async ({ page }) => {
  await signIn(page, USER);
  await page.goto("/today");
  await page
    .getByRole("link", { name: /Salawat/ })
    .first()
    .click();
  await page.waitForURL("**/count/**");
  await expect(page.getByText("of 600")).toBeVisible();

  // `increment_count` refuses any single delta over 500 (D36a), and a personal
  // goal legitimately clears that bar — a target-3 task allows a goal of 1,003.
  // "Mark done" used to send the whole remainder as ONE op, so it came back
  // `delta out of range (1..500)` with the count snapping back. The queue now
  // splits it; this proves the split lands as one total, not a partial write.
  await page.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText("Ring closed!")).toBeVisible();
  await page.getByRole("dialog").click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("delta out of range")).toBeHidden();

  // The whole 600 survives a round-trip — so every chunk landed, in order.
  await page.reload();
  await expect(page.getByText("600", { exact: true })).toBeVisible();
  await expect(page.getByText("of 600")).toBeVisible();
});
