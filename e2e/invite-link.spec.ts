import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers";

async function signOut(page: Page) {
  await page.goto("/profile");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("/");
}

/**
 * The default, regenerable, member-level invite link (0022).
 *
 * Owner: "i dont like how you can create invites and revoke them make it so
 * theres a default invite that can be made and it can be regenerated its only a
 * member level invite so admins can only be made manually".
 *
 * The assertion that carries the feature is the NEGATIVE one: after
 * regenerating, the OLD code must not join anyone. A regenerate that mints a
 * new code while quietly leaving the old row alive would look identical on
 * screen — new link in the box, copy button works — and would silently keep
 * the door open for everyone the admin was trying to lock out. That is the
 * whole reason the control exists, so it is the thing worth pinning.
 */
const STAMP = Date.now();
const OWNER = `e2e-inv-owner-${STAMP}@example.com`;
const JOINER = `e2e-inv-joiner-${STAMP}@example.com`;

test.describe.configure({ mode: "serial" });

/**
 * Sign the owner back in and open Manage. Every test gets a fresh page — serial
 * mode fixes the ORDER, it does not carry the session — so each one re-signs
 * in, as the rest of this suite does.
 *
 * The readiness wait is load-bearing: this screen streams, and for a beat after
 * navigation the only thing on the page is the circle name. An assertion that
 * fires immediately reads the skeleton and reports the control as missing
 * rather than as late.
 */
async function openManage(page: Page) {
  await signIn(page, OWNER);
  await page.goto(manageUrl);
  await expect(page.getByText("Add people")).toBeVisible();
}

/** The /join/CODE path shown in the manage screen's copy field. */
async function readLink(page: Page) {
  const text = await page
    .locator("code", { hasText: "/join/" })
    .first()
    .innerText();
  expect(text).toMatch(/\/join\/[0-9A-F]{8}$/);
  return text;
}

let firstLink = "";
let secondLink = "";
let manageUrl = "";

test("a new circle already owns exactly one open link", async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto("/today");
  await page.waitForURL("**/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", "Invite Circle");
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  manageUrl = page.url();
  await expect(page.getByText("Add people")).toBeVisible();

  // Nothing was clicked to make it: it came with the circle.
  firstLink = await readLink(page);

  // Exactly one — the old model listed every invite, and a second open row is
  // refused by a partial unique index, so more than one here is a real break.
  await expect(page.locator("code", { hasText: "/join/" })).toHaveCount(1);

  // There is no way to revoke it.
  await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Regenerate" })).toBeVisible();
});

test("no invite can grant admin — the role control is gone from the form", async ({
  page,
}) => {
  await openManage(page);

  // The invite form used to carry a member/co-admin toggle. Admins are made in
  // the members list now, so the only role control on this screen belongs to a
  // member row — never to the invite form.
  const inviteCard = page
    .locator("div")
    .filter({ hasText: /Invite one person/ })
    .last();
  await expect(inviteCard.getByRole("radio", { name: /admin/i })).toHaveCount(
    0,
  );
  await expect(inviteCard.getByText(/co-admin/i)).toHaveCount(0);
});

test("regenerating mints a new link and KILLS the old one", async ({
  page,
}) => {
  await openManage(page);

  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  // Confirmed, because every already-shared copy dies at once.
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Regenerate link" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect
    .poll(async () => (await readLink(page)) !== firstLink, {
      message: "the link on screen should change after regenerating",
    })
    .toBe(true);
  secondLink = await readLink(page);
  expect(secondLink).not.toBe(firstLink);

  // Still exactly one.
  await expect(page.locator("code", { hasText: "/join/" })).toHaveCount(1);
  await signOut(page);
});

test("the OLD code no longer joins anyone; the new one does", async ({
  page,
}) => {
  await signIn(page, JOINER);

  // The dead link must not be a way in. `lookup_invite` returns no row, so the
  // page reports the code rather than offering an Accept button.
  await page.goto(firstLink);
  await expect(page.getByRole("button", { name: /Accept|Join/i })).toHaveCount(
    0,
  );

  // The live one works, and lands the joiner as a MEMBER.
  await page.goto(secondLink);
  await page.getByRole("button", { name: /Accept|Join/i }).click();
  await page.waitForURL("**/today**");
  await expect(page.getByText("Invite Circle")).toBeVisible();
});
