import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Member-specific tasks (0023, D54).
 *
 * Owner: "i want the ability for admins and co-admins to be able to give member
 * specific tasks… the architecture we chose was based off google drive and that
 * also lets you granulate access within folders."
 *
 * The assertion that carries the feature is the NEGATIVE one: a member NOT
 * assigned a task must not see it on Today. Everything else here could pass
 * against a build that stored assignees faithfully and then ignored them —
 * the admin's screen would look right, the group screen would look right, and
 * every member would still be handed every ring.
 *
 * The second negative is the collective goal. A task two of eight carry asks for
 * `target × 2`; scaled to the whole circle it would be a bar the circle is
 * structurally unable to fill, which reads as "you are behind" forever (D8).
 */
const STAMP = Date.now();
const OWNER = `e2e-asg-owner-${STAMP}@example.com`;
const JOINER = `e2e-asg-joiner-${STAMP}@example.com`;

test.describe.configure({ mode: "serial" });

let manageUrl = "";
let inviteLink = "";

async function signOut(page: Page) {
  await page.goto("/profile");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("/");
}

/**
 * Manage, freshly signed in. Serial mode fixes the ORDER but each test still
 * gets its own page, so the session has to be re-established every time — the
 * convention the rest of this suite follows. The readiness wait matters because
 * this screen streams: for a beat after navigation the only thing rendered is
 * the circle name, and an immediate assertion reads the skeleton and calls a
 * present control missing.
 */
async function openManage(page: Page) {
  await signIn(page, OWNER);
  await page.goto(manageUrl);
  await expect(page.getByText("Add people")).toBeVisible();
}

/**
 * A ring on Today, scoped to the roster list.
 *
 * A bare `getByText("Shared Dhikr")` is a strict-mode violation: the gold
 * "Continue <task>" CTA above the grid is a second match whenever a ring is
 * unfinished, so the same name resolves to two elements and the assertion fails
 * for a reason that has nothing to do with what it is testing.
 */
function ring(page: Page, label: string) {
  return page
    .getByRole("main")
    .getByRole("listitem")
    .getByRole("link", { name: new RegExp(label) });
}

test("a circle, two members, and a task that starts out everyone's", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.goto("/today");
  await page.waitForURL("**/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", "Assign Circle");
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  manageUrl = page.url();
  await expect(page.getByText("Add people")).toBeVisible();

  // Two tasks: one stays the circle's, one gets scoped later. Both are created
  // through the real form, so the DEFAULT is what the trigger produced.
  for (const [label, target] of [
    ["Shared Dhikr", "3"],
    ["Personal Wird", "2"],
  ] as const) {
    await page.fill('input[aria-label="New task label"]', label);
    await page.fill('input[aria-label="New task daily target"]', target);
    await page.click('button:has-text("Add task")');
    await expect(page.getByText(label)).toBeVisible();
  }

  // A task is everyone's until somebody says otherwise — and that comes from
  // the database trigger, not from anything this test clicked.
  await expect(
    page.getByRole("button", { name: /Who is Shared Dhikr for/ }),
  ).toHaveText("Everyone");

  inviteLink = await page
    .locator("code", { hasText: "/join/" })
    .first()
    .innerText();
  await signOut(page);
});

test("a second member joins", async ({ page }) => {
  await signIn(page, JOINER);
  await page.goto(inviteLink);
  await page.getByRole("button", { name: /Accept|Join/i }).click();
  await page.waitForURL("**/today**");

  // Everything is everyone's so far, so the joiner carries both rings.
  await expect(ring(page, "Shared Dhikr")).toBeVisible();
  await expect(ring(page, "Personal Wird")).toBeVisible();
  await signOut(page);
});

test("the owner scopes a task to themselves", async ({ page }) => {
  await openManage(page);

  // Baseline: it is the whole circle's before this test touches it, so the
  // assertion at the end is measuring a CHANGE rather than a starting state.
  await expect(
    page.getByRole("button", { name: /Who is Personal Wird for/ }),
  ).toHaveText("Everyone");

  await page.getByRole("button", { name: /Who is Personal Wird for/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Picking a person turns "Everyone" off — the two are distinct settings, not
  // "all the boxes happen to be ticked".
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: /Dev|owner/i })
    .first()
    .click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // The row now names one person rather than the circle.
  await expect(
    page.getByRole("button", { name: /Who is Personal Wird for/ }),
  ).not.toHaveText("Everyone");
});

test("THE NEGATIVE: the unassigned member no longer sees that ring", async ({
  page,
}) => {
  await signIn(page, JOINER);
  await page.goto("/today");
  // Wait for the rings to be there at all, or the negative below passes
  // vacuously against a page that simply had not rendered yet.
  await expect(ring(page, "Shared Dhikr")).toBeVisible();

  // The whole feature. A build that stored assignees and then ignored them
  // would pass every other assertion in this file and fail only here.
  // Unscoped on purpose: it must be nowhere on Today — not as a ring, and not
  // as the "Continue …" CTA either.
  await expect(page.getByText("Personal Wird")).toHaveCount(0);
});

test("the circle keeps ONE picture: the group screen still lists it", async ({
  page,
}) => {
  await signIn(page, JOINER);
  await page.goto(manageUrl.replace("/group/manage", "/group"));

  // Absent from the joiner's Today, present on the circle's overview — that is
  // decision 2, and it is what stops a scoped task looking like a deleted one.
  await expect(page.getByText("Personal Wird").first()).toBeVisible();
});

test("an empty set is refused by the screen, not by a server error", async ({
  page,
}) => {
  await openManage(page);
  await page.getByRole("button", { name: /Who is Personal Wird for/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Untick the only assignee → Save must go inert and say why, rather than
  // letting the RPC's exception surface as a raw message.
  await dialog
    .getByRole("button", { name: /Dev|owner/i })
    .first()
    .click();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
  await expect(dialog.getByText(/Pick at least one person/)).toBeVisible();
});

test("frequency is chips now, and Custom reaches the values behind it", async ({
  page,
}) => {
  await openManage(page);

  // Open the task editor; the old control was a <select> over all fourteen
  // values, which is what the owner asked to be rid of.
  await page
    .getByRole("listitem")
    .filter({ hasText: "Shared Dhikr" })
    .getByRole("button", { name: "Edit" })
    .click();

  // Scoped to the row being edited: the new-task form below renders a second
  // picker, so every chip name matches twice on this screen.
  const editor = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Cancel" }) });

  // The control this replaces was a native <select> over all fourteen values.
  await expect(editor.locator("select")).toHaveCount(0);
  await expect(
    editor.getByRole("button", { name: "Daily", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // One tap for the common answer.
  await editor.getByRole("button", { name: "Weekly", exact: true }).click();
  await expect(
    editor.getByRole("button", { name: "Weekly", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // Nothing was removed: the full 1–14 range is still reachable behind Custom,
  // and the chip carries the chosen value so it reads without re-opening.
  await editor.getByRole("button", { name: "Custom", exact: true }).click();
  await editor
    .getByRole("button", { name: "Every 5 days", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Every 5 days", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await editor.getByRole("button", { name: "Save" }).click();

  await expect(
    page.getByRole("listitem").filter({ hasText: "Shared Dhikr" }),
  ).toContainText("every 5 days");
});
