import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

const STAMP = Date.now();

test("a ring on Today counts where it is, and the taps reach the database", async ({
  page,
}) => {
  await signIn(page, `e2e-quick-${STAMP}@example.com`);
  await page.goto("/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", `Quick Circle ${STAMP}`);
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  for (const label of ["Salawat", "Istighfar"]) {
    await page.getByPlaceholder("Label (e.g. La ilaha illallah)").fill(label);
    await page.getByPlaceholder("Daily target").last().fill("3");
    await page.click('button:has-text("Add task")');
    await expect(page.getByText(label).first()).toBeVisible();
  }

  await page.goto("/today");
  await page.waitForURL("**/today");
  // The first visit syncs the timezone, which can move "today" under the screen,
  // so count on a screen the server has rendered for the member's own day.
  // It only fires once per account and at no fixed moment, so there is no single
  // response to wait on.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForLoadState("networkidle");
  const first = page.getByRole("button", { name: /^Add one to Salawat/ });
  const second = page.getByRole("button", { name: /^Add one to Istighfar/ });

  // Two taps in a row, without leaving, and straight on to the next ring.
  await first.click();
  await first.click();
  await second.click();
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByText("2 / 3")).toBeVisible();
  await expect(page.getByText("1 / 3")).toBeVisible();

  // The name still opens the full count screen.
  await expect(
    page.getByRole("link", { name: /Salawat/ }).first(),
  ).toBeVisible();

  // Closing a ring turns it inert, so an extra tap has nothing to land on.
  await first.click();
  await expect(page.getByText("3 / 3")).toBeVisible();
  await expect(first).toHaveCount(0);
  await expect(page).toHaveURL(/\/today/);
  // Past the 300ms batching window, so the other ring's tap has been sent too.
  await page.waitForTimeout(800);
  await page.waitForLoadState("networkidle");

  // A reload proves the writes landed, not just the optimistic display.
  await expect
    .poll(async () => {
      await page.reload();
      // The screen streams in, so wait for the rings before reading them.
      await page
        .getByText(/\d \/ 3/)
        .first()
        .waitFor();
      return page.getByText("3 / 3").count();
    })
    .toBe(1);
  await expect(page.getByText("1 / 3")).toBeVisible();
});
