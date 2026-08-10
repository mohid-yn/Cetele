import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Reminder settings (M8 / CET-11 / D30, rewritten for D62): a member writes a
 * reminder's NAME and picks its time. It belongs to them, not to a task or a
 * circle — which is the whole point: a member of three circles used to meet one
 * row per task, fifteen of them, none of which they had named.
 *
 * Push DELIVERY is not driven here — it needs a real push service and an OS
 * permission grant, neither of which Playwright can grant meaningfully. The
 * send path (claim → VAPID-signed encrypted push → 410 prune) is covered
 * against a real Postgres by pgTAP 007 plus a live dispatch run.
 */
const STAMP = Date.now();
const USER = `e2e-rem-${STAMP}@example.com`;

test.describe.configure({ mode: "serial" });

/**
 * Await the WRITE, not just the click. Every control here saves through a server
 * action, and `page.reload()` fired straight after one aborts it mid-flight —
 * which is exactly how this spec first went flaky: the toggle looked switched,
 * the reload raced the POST, and the reminder came back still enabled. Set the
 * promise up BEFORE the action so the response cannot land in between.
 */
const saved = (page: import("@playwright/test").Page) =>
  page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/profile") &&
      res.status() === 200,
  );

test("a member names their own reminder, and it persists", async ({ page }) => {
  await signIn(page, USER);

  // NO CIRCLE IS CREATED, deliberately. Under the old model this screen had
  // nothing to show until an admin had made a task; a reminder is now the
  // member's own, so it must work for somebody who has joined nothing.
  await page.goto("/profile");
  await expect(page.getByText("No reminders yet")).toBeVisible();

  await page.getByRole("button", { name: "Add a reminder" }).click();
  await page.getByLabel("Reminder name").fill("Evening dhikr");
  await page.getByLabel("Reminder time").fill("21:30");
  const created = saved(page);
  await page.getByRole("button", { name: "Save" }).click();
  await created;

  // stored 24h, shown 12h (D30)
  await expect(page.getByText("9:30 PM")).toBeVisible();
  await expect(page.getByText("No reminders yet")).toHaveCount(0);

  // …and it survives a reload (it's in Postgres, not component state)
  await page.reload();
  await expect(page.getByLabel("Reminder name")).toHaveValue("Evening dhikr");
  await expect(page.getByLabel("Reminder time")).toHaveValue("21:30");
  await expect(
    page.getByRole("switch", { name: "Reminder Evening dhikr" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("a second reminder, renamed and toggled, then removed", async ({
  page,
}) => {
  await signIn(page, USER);
  await page.goto("/profile");

  // THE SCALING CLAIM, made concrete: two reminders on one account, neither of
  // them belonging to any circle. This is what the old model could not express
  // at all — it could only ever have as many reminders as an admin had made
  // tasks, named whatever the admin had named them.
  await page.getByRole("button", { name: "Add a reminder" }).click();
  await page.getByLabel("Reminder name").last().fill("Morning wird");
  await page.getByLabel("Reminder time").last().fill("06:15");
  const created = saved(page);
  await page.getByRole("button", { name: "Save" }).click();
  await created;
  await expect(page.getByText("6:15 AM")).toBeVisible();

  // A row is addressed by its SWITCH, never by position: the list is ordered by
  // clock time, so after a reload 06:15 sorts above 21:30 and `.last()` would
  // quietly act on the other reminder. (It did, first time out — this test
  // renamed "Evening dhikr" and then failed hunting for it.) The name lives in
  // an input VALUE, so `hasText` cannot see it either.
  const rowFor = (label: string) =>
    page
      .locator("li")
      .filter({ has: page.getByRole("switch", { name: `Reminder ${label}` }) });

  // Renaming saves on blur, not per keystroke — a per-character write would
  // send one save for "M", "Mo", "Mor"… and let the last to land win.
  await rowFor("Morning wird").getByLabel("Reminder name").fill("Fajr wird");
  // Committed with the KEYBOARD, which acts on whatever has focus. A second
  // action through `rowFor("Morning wird")` would re-resolve the locator, and
  // by now it matches nothing: the typing already moved the row's own switch to
  // "Reminder Fajr wird". Enter is also the real gesture — it blurs the field,
  // and the blur is what saves.
  const renamed = saved(page);
  await page.keyboard.press("Enter");
  await renamed;
  await page.reload();
  await expect(rowFor("Fajr wird").getByLabel("Reminder name")).toHaveValue(
    "Fajr wird",
  );

  // Switching one off leaves the other alone — they are independent rows, not
  // two views of one setting.
  const toggled = saved(page);
  await rowFor("Fajr wird").getByRole("switch").click();
  await toggled;
  await page.reload();
  await expect(rowFor("Fajr wird").getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(rowFor("Evening dhikr").getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Removing is the member's own, and it is the only way one goes away.
  const removed = saved(page);
  await rowFor("Fajr wird").getByRole("button", { name: "Remove" }).click();
  await removed;
  await expect(rowFor("Fajr wird")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Reminder name")).toHaveValue("Evening dhikr");
});

test("a reminder needs a name — Save is not offered for a blank one", async ({
  page,
}) => {
  await signIn(page, USER);
  await page.goto("/profile");

  await page.getByRole("button", { name: "Add a reminder" }).click();
  // Guarded rather than left to fail: the RPC refuses a blank name out loud
  // (pgTAP 007), but a button whose only possible outcome is an error teaches
  // less than one that plainly isn't ready.
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await page.getByLabel("Reminder name").last().fill("   ");
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await page.getByLabel("Reminder name").last().fill("Witr");
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  // Cancel abandons the draft. Asserted by the Save button going away rather
  // than by the text "Witr", which never was text — it is an input VALUE, so a
  // getByText check here would have passed whether or not the draft survived.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect(page.getByLabel("Reminder name")).toHaveValue("Evening dhikr");
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

  // The rows stay VISIBLE (a reminder and its time are still information) but
  // are inert, because this member has no subscribed device anywhere — a switch
  // that saves a time nothing can deliver is the contradiction the install card
  // is already warning about.
  await expect(page.getByLabel("Reminder time")).toBeDisabled();
  await expect(
    page.getByRole("switch", { name: "Reminder Evening dhikr" }),
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
  await expect(page.getByLabel("Reminder time")).toBeEnabled();
  await expect(
    page.getByRole("switch", { name: "Reminder Evening dhikr" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Add a reminder" }),
  ).toBeEnabled();
});
