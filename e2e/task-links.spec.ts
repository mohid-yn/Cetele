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
 * never fanned anything out — the offer would appear, the row would render, and
 * the member would still be logging the same sitting twice.
 *
 * The offer and the link live on the task's own row in "My goals" (D66), not on
 * /profile: "is this the same thing I already do for my other circle?" is a
 * question about a TASK, asked while looking at it.
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
let gamma = "";

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

/** Open "My goals" for a circle — where a link is offered and made (D66). */
async function openGoals(page: Page, groupId: string) {
  await page.goto(`/g/${groupId}/today`);
  await page.getByRole("button", { name: "My goals" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/**
 * Open the link pane for a task — the dialog's second view.
 *
 * The row itself carries only the count now; a row cannot hold a list of
 * circles, two 44px controls each, and stay a row.
 */
async function openLinks(page: Page, groupId: string, task: string) {
  await openGoals(page, groupId);
  await page
    .getByRole("button", {
      name: new RegExp(`^${task} — (counts in \\d+ circles, manage|link)`),
    })
    .click();
  await expect(
    page.getByRole("heading", { name: /Counts in \d+ circle/ }),
  ).toBeVisible();
}

test("three circles, all asking for salawat", async ({ page }) => {
  await signIn(page, USER);
  alpha = await createCircle(page, `Link Alpha ${STAMP}`, "Salawat");
  beta = await createCircle(page, `Link Beta ${STAMP}`, "Salawat ×100");
  // Deliberately a name the MATCHER WILL NOT GUESS. It scores 0 against
  // "Salawat", so under D66 — where the single fuzzy suggestion was the only
  // link that could be made — this circle was unreachable. The pane offers
  // every cross-circle task regardless of what it is called, and the test below
  // links it.
  gamma = await createCircle(page, `Link Gamma ${STAMP}`, "Durood Shareef");
});

test("the row is a doorway; the pane is where the link is made", async ({
  page,
}) => {
  await signIn(page, USER);
  await openLinks(page, alpha, "Salawat");

  // Offered, never automatic — the link does not exist until this is pressed.
  await page
    .getByRole("button", {
      name: /Also count Salawat in Link Beta .* as Salawat ×100/,
    })
    .click();

  // The pane now counts BOTH circles…
  await expect(
    page.getByRole("heading", { name: "Counts in 2 circles" }),
  ).toBeVisible();
  // …and stops offering that one, because the two are already one act.
  await expect(
    page.getByRole("button", { name: /Also count Salawat in Link Beta/ }),
  ).toHaveCount(0);
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
  await openLinks(page, alpha, "Salawat");

  // Removing either side of a pair dissolves the whole cluster (the RPC's
  // rule — a cluster of one fans out to nothing).
  await page
    .getByRole("button", { name: /Stop counting Salawat in Link Beta/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Counts in 1 circle" }),
  ).toBeVisible();
  // …and it is offered again, because it is no longer one act.
  await expect(
    page.getByRole("button", {
      name: /Also count Salawat in Link Beta .* as Salawat ×100/,
    }),
  ).toBeVisible();

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

test("THREE circles in one cluster, including one the matcher never suggested", async ({
  page,
}) => {
  await signIn(page, USER);
  // Alpha is unlinked again by the test above, and holds 4; beta 3, gamma 0.
  await openLinks(page, alpha, "Salawat");
  await expect(
    page.getByRole("heading", { name: "Counts in 1 circle" }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: /Also count Salawat in Link Beta .* as Salawat ×100/,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Counts in 2 circles" }),
  ).toBeVisible();

  // THE ONE THE OLD UI COULD NOT REACH. "Durood Shareef" scores 0 against
  // "Salawat", so D66's single fuzzy suggestion never offered it and there was
  // no other way in — the RPC would have taken the pair all along. It carries
  // no Match badge here; it is offered because the member is in that circle,
  // which is the only qualification that was ever needed.
  await page
    .getByRole("button", {
      name: /Also count Salawat in Link Gamma .* as Durood Shareef/,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Counts in 3 circles" }),
  ).toBeVisible();

  // One tap, three circles. A build that linked pairwise without MERGING the
  // clusters (0034's `link_tasks`) fails here: gamma would stay at 0.
  await page.goto(`/g/${alpha}/today`);
  await page.click('a:has-text("Continue Salawat")');
  await page.waitForURL("**/count/**");
  const flushed = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.status() === 200,
  );
  await page.getByRole("button", { name: "Tap to count" }).click();
  await flushed;

  await page.goto(`/g/${alpha}/today`);
  await expect(
    page.getByRole("main").getByText("5 / 10").first(),
  ).toBeVisible();
  await page.goto(`/g/${beta}/today`);
  await expect(
    page.getByRole("main").getByText("4 / 10").first(),
  ).toBeVisible();
  await page.goto(`/g/${gamma}/today`);
  await expect(
    page.getByRole("main").getByText("1 / 10").first(),
  ).toBeVisible();
});
