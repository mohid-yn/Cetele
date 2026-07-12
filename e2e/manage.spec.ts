import { test, expect, type Page } from "@playwright/test";

/**
 * The M2 loop, end-to-end against the real local stack:
 * owner creates a group → manage screen (tasks CRUD, rename) → creates an
 * open invite → a SECOND user joins via /join/[code] (incl. the signed-out
 * ?next= round-trip) → owner promotes then removes them. Exercises the D34/D35
 * join model and the 0007 RLS surface through the real UI.
 */
const MAILPIT = "http://127.0.0.1:54324";
const STAMP = Date.now();
const OWNER = `e2e-owner-${STAMP}@example.com`;
const JOINER = `e2e-joiner-${STAMP}@example.com`;

test.describe.configure({ mode: "serial" });

/** Magic-link sign-in via Mailpit (same flow the M1 spec verifies). */
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

async function signOut(page: Page) {
  await page.goto("/profile");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("/");
}

test("owner: create group → manage → tasks → open invite", async ({ page }) => {
  await signIn(page, OWNER);

  // create the group
  await page.goto("/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", "M2 Circle");
  await page.click('button:has-text("Create group")');
  await expect(page.getByText("M2 Circle")).toBeVisible();

  // open the real manage screen (sets the active-group cookie)
  await page.click('a:has-text("Manage")');
  await page.waitForURL("**/group/manage");
  await expect(page.getByRole("heading", { name: "Manage" })).toBeVisible();

  // task CRUD: add
  await page.getByPlaceholder("Label (e.g. La ilaha illallah)").fill("Salawat");
  await page.getByPlaceholder("Subtitle (optional)").fill("اللهم صل على محمد");
  await page.getByPlaceholder("Daily target").last().fill("100");
  await page.click('button:has-text("Add task")');
  await expect(page.getByText("target 100 / day")).toBeVisible();

  // task CRUD: edit the target — scope to the edit row (Settings has its own
  // always-visible Save button, so a bare "Save" is ambiguous)
  await page.click('button:has-text("Edit")');
  const editRow = page.locator('li:has(input[placeholder="Daily target"])');
  await editRow.getByPlaceholder("Daily target").fill("33");
  await editRow.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("target 33 / day")).toBeVisible();

  // rename the group (the header echoes the new name after revalidation)
  await page.fill("#group-name", "M2 Circle Renamed");
  await page
    .locator("section", { hasText: "Group name" })
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByText("M2 Circle Renamed").first()).toBeVisible();

  // create an OPEN invite (reusable, D35) and capture its /join link
  await page.click('button:has-text("Create invite")');
  await expect(page.getByText("Open link — anyone can join")).toBeVisible();
  const joinLink = await page
    .locator("code", { hasText: "/join/" })
    .first()
    .innerText();
  expect(joinLink).toMatch(/\/join\/[0-9A-F]{8}$/);

  // stash it for the joiner test
  process.env.E2E_JOIN_LINK = joinLink;

  await signOut(page);
});

test("joiner: signed-out invite link → ?next= → sign in → accept → member", async ({
  page,
}) => {
  const joinLink = process.env.E2E_JOIN_LINK!;
  const joinPath = new URL(joinLink).pathname;

  // opening the link signed out gates to login, carrying ?next=
  await page.goto(joinPath);
  await expect(page).toHaveURL(`/?next=${encodeURIComponent(joinPath)}`);

  // sign in via magic link → lands back on the join page
  await page.fill('input[type="email"]', JOINER);
  await page.click('button:has-text("Email me a magic link")');
  await expect(page.getByText("Check your email")).toBeVisible();
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const list = await (
          await fetch(`${MAILPIT}/api/v1/search?query=to:${JOINER}&limit=1`)
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
  await page.waitForURL(`**${joinPath}`);

  // the invite preview → accept → membership created
  await expect(
    page.getByText("You’ve been invited to M2 Circle Renamed"),
  ).toBeVisible();
  await page.click('button:has-text("Join the group")');
  await page.waitForURL("**/groups");
  await expect(page.getByText("M2 Circle Renamed")).toBeVisible();
  await expect(page.getByText("2 members")).toBeVisible();

  // re-opening the link as a member is a friendly no-op
  await page.goto(joinPath);
  await expect(
    page.getByText("You’re already in M2 Circle Renamed"),
  ).toBeVisible();

  await signOut(page);
});

test("owner: promote the joiner to co-admin, then remove them", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.goto("/groups");
  await page.click('a:has-text("Manage")');
  await page.waitForURL("**/group/manage");

  // the joiner shows up in Members — scope to their row (the invite form has
  // its own RoleToggle, and task rows have their own Remove buttons)
  await expect(page.getByText("Members (2)")).toBeVisible();
  const joinerRow = page.locator("li", { hasText: `e2e-joiner-${STAMP}` });

  // promote → co-admin
  await joinerRow
    .getByRole("button", { name: "Co-admin", exact: true })
    .click();
  await expect(
    joinerRow.getByRole("button", { name: "Co-admin", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // remove them (confirm dialog)
  await joinerRow.getByRole("button", { name: "Remove", exact: true }).click();
  await page.click('button:has-text("Remove from group")');
  await expect(page.getByText("Members (1)")).toBeVisible();

  await signOut(page);
});
