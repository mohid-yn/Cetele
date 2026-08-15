import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Linked tasks — one act, counted in every circle that asked for it (0034, D64).
 *
 * Owner: "if he has one car he can update both groups by just toggling car off
 * on one group."
 *
 * THE ASSERTION THAT CARRIES IT is the third test: one tap in circle A, and
 * circle B's ring has moved without the member ever opening it. Everything
 * before it could pass against a build that stored the link faithfully and then
 * never fanned anything out — the suggestion would appear, the cluster would
 * render, and the member would still be logging the same sitting twice.
 *
 * The two labels differ by a COUNT ("Salawat" / "Salawat ×100"), because that is
 * both the case the matcher exists for and the case D64 is about: the same act,
 * asked for in different amounts by two circles. The raw count travels; what
 * each circle asks for stays its own, which is why circle B ends the run at
 * 3 of 10 rather than complete.
 *
 * Not covered here, and covered in pgTAP 019 instead, because a browser cannot
 * manufacture the state: the cluster merge, the dormancy rule (a circle the
 * member has left), the admin's proxy log fanning out, and the per-task cap.
 */
const STAMP = Date.now();
const USER = `e2e-link-${STAMP}@example.com`;

test.describe.configure({ mode: "serial" });

let alpha = "";
let beta = "";

/** Create a circle with one task; returns its groupId (from the URL). */
async function createCircle(
  page: Page,
  name: string,
  task: string,
): Promise<string> {
  await page.goto("/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", name);
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  await page.getByPlaceholder("Label (e.g. La ilaha illallah)").fill(task);
  await page.getByPlaceholder("Daily target").last().fill("10");
  await page.click('button:has-text("Add task")');
  await expect(page.getByText("target 10 · daily")).toBeVisible();

  const groupId = page.url().match(/\/g\/([^/]+)\//)?.[1];
  expect(groupId).toBeTruthy();
  return groupId!;
}

test("two circles, both asking for salawat", async ({ page }) => {
  await signIn(page, USER);
  alpha = await createCircle(page, `Link Alpha ${STAMP}`, "Salawat");
  beta = await createCircle(page, `Link Beta ${STAMP}`, "Salawat ×100");
});

test("the pair is offered, and linking it takes the offer away", async ({
  page,
}) => {
  await signIn(page, USER);
  await page.goto("/profile");

  // Offered, never automatic — the link does not exist until this is pressed.
  await expect(page.getByText("These look like the same thing")).toBeVisible();
  await page
    .getByRole("button", { name: "Link Salawat with Salawat ×100" })
    .click();

  await expect(page.getByText("One act, two circles")).toBeVisible();
  // And the pair stops being offered, because it is already one act.
  await expect(page.getByText("These look like the same thing")).toHaveCount(0);
});

test("THE ONE THAT CARRIES IT: one tap, both circles", async ({ page }) => {
  await signIn(page, USER);
  await page.goto(`/g/${alpha}/today`);
  await page.click('a:has-text("Continue Salawat")');
  await page.waitForURL("**/count/**");

  // Numbers must not move in a circle the member was not looking at without
  // the screen saying so (D51/D61's standing rule).
  await expect(page.getByText(/Also counts toward/)).toBeVisible();
  await expect(page.getByText(/Link Beta .* · Salawat ×100/)).toBeVisible();

  // The pad is optimistic and the write is debounced (600ms), so waiting for the
  // Server Action's own response is what makes this deterministic — the
  // assertions below read server-rendered pages, which cannot catch up a flush
  // that lands after they render.
  const flushed = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.status() === 200,
  );
  const pad = page.getByRole("button", { name: "Tap to count" });
  await pad.click();
  await pad.click();
  await pad.click();
  await flushed;

  await page.goto(`/g/${alpha}/today`);
  await expect(
    page.getByRole("main").getByText("3 / 10").first(),
  ).toBeVisible();

  // The circle the member never opened. A build that stored the link and did
  // not fan out fails HERE, and only here.
  await page.goto(`/g/${beta}/today`);
  await expect(
    page.getByRole("main").getByText("3 / 10").first(),
  ).toBeVisible();
});

test("unlinking stops the fan-out", async ({ page }) => {
  await signIn(page, USER);
  await page.goto("/profile");

  // Removing either side of a pair dissolves the whole cluster (the RPC's
  // rule — a cluster of one fans out to nothing).
  await page.getByRole("button", { name: "Unlink Salawat ×100" }).click();
  await expect(page.getByText("One act, two circles")).toHaveCount(0);
  // …and the pair is offered again, because it is no longer one act.
  await expect(page.getByText("These look like the same thing")).toBeVisible();

  await page.goto(`/g/${alpha}/today`);
  await page.click('a:has-text("Continue Salawat")');
  await page.waitForURL("**/count/**");
  await expect(page.getByText(/Also counts toward/)).toHaveCount(0);

  const flushed = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.status() === 200,
  );
  await page.getByRole("button", { name: "Tap to count" }).click();
  await flushed;

  await page.goto(`/g/${alpha}/today`);
  await expect(
    page.getByRole("main").getByText("4 / 10").first(),
  ).toBeVisible();

  // Circle B kept the three it was given and did not take the fourth.
  await page.goto(`/g/${beta}/today`);
  await expect(
    page.getByRole("main").getByText("3 / 10").first(),
  ).toBeVisible();
});
