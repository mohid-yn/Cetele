import { test, expect, type Page } from "@playwright/test";

/**
 * CET-26 — the two acceptance tests CET-25 called for and never wrote.
 *
 * 1. "prefetch → instant switch": switching circle via the switcher must be
 *    served from a payload Next fetched AHEAD of the click. This is the entire
 *    point of path-based group routing (a cookie-driven active group could not
 *    be prefetched — every screen sat at the same URL), and nothing guarded it:
 *    dropping `<Link>` prefetching, or reintroducing a Server-Action round-trip,
 *    would have gone unnoticed.
 *
 * 2. "deep-link to /g/<id>/today": a circle is reachable by a shareable URL, and
 *    a circle you are NOT in redirects to /groups. pgTAP covers the RLS at the
 *    DB layer; this covers it end-to-end through the route.
 *
 * The prefetch assertion is deliberately made on OBSERVABLE behaviour — a real
 * network request for the other circle's URL, issued before any click, plus a
 * navigation that keeps the same document — rather than on Next internals. The
 * flake that CET-25's own prefetching caused (sw.js caching per-user RSC
 * payloads → D39) is the reason not to reach into the framework here.
 */
const MAILPIT = "http://127.0.0.1:54324";
const STAMP = Date.now();
const OWNER = `e2e-route-a-${STAMP}@example.com`;
const OUTSIDER = `e2e-route-b-${STAMP}@example.com`;

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
  // Creating a circle lands you straight in its Manage screen (CET-30).
  await page.waitForURL("**/group/manage");
  await page.getByPlaceholder("Label (e.g. La ilaha illallah)").fill(task);
  await page.getByPlaceholder("Daily target").last().fill("10");
  await page.click('button:has-text("Add task")');
  await expect(page.getByText("target 10 / day")).toBeVisible();

  const groupId = page.url().match(/\/g\/([^/]+)\//)?.[1];
  expect(groupId).toBeTruthy();
  return groupId!;
}

test("prefetch → switching circle is served from a prefetched payload", async ({
  page,
}) => {
  await signIn(page, OWNER);
  const alpha = await createCircle(page, "Alpha Circle", "Tasbih");
  const beta = await createCircle(page, "Beta Circle", "Salawat");

  // Sit on Alpha's Today.
  await page.goto(`/g/${alpha}/today`);
  await expect(page.getByText("Continue Tasbih")).toBeVisible();

  // Record every request Next makes for BETA's Today. A prefetch is a real GET
  // for that URL carrying Next's RSC marker — so it is visible from the outside,
  // with no framework introspection.
  const betaRequests: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes(`/g/${beta}/today`)) betaRequests.push(url);
  });

  // Open the switcher: its <Link>s mount here, and Next prefetches them.
  await page.getByRole("button", { name: /Alpha Circle|Select group/ }).click();
  const betaLink = page.getByRole("option", { name: /Beta Circle/ });
  await expect(betaLink).toBeVisible();

  // THE ACCEPTANCE CRITERION: Beta's Today was fetched BEFORE we clicked it.
  // Setting prefetch={false} on the switcher's links makes this fail.
  await expect
    .poll(() => betaRequests.length, { timeout: 5_000 })
    .toBeGreaterThan(0);

  // Mark the document. A client-side navigation keeps it; a full round-trip
  // (a Server Action redirect, or a plain <a>) would blow it away.
  await page.evaluate(() => {
    (window as unknown as { __sameDoc: boolean }).__sameDoc = true;
  });

  await betaLink.click();
  await page.waitForURL(`**/g/${beta}/today`);
  await expect(page.getByText("Continue Salawat")).toBeVisible();
  await expect(page.getByText("Tasbih")).toHaveCount(0);

  // Same document → the switch was a client-side navigation into the payload
  // Next had already fetched, not a cold server round-trip.
  const sameDoc = await page.evaluate(
    () => (window as unknown as { __sameDoc?: boolean }).__sameDoc === true,
  );
  expect(sameDoc).toBe(true);
});

test("deep-link: a circle URL is shareable, and a stranger is turned away", async ({
  browser,
}) => {
  // Self-contained: its own owner and circle, so this test never depends on
  // what another one happened to leave behind.
  const owner = `e2e-route-c-${STAMP}@example.com`;
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await signIn(pageA, owner);
  const gid = await createCircle(pageA, "Deep Circle", "Istighfar");
  const deepUrl = `/g/${gid}/today`;

  // The owner reaches the circle by URL alone — a fresh session, no cookie, no
  // prior visit: exactly what a shared link is.
  const fresh = await (await browser.newContext()).newPage();
  await signIn(fresh, owner);
  await fresh.goto(deepUrl);
  await expect(fresh).toHaveURL(new RegExp(`/g/${gid}/today`));
  await expect(fresh.getByText("Continue Istighfar")).toBeVisible();

  // A member of no circle follows the same link → RLS says the group does not
  // exist for them, and the route sends them to their own /groups (no leak: they
  // never learn whether it is real).
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signIn(pageB, OUTSIDER);
  await pageB.goto(deepUrl);
  await pageB.waitForURL("**/groups");
  await expect(pageB.getByText("Start your first circle")).toBeVisible();
  await expect(pageB.getByText("Deep Circle")).toHaveCount(0);
});
