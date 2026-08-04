import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * A member changes their own display name from /profile.
 *
 * The assertion that carries this is NOT the heading on /profile — an
 * optimistic local update would satisfy that with nothing written. It is the
 * name appearing on the GROUP roster, which is a different server render
 * reading `profiles.name` through a join, reached by client-side nav so the
 * Router Cache is in the path. That is what `revalidatePath("/", "layout")` is
 * there for, and it is the half that would break silently.
 */
const STAMP = Date.now();
const USER = `e2e-name-${STAMP}@example.com`;
const NEW_NAME = `Aisha Rahman ${STAMP}`;

test.describe.configure({ mode: "serial" });

test("a member renames themselves, and it reaches the screens that show the name", async ({
  page,
}) => {
  await signIn(page, USER);

  // A circle, so the name has somewhere to render other than /profile.
  await page.goto("/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", `Name Circle ${STAMP}`);
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");

  await page.goto("/profile");
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  // Deliberately padded: the action trims, and the heading must show what was
  // STORED rather than what was typed.
  await page.getByLabel("Your name").fill(`   ${NEW_NAME}   `);
  await page.getByRole("button", { name: "Save" }).click();

  const heading = page.getByRole("heading", { level: 1, name: NEW_NAME });
  await expect(heading).toBeVisible();

  // Survives a reload: proves the write landed, not just the optimistic state.
  await page.reload();
  await expect(heading).toBeVisible();

  // …and reaches a screen rendered by a different route. In-app nav, not
  // `goto`: a hard navigation would refetch everything regardless and prove
  // nothing about the revalidate.
  await page.getByRole("link", { name: "Group", exact: true }).click();
  await page.getByRole("tab", { name: "Members" }).click();
  await expect(
    page.getByRole("button", { name: `See ${NEW_NAME}'s last 14 days` }),
  ).toBeVisible();
});

test("an empty name is refused, and the stored one survives", async ({
  page,
}) => {
  // Re-signed in per test: serial mode fixes the order, not the page.
  await signIn(page, USER);
  await page.goto("/profile");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Your name").fill("   ");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Your name can't be empty.")).toBeVisible();
  // The editor stays open on a refusal — closing it would look like a save.
  await expect(page.getByLabel("Your name")).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: NEW_NAME }),
  ).toBeVisible();
});
