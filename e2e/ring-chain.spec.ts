import { test, expect } from "@playwright/test";
import { closesDay, signIn } from "./helpers";

/**
 * Closing a ring moves on to the next open one, all the way through the day (D71).
 *
 * The first version carried one next ring in the URL, so a three-ring day walked
 * one step, dropped the member on Today with a ring still open, and every test
 * still passed because each circle in them had a single task. This circle has
 * three on purpose.
 */
const USER = `e2e-chain-${Date.now()}@example.com`;
const RINGS = ["Tahlil", "Tasbih", "Tahmid"];

test.describe.configure({ mode: "serial" });

test("the day walks ring to ring, then the card marks it closing", async ({
  page,
}) => {
  await signIn(page, USER);
  await page.goto("/today");
  await page.waitForURL("**/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", "Chain Circle");
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  for (const label of RINGS) {
    await page.getByPlaceholder("Label (e.g. La ilaha illallah)").fill(label);
    await page.getByPlaceholder("Daily target").last().fill("3");
    await page.click('button:has-text("Add task")');
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  await page.goto("/today");
  await page.click('a:has-text("Continue")');
  await page.waitForURL("**/count/**");

  // Every ring in turn, with no stop on Today in between. Asserted as a set
  // because the order is Today's to choose, and the tasks have none (see the note
  // on the rings there).
  const seen = new Set<string>();
  for (let step = 0; step < RINGS.length; step++) {
    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toHaveText(new RegExp(RINGS.join("|")));
    const name = (await title.textContent()) ?? "";
    expect(seen.has(name), `${name} came round twice`).toBe(false);
    seen.add(name);

    await page.getByRole("button", { name: "Mark done" }).click();
    if (step < RINGS.length - 1) {
      await expect(title).not.toHaveText(name);
      expect(page.url()).toContain("/count/");
    }
  }
  expect(seen.size).toBe(RINGS.length);

  // The last one ends on Today, and that is the one moment that stops.
  await closesDay(page);
  await expect(page.getByText(/All rings closed today/)).toBeVisible();

  // Once. Coming back to a finished day is not closing it again.
  await page.reload();
  await expect(page.getByText(/All rings closed today/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Alhamdulillah" })).toHaveCount(
    0,
  );
});

test("opening a finished day on another device shows no card", async ({
  browser,
}) => {
  // A fresh context has none of this browser's storage, which is the point: the
  // card marks the moment of closing, and nothing was closed here.
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, USER);
  await page.goto("/today");
  await expect(page.getByText(/All rings closed today/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Alhamdulillah" })).toHaveCount(
    0,
  );
  await context.close();
});
