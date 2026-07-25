import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Reminder settings (M8 / CET-11 / D30): a member sets a per-task clock time and
 * an on/off toggle, and it persists.
 *
 * Push DELIVERY is not driven here — it needs a real push service and an OS
 * permission grant, neither of which Playwright can grant meaningfully. The
 * send path (claim → VAPID-signed encrypted push → 410 prune) is covered
 * against a real Postgres by pgTAP 007 plus a live dispatch run.
 */
const STAMP = Date.now();
const USER = `e2e-rem-${STAMP}@example.com`;

test.describe.configure({ mode: "serial" });

test("a member sets a per-task reminder time, and it persists", async ({
  page,
}) => {
  await signIn(page, USER);

  // a circle with one task
  await page.goto("/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", `Reminder Circle ${STAMP}`);
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  await page.getByPlaceholder("Label (e.g. La ilaha illallah)").fill("Salawat");
  await page.getByPlaceholder("Target").fill("100");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Salawat")).toBeVisible();

  // Profile → the task shows up with a reminder row, off by default
  await page.goto("/profile");
  const toggle = page.getByRole("switch", { name: "Reminder for Salawat" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  // The row saves optimistically on EVERY interaction, so setting a time and
  // flipping the toggle are two separate writes. Await each one: waiting for
  // "a POST" after both would match the first and let the reload abort the
  // second mid-flight.
  const savedAction = () =>
    page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/profile") &&
        res.status() === 200,
    );

  const timeSaved = savedAction();
  await page.getByLabel("Reminder time for Salawat").fill("07:45");
  await timeSaved;

  const toggleSaved = savedAction();
  await toggle.click();
  await toggleSaved;

  await expect(toggle).toHaveAttribute("aria-checked", "true");
  // stored 24h, shown 12h (D30)
  await expect(page.getByText("7:45 AM")).toBeVisible();

  // …and it survives a reload (it's in Postgres, not component state)
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Reminder for Salawat" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("7:45 AM")).toBeVisible();
  await expect(page.getByLabel("Reminder time for Salawat")).toHaveValue(
    "07:45",
  );
});

/**
 * iOS delivers Web Push ONLY to a Home-Screen install, so an iPhone browser tab
 * must be offered the install steps — never a "Turn on" button that cannot work.
 * This shipped broken: the old check concluded "iOS needs installing" only when
 * `PushManager` was ABSENT, but iOS 16.4+ exposes it in ordinary tabs, so every
 * condition passed and the dead toggle rendered.
 *
 * The UA is the only lever Playwright has here (it cannot emulate Apple's push
 * behaviour), which is exactly the input the decision is made from: a real
 * iPhone tab differs only in that `PushManager` may also be missing, and both
 * paths lead to the same branch.
 */
test("iOS in a browser tab is coached to install, not shown a dead push toggle", async ({
  browser,
}) => {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await signIn(page, USER);
  await page.goto("/profile");

  // The install steps, in place of the toggle.
  await expect(
    page.getByText("Add Cetele to your Home Screen first"),
  ).toBeVisible();
  await expect(page.getByText("Add to Home Screen")).toBeVisible();

  // And emphatically no push control: this is the whole point.
  await expect(page.getByRole("button", { name: /^Turn on$/ })).toHaveCount(0);
  await expect(page.getByText("Reminders on this device")).toHaveCount(0);

  // The rows stay VISIBLE (the task and its time are still information) but are
  // inert, because this member has no subscribed device anywhere — a switch that
  // saves a time nothing can deliver is the contradiction the install card is
  // already warning about.
  await expect(page.getByLabel("Reminder time for Salawat")).toBeDisabled();
  await expect(
    page.getByRole("switch", { name: "Reminder for Salawat" }),
  ).toBeDisabled();
  await expect(
    page.getByText("No device can receive reminders yet"),
  ).toBeVisible();

  await context.close();
});

/**
 * And the other half of the gate: where push genuinely works the toggle appears
 * AND the rows stay live, even before anything is subscribed — this device is one
 * tap from being the device that receives, so disabling them here would be the
 * opposite mistake (gating something that does work).
 */
test("a push-capable browser still gets the reminder toggle and live rows", async ({
  page,
}) => {
  await signIn(page, USER);
  await page.goto("/profile");
  await expect(page.getByText("Reminders on this device")).toBeVisible();
  await expect(
    page.getByText("Add Cetele to your Home Screen first"),
  ).toHaveCount(0);
  await expect(page.getByLabel("Reminder time for Salawat")).toBeEnabled();
  await expect(
    page.getByRole("switch", { name: "Reminder for Salawat" }),
  ).toBeEnabled();
});
