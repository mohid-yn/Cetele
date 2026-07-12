import { test, expect, type Page } from "@playwright/test";

/**
 * Reminder settings (M8 / CET-11 / D30): a member sets a per-task clock time and
 * an on/off toggle, and it persists.
 *
 * Push DELIVERY is not driven here — it needs a real push service and an OS
 * permission grant, neither of which Playwright can grant meaningfully. The
 * send path (claim → VAPID-signed encrypted push → 410 prune) is covered
 * against a real Postgres by pgTAP 007 plus a live dispatch run.
 */
const MAILPIT = "http://127.0.0.1:54324";
const STAMP = Date.now();
const USER = `e2e-rem-${STAMP}@example.com`;

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

test("a member sets a per-task reminder time, and it persists", async ({
  page,
}) => {
  await signIn(page, USER);

  // a circle with one task
  await page.goto("/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", `Reminder Circle ${STAMP}`);
  await page.click('button:has-text("Create group")');
  await page.click('a:has-text("Manage")');
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
