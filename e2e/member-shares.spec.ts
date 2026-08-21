import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Per-member shares (0032, D61).
 *
 * Owner: "need admins ability to increase the goals for specific users."
 *
 * A cetele is a shared goal SPLIT between people, and the split is not always
 * equal. An admin can now ask more of one member than the circle's default, and
 * that number is an OBLIGATION — what "done" means for them, what their streak
 * is judged at, and what the circle counts on them for.
 *
 * The assertions that carry the feature are the ones on the MEMBER's own screen
 * and on the collective bar. Everything else here could pass against a build
 * that stored the share faithfully and then ignored it: the admin's editor would
 * look right, the row would read 50, and the member would still be handed a ring
 * of 10.
 *
 * The as-of property — that raising somebody today cannot un-keep the days they
 * already kept — is not testable here inside a single calendar day; pgTAP 018
 * manufactures the history and asserts it against `private.obligations` directly.
 */
const STAMP = Date.now();
const OWNER = `e2e-shr-owner-${STAMP}@example.com`;
const MEMBER = `e2e-shr-member-${STAMP}@example.com`;
const memberName = MEMBER.split("@")[0];

test.describe.configure({ mode: "serial" });

let inviteLink = "";

async function signOut(page: Page) {
  await page.goto("/profile");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("/");
}

/** Open the member's breakdown from the Members roster, freshly signed in. */
async function openBreakdown(page: Page) {
  await signIn(page, OWNER);
  await page.goto("/group");
  await page.getByRole("tab", { name: "Members" }).click();
  await page
    .getByRole("button", { name: `See ${memberName}'s last 14 days` })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("a circle of two, on the circle's own number", async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto("/today");
  await page.waitForURL("**/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", "Share Circle");
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  await expect(page.getByText("Add people")).toBeVisible();

  await page.fill('input[aria-label="New task label"]', "Salawat");
  await page.fill('input[aria-label="New task daily target"]', "10");
  await page.click('button:has-text("Add task")');
  await expect(page.getByText("Salawat")).toBeVisible();

  inviteLink = await page
    .locator("code", { hasText: "/join/" })
    .first()
    .innerText();
  await signOut(page);
});

test("the member joins and carries the circle's default", async ({ page }) => {
  await signIn(page, MEMBER);
  await page.goto(inviteLink);
  await page.getByRole("button", { name: /Accept|Join/i }).click();
  await page.waitForURL("**/today**");

  // The baseline the raise below is measured against.
  await expect(
    page.getByRole("main").getByText("0 / 10").first(),
  ).toBeVisible();
  await signOut(page);
});

test("the collective bar starts at target × members", async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto("/group");
  // Two members, 10 each — the sum and the old product agree while the split
  // is even, which is exactly why the next test is the one that matters.
  await expect(page.getByText("0 of 20 toward today’s goal")).toBeVisible();
  await signOut(page);
});

test("a share below the circle's is refused out loud", async ({ page }) => {
  await openBreakdown(page);
  await page.getByRole("tab", { name: "Their share" }).click();

  await page.getByLabel("Salawat").fill("4");
  await page.getByRole("button", { name: "Save" }).click();

  // Refused, and SAID so — greatest() would have ignored it silently, which is
  // the shape D51 records as "a rule the member never learns".
  await expect(page.getByText(/can only be higher, never lower/)).toBeVisible();
  await signOut(page);
});

test("the admin raises the member's share", async ({ page }) => {
  await openBreakdown(page);
  await page.getByRole("tab", { name: "Their share" }).click();

  await page.getByLabel("Salawat").fill("50");
  await page.getByRole("button", { name: "Save" }).click();

  // Reconciled from the write itself (D45) — reopening reads it back from the
  // database rather than from anything this page kept in memory.
  await page.reload();
  await page.getByRole("tab", { name: "Members" }).click();
  await page
    .getByRole("button", { name: `See ${memberName}'s last 14 days` })
    .click();
  await page.getByRole("tab", { name: "Their share" }).click();
  await expect(page.getByLabel("Salawat")).toHaveValue("50");
  await signOut(page);
});

test("THE ONE THAT CARRIES IT: the member's own ring now asks 50", async ({
  page,
}) => {
  await signIn(page, MEMBER);
  await page.goto("/today");

  // Their obligation moved, on their own screen, without them touching
  // anything. A build that stored the share and ignored it fails here.
  await expect(
    page.getByRole("main").getByText("0 / 50").first(),
  ).toBeVisible();
  await expect(page.getByRole("main").getByText("0 / 10")).toHaveCount(0);
  await signOut(page);
});

test("THE SECOND NEGATIVE: the collective bar is the SUM, not the product", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.goto("/group");

  // 50 + 10 = 60. `target × members` would still read 20 — a bar the circle
  // fills three times over — and `raised × members` would read 100, which
  // nobody in it is being asked for.
  await expect(page.getByText("0 of 60 toward today’s goal")).toBeVisible();
});

test("THE WAY OUT: the breakdown closes on a phone, with no keyboard and no backdrop", async ({
  page,
}) => {
  // Reported from an iPhone: "cant exit once in the admin logger on phone."
  // This dialog passes no footer, so its only exits were ESC — a hardware
  // keyboard — and the backdrop, which a full-height card reduces to a ~16px
  // sliver at the top and bottom of the screen. A phone viewport is the whole
  // point of the test: on a desktop the card is short and the backdrop is
  // enormous, which is why this was invisible for so long.
  await page.setViewportSize({ width: 390, height: 844 });
  await openBreakdown(page);

  const close = page.getByRole("dialog").getByRole("button", { name: "Close" });
  await expect(close).toBeVisible();

  // Clicked BELOW the painted 36px button, inside its 44px `tap-area-44-box`
  // overhang — one click that proves both that the control is there and that
  // it is a real thumb target, not a 36px square.
  const box = (await close.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height + 2);

  await expect(page.getByRole("dialog")).toBeHidden();
});
