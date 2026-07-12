import { test, expect, type Page } from "@playwright/test";

/**
 * Leaving a circle (CET-27 follow-up — /privacy has always promised it).
 *
 * owner creates a circle + open invite → a second user joins → the joiner leaves
 * from Group → Members → they land on /groups and the circle is gone from their
 * list, while the OWNER is offered transfer-or-delete instead of a Leave button
 * (RLS refuses an owner's leave, so nobody can strand a circle by walking out).
 */
const MAILPIT = "http://127.0.0.1:54324";
const STAMP = Date.now();
const OWNER = `e2e-leave-owner-${STAMP}@example.com`;
const JOINER = `e2e-leave-joiner-${STAMP}@example.com`;
const CIRCLE = `Leave Circle ${STAMP}`;

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

async function signOut(page: Page) {
  await page.goto("/profile");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("/");
}

test("owner creates a circle and an open invite", async ({ page }) => {
  await signIn(page, OWNER);

  await page.goto("/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", CIRCLE);
  await page.click('button:has-text("Create group")');
  await expect(page.getByText(CIRCLE)).toBeVisible();

  await page.click('a:has-text("Manage")');
  await page.waitForURL("**/group/manage");

  await page.click('button:has-text("Create invite")');
  await expect(page.getByText("Open link — anyone can join")).toBeVisible();
  const joinLink = await page
    .locator("code", { hasText: "/join/" })
    .first()
    .innerText();
  expect(joinLink).toMatch(/\/join\/[0-9A-F]{8}$/);
  process.env.E2E_LEAVE_JOIN_LINK = joinLink;

  // The owner is told to transfer or delete — never offered a Leave button.
  await page.goto("/groups");
  await page.getByText(CIRCLE).click();
  await page.waitForURL(/\/g\/.*\/today/);
  await page.goto(page.url().replace("/today", "/group"));
  await page.getByRole("tab", { name: "Members" }).click();
  await expect(page.getByText("You own this circle")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Leave this circle" }),
  ).toHaveCount(0);

  await signOut(page);
});

test("a member leaves: the circle disappears from their list", async ({
  page,
}) => {
  const joinPath = new URL(process.env.E2E_LEAVE_JOIN_LINK!).pathname;

  await signIn(page, JOINER);
  await page.goto(joinPath);
  await page.click('button:has-text("Join the group")');
  await page.waitForURL(/\/g\/.*\/today/);

  // Group → Members → Leave (a plain member can't open Manage, so this is the
  // only place it can live).
  await page.goto(page.url().replace("/today", "/group"));
  await page.getByRole("tab", { name: "Members" }).click();
  // ("2 members" also renders in the header — scope to the section heading)
  await expect(page.getByRole("heading", { name: "2 members" })).toBeVisible();

  await page.getByRole("button", { name: "Leave this circle" }).click();
  await page.getByRole("button", { name: "Leave", exact: true }).click();

  // Booted back to the circles home, and the circle is no longer theirs.
  await page.waitForURL("/groups");
  await expect(page.getByText(CIRCLE)).toHaveCount(0);

  await signOut(page);
});

test("the circle survives, back to one member", async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto("/groups");

  await expect(page.getByText(CIRCLE)).toBeVisible();
  await expect(page.getByText("1 member", { exact: true })).toBeVisible();

  await signOut(page);
});
