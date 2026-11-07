import { test, expect, type Browser, type Page } from "@playwright/test";
import { makeSuperAdmin, openManageTab, signIn } from "./helpers";

/**
 * Branches and events (D79, D80), end to end: an organiser builds a branch, a
 * circle asks to join it and is approved, a camp and a weekly halaqah are
 * posted there, and a member answers, votes and asks a question, while a
 * circle outside the branch sees none of it.
 */
const STAMP = Date.now();
const ORGANISER = `e2e-events-org-${STAMP}@example.com`;
const MEMBER = `e2e-events-member-${STAMP}@example.com`;
const OUTSIDER = `e2e-events-out-${STAMP}@example.com`;
const ORG = `YN ${STAMP}`;
const CITY = `Melbourne ${STAMP}`;
const CIRCLE = `Events Circle ${STAMP}`;
const CAMP = `Winter camp ${STAMP}`;
const HALAQAH = `Thursday halaqah ${STAMP}`;

test.describe.configure({ mode: "serial" });

let organiser: Page;
let member: Page;
let campUrl = "";
// The city branch, where camps and halaqahs are posted FROM (D85).
let cityId = "";

async function pageFor(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, email);
  return page;
}

async function newCircle(page: Page, name: string) {
  await page.goto("/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", name);
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
}

/** "YYYY-MM-DDTHH:MM", `days` from now at `hour`, for a datetime-local input. */
function localInput(days: number, hour: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(hour)}:00`;
}

test.beforeAll(async ({ browser }) => {
  organiser = await pageFor(browser, ORGANISER);
  await makeSuperAdmin(ORGANISER);
  member = await pageFor(browser, MEMBER);
});

test("an organiser builds a branch tree", async () => {
  await organiser.goto("/admin/branches");
  await organiser.getByRole("button", { name: "New organisation" }).click();
  await organiser.fill("#branch-name", ORG);
  await organiser.getByRole("button", { name: "Create", exact: true }).click();
  await organiser.waitForURL(/\/admin\/branches\/[0-9a-f-]{36}$/);
  await expect(
    organiser.getByRole("heading", { level: 1, name: ORG }),
  ).toBeVisible();

  await organiser.getByRole("button", { name: "Add" }).click();
  await organiser.fill("#branch-name", CITY);
  await organiser.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    organiser.getByRole("heading", { level: 1, name: CITY }),
  ).toBeVisible();
  cityId = organiser.url().split("/").at(-1)!;
});

test("a circle asks to join, and the organiser approves it", async () => {
  await newCircle(member, CIRCLE);
  await openManageTab(member, "Settings");
  // One row on Settings (D85); the choices open from it.
  await member.getByRole("button", { name: /^Branch/ }).click();
  await member.selectOption("#branch-choice", { label: `${ORG} › ${CITY}` });
  await member.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(member.getByText("Waiting for approval")).toBeVisible();

  // Not in the branch yet, so nothing reaches it.
  await member.goto("/events");
  await expect(member.getByText("not in a branch yet")).toBeVisible();

  // Branches are folders (D85): the organisation says one is waiting inside it,
  // and the city, opened from inside, shows the request.
  await organiser.goto("/admin/branches");
  await organiser
    .getByRole("link", { name: new RegExp(`${ORG}.*1 waiting`) })
    .click();
  await organiser.getByRole("link", { name: new RegExp(CITY) }).click();
  await expect(organiser.getByText(CIRCLE)).toBeVisible();
  await organiser.getByRole("button", { name: "Approve" }).click();
  await expect(organiser.getByRole("button", { name: "Approve" })).toHaveCount(
    0,
  );
  await expect(
    organiser.getByRole("button", { name: "Remove" }).first(),
  ).toBeVisible();
});

test("a camp posted to the branch reaches the circle, with a one-tap answer", async () => {
  // Started from inside the branch, so the form never asks which (D85).
  await organiser.goto(`/admin/branches/${cityId}`);
  await organiser.getByRole("link", { name: /New camp/ }).click();
  await organiser.waitForURL(/\/admin\/events\/new\?branch=/);
  await expect(organiser.getByText(`For ${CITY}`)).toBeVisible();
  await organiser.fill("#camp-title", CAMP);
  await organiser.fill("#camp-venue", "Lake Eildon");
  await organiser.fill("#camp-starts", localInput(20, 10));
  await organiser.fill("#camp-ends", localInput(22, 14));
  await organiser.fill("#camp-capacity", "40");
  await organiser.getByRole("button", { name: /^Publish to 1 circle/ }).click();
  await organiser.waitForURL(/\/admin\/events\/[0-9a-f-]{36}$/);
  campUrl = organiser.url().replace("/admin/events/", "/events/");

  await member.goto("/events");
  const card = member.locator("li", { hasText: CAMP });
  await expect(card).toBeVisible();
  await expect(card.getByText("Lake Eildon")).toBeVisible();
  await card.getByRole("button", { name: "Going" }).click();
  await expect(card.getByText(/1\s+going/)).toBeVisible();
  // The buttons are disabled while the save is in flight; reloading before it
  // lands would race it.
  await expect(card.getByRole("button", { name: "Maybe" })).toBeEnabled();

  // It held: the answer is the server's, not just the button's.
  await member.reload();
  await expect(
    member
      .locator("li", { hasText: CAMP })
      .getByRole("button", { name: "Going" }),
  ).toHaveAttribute("aria-pressed", "true");

  // Names are the stewards': the organiser sees one person going.
  await organiser.goto(campUrl);
  await expect(organiser.getByText("For organisers")).toBeVisible();
  await expect(
    organiser
      .locator("section", { hasText: "For organisers" })
      .getByText("Going"),
  ).toBeVisible();
});

test("a circle outside the branch sees nothing, not even by link", async ({
  browser,
}) => {
  const outsider = await pageFor(browser, OUTSIDER);
  await newCircle(outsider, `Outside ${STAMP}`);
  await outsider.goto("/events");
  await expect(outsider.getByText(CAMP)).toHaveCount(0);
  // A streamed page cannot change its status once the loading shell is sent,
  // so the check is what renders: the not-found screen, and no venue.
  await outsider.goto(campUrl);
  await expect(
    outsider.getByText(/could not be found|not found/i),
  ).toBeVisible();
  await expect(outsider.getByText("Lake Eildon")).toHaveCount(0);
  await expect(outsider.getByText(CAMP)).toHaveCount(0);
  await outsider.context().close();
});

test("a weekly halaqah: Today asks for a vote, and questions are anonymous", async () => {
  await organiser.goto(`/admin/events/series/new?branch=${cityId}`);
  await organiser.fill("#series-title", HALAQAH);
  await organiser.fill("#series-venue", "Masjid");
  await organiser.getByRole("button", { name: /^Publish to/ }).click();
  await organiser.waitForURL(/\/admin\/events\/series\/[0-9a-f-]{36}$/);

  // The first session, from the halaqah's own "Coming weeks" (D85).
  await organiser
    .locator("section", { hasText: "Coming weeks" })
    .getByRole("link")
    .first()
    .click();
  await organiser.waitForURL(/\/events\/[0-9a-f-]{36}$/);
  const sessionUrl = organiser.url();

  await organiser.getByRole("button", { name: "New poll" }).click();
  await organiser.getByRole("tab", { name: "Food" }).click();
  await organiser.fill("#poll-question", "What should we eat?");
  await organiser.getByLabel("Option 1").fill("Pizza");
  await organiser.getByLabel("Option 2").fill("Curry");
  await organiser.getByRole("button", { name: "Post poll" }).click();
  await expect(organiser.getByText("What should we eat?")).toBeVisible();

  // Today: the one actionable line, below the rings.
  await member.goto("/today");
  const upNext = member.getByRole("region", { name: "Up next" });
  await expect(upNext).toBeVisible();
  await expect(upNext.getByText("Have your say")).toBeVisible();
  await upNext.getByRole("link").first().click();
  await member.waitForURL(/\/events\/[0-9a-f-]{36}/);

  await member.getByRole("button", { name: /Curry/ }).click();
  await expect(member.getByText("1 vote")).toBeVisible();

  await member
    .getByLabel("Your question")
    .fill("How do we keep a habit going?");
  await member.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(member.getByText("How do we keep a habit going?")).toBeVisible();
  await expect(member.getByText("Yours")).toBeVisible();

  // The host's view: the question, and no way to tell who asked.
  await organiser.goto(sessionUrl);
  const question = organiser.locator("li", {
    hasText: "How do we keep a habit going?",
  });
  await expect(question).toBeVisible();
  await expect(question.getByText("Yours")).toHaveCount(0);
  await question.getByRole("button", { name: "Mark answered" }).click();
  await expect(question.getByText("Answered")).toBeVisible();
});
