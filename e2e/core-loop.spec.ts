import { test, expect, type Page } from "@playwright/test";

/**
 * The M3 core loop, end-to-end against the real local stack:
 * create group + task → /today rings from the DB → tap on /count/[taskId]
 * (optimistic + debounced increment_count flush) → ring closes → celebration →
 * back on /today the day reads complete and THE STREAK ADVANCED — persisted
 * across a reload (nothing lives in localStorage anymore).
 */
const MAILPIT = "http://127.0.0.1:54324";
const STAMP = Date.now();
const USER = `e2e-core-${STAMP}@example.com`;

test.describe.configure({ mode: "serial" });

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

test("tap → count persists → ring closes → streak advances", async ({
  page,
}) => {
  await signIn(page, USER);

  // fresh user: bare /today has no group to resolve, so it redirects to
  // /groups — the no-group home (CET-25; the old /today empty state is gone).
  await page.goto("/today");
  await page.waitForURL("**/groups");
  await expect(page.getByText("create one to get started")).toBeVisible();

  // create a group + one small task (target 3 keeps the loop quick)
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", "Core Circle");
  await page.click('button:has-text("Create group")');
  await page.click('a:has-text("Manage")');
  await page.waitForURL("**/group/manage");
  await page.getByPlaceholder("Label (e.g. La ilaha illallah)").fill("Salawat");
  await page.getByPlaceholder("Daily target").last().fill("3");
  await page.click('button:has-text("Add task")');
  await expect(page.getByText("target 3 / day")).toBeVisible();

  // /today now renders the ring from the DB, with the gold Continue CTA
  await page.goto("/today");
  await expect(
    page.getByText("A fresh page — start with one ring"),
  ).toBeVisible();
  await expect(page.getByText("0 day streak")).toBeVisible();
  await page.click('a:has-text("Continue Salawat")');
  await page.waitForURL("**/count/**");

  // tap the pad to the target — optimistic UI counts instantly
  const pad = page.getByRole("button", { name: "Tap to count" });
  await pad.click();
  await pad.click();
  await pad.click();
  await expect(page.getByText("Completed — tap to keep going")).toBeVisible();
  await expect(page.getByText("Ring closed!")).toBeVisible();

  // heading back waits for the debounced flush, so the DB has the count
  await page.click('button:has-text("Back to today")');
  await page.waitForURL("**/today");
  await expect(page.getByText(/All rings closed today/)).toBeVisible();
  await expect(page.getByText("1 day streak")).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();

  // nothing is local any more: a full reload serves the same truth from the DB
  await page.reload();
  await expect(page.getByText(/All rings closed today/)).toBeVisible();
  await expect(page.getByText("1 day streak")).toBeVisible();
});

test("back-fill: yesterday's ring can still be closed (D8)", async ({
  page,
}) => {
  await signIn(page, USER);

  // pick yesterday on the Today day strip → the count link carries ?date=
  await page.goto("/today");
  await page.getByRole("button", { name: /Yest\./ }).click();
  await expect(page.getByText("Catching up on")).toBeVisible();
  await page.click('a:has-text("Continue Salawat")');
  await page.waitForURL("**/count/**date=**");

  const pad = page.getByRole("button", { name: "Tap to count" });
  await pad.click();
  await pad.click();
  await pad.click();
  await expect(page.getByText("Ring closed!")).toBeVisible();
  await page.click('button:has-text("Back to today")');
  await page.waitForURL("**/today");

  // yesterday now shows as done on the strip (✓), streak untouched (1)
  await expect(page.getByText("1 day streak")).toBeVisible();
});
