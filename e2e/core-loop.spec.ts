import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * The M3 core loop, end-to-end against the real local stack:
 * create group + task → /today rings from the DB → tap on /count/[taskId]
 * (optimistic + debounced increment_count flush) → ring closes → celebration →
 * back on /today the day reads complete and THE STREAK ADVANCED — persisted
 * across a reload (nothing lives in localStorage anymore).
 */
const STAMP = Date.now();
const USER = `e2e-core-${STAMP}@example.com`;

test.describe.configure({ mode: "serial" });

/**
 * Wait for the ring-close celebration, then tap it away. It's a full-screen
 * modal that only self-dismisses after 4.2s, so clicking straight through to
 * the page underneath just races that timer (the click gets intercepted and
 * retried until the card clears) — which is what made these specs flaky.
 */
async function closeCelebration(page: Page) {
  await expect(page.getByText("Ring closed!")).toBeVisible();
  await page.getByRole("dialog").click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("tap → count persists → ring closes → streak advances", async ({
  page,
}) => {
  await signIn(page, USER);

  // fresh user: bare /today has no group to resolve, so it redirects to
  // /groups — the no-group home (CET-25; the old /today empty state is gone).
  await page.goto("/today");
  await page.waitForURL("**/groups");
  await expect(page.getByText("Start your first circle")).toBeVisible();

  // create a group + one small task (target 3 keeps the loop quick)
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", "Core Circle");
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  await page.getByPlaceholder("Label (e.g. La ilaha illallah)").fill("Salawat");
  await page.getByPlaceholder("Daily target").last().fill("3");
  await page.click('button:has-text("Add task")');
  await expect(page.getByText("target 3 · daily")).toBeVisible();

  // /today now renders the ring from the DB, with the gold Continue CTA
  await page.goto("/today");
  await expect(
    page.getByText("A fresh page — start with one ring"),
  ).toBeVisible();
  await expect(page.getByText("0 day streak")).toBeVisible();
  await page.click('a:has-text("Continue Salawat")');
  await page.waitForURL("**/count/**");

  // tap the pad to the target — optimistic UI counts instantly
  const pad = page.getByRole("button", { name: "Tap to count" });
  await pad.click();
  await pad.click();
  await pad.click();
  await expect(page.getByText("Completed — tap to keep going")).toBeVisible();
  await closeCelebration(page);

  // heading back waits for the debounced flush, so the DB has the count
  await page.click('button:has-text("Back to today")');
  await page.waitForURL("**/today");
  await expect(page.getByText(/All rings closed today/)).toBeVisible();
  await expect(page.getByText("1 day streak")).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();

  // nothing is local any more: a full reload serves the same truth from the DB
  await page.reload();
  await expect(page.getByText(/All rings closed today/)).toBeVisible();
  await expect(page.getByText("1 day streak")).toBeVisible();
});

test("back-fill: yesterday's ring can still be closed (D8)", async ({
  page,
}) => {
  await signIn(page, USER);

  // pick yesterday on the Today day strip → the count link carries ?date=
  await page.goto("/today");
  await page.getByRole("button", { name: /Yest\./ }).click();
  await expect(page.getByText("Catching up on")).toBeVisible();
  await page.click('a:has-text("Continue Salawat")');
  await page.waitForURL("**/count/**date=**");

  const pad = page.getByRole("button", { name: "Tap to count" });
  await pad.click();
  await pad.click();
  await pad.click();
  await closeCelebration(page);
  await page.click('button:has-text("Back to today")');
  await page.waitForURL("**/today");

  // yesterday now shows as done on the strip (✓), and the repaired day joins
  // the chain retroactively — back-filling FEEDS the streak (D48): 2 days.
  await expect(page.getByText("2 day streak")).toBeVisible();
});

test("correcting down: undo one, then set an exact count", async ({ page }) => {
  await signIn(page, USER);

  // Today's ring is closed (3/3) from the first spec — open it from the roster.
  // Scoped to the list, not the link's name: the gold "Continue <task>" CTA is
  // a second match whenever the ring is incomplete, and the roster link's
  // accessible name picks up the ring's own text ("3 Salawat 3 / 3"), so
  // neither a bare nor an anchored name match is stable across both states.
  await page.goto("/today");
  await page
    .getByRole("main")
    .getByRole("listitem")
    .getByRole("link", { name: /Salawat/ })
    .click();
  await page.waitForURL("**/count/**");
  const ring = page.getByRole("progressbar");
  await expect(ring).toHaveAttribute("aria-valuenow", "3");

  // −1 takes back a stray tap and reopens the ring
  await page.getByRole("button", { name: "Undo one count" }).click();
  await expect(ring).toHaveAttribute("aria-valuenow", "2");
  await expect(page.getByText("Tap anywhere to count")).toBeVisible();

  // it is a real write, not just optimistic UI: a reload serves 2 from the DB.
  //
  // DRAIN THE QUEUE FIRST. The assertion above is satisfied by the OPTIMISTIC
  // paint — undo is a `set` op on the same serialized FIFO queue as taps, and
  // the displayed count is `replay(confirmed, pendingOps)` by design (§4), so
  // the ring reads 2 while `set_count` is still in flight. `page.reload()` is a
  // hard navigation and tears the JS context down, exactly like the
  // `page.goto()` hazard §7 documents — caught it doing so and coming back
  // reading **3**, i.e. the undo lost outright. Latent since 2026-07-25: undo
  // used to be pessimistic (two awaited round-trips), so the paint itself
  // proved the write had landed and this reload was safe. The optimistic
  // rewrite invalidated that assumption and the spec was never updated, which
  // is why this line has been the suite's most-blamed "flake" (§7).
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "2",
  );

  // correcting DOWN never takes back a streak already earned (D48)
  await page.goto("/today");
  await expect(page.getByText("2 day streak")).toBeVisible();

  // the exact editor sets a number outright — and landing on the target closes
  // the ring for real, celebration and all
  await page
    .getByRole("main")
    .getByRole("listitem")
    .getByRole("link", { name: /Salawat/ })
    .click();
  await page.waitForURL("**/count/**");
  await page.click('button:has-text("Edit count")');
  await page.getByRole("dialog").getByRole("spinbutton").fill("3");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  // the editor closes first, so the celebration is the only dialog left — two
  // at once would make `closeCelebration`'s locator ambiguous under strict mode
  await expect(page.getByRole("dialog", { name: "Edit count" })).toBeHidden();
  await closeCelebration(page);
  await expect(page.getByText("Completed — tap to keep going")).toBeVisible();

  // Same drain as above: `Edit count` is a `set` op on that same queue, so the
  // closed ring and the celebration are both optimistic and prove nothing about
  // what reached Postgres.
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "3",
  );
});

test("the celebration fires on CLOSING a ring, not on tapping a closed one", async ({
  page,
}) => {
  await signIn(page, USER);

  // walk back into the ring finished by the previous spec
  await page.goto("/today");
  await page
    .getByRole("main")
    .getByRole("listitem")
    .getByRole("link", { name: /Salawat/ })
    .click();
  await page.waitForURL("**/count/**");
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "3",
  );

  // extra dhikr past the target is welcome, but it is not a fresh completion:
  // congratulating it again is what makes the reward cheap
  await page.getByRole("button", { name: "Tap to count" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "4",
  );
  await expect(page.getByText("Ring closed!")).toBeHidden();

  // same for a finished day picked off the strip (yesterday, closed earlier).
  // The count assertion has to come first: it proves the tap has been handled,
  // so a hidden celebration means absent, not merely not-yet-rendered.
  await page.getByRole("button", { name: /Yest\./ }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "3",
  );
  await page.getByRole("button", { name: "Tap to count" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "4",
  );
  await expect(page.getByText("Ring closed!")).toBeHidden();
});

test("Mark done closes the ring without ending the session", async ({
  page,
}) => {
  await signIn(page, USER);

  await page.goto("/today");
  await page
    .getByRole("main")
    .getByRole("listitem")
    .getByRole("link", { name: /Salawat/ })
    .click();
  await page.waitForURL("**/count/**");

  // the oldest day on the strip is untouched by the specs above (they only
  // reach today and yesterday, which are labelled), so it gives us an open ring
  await page
    .getByRole("button", { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+$/ })
    .last()
    .click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );

  const url = page.url();
  await page.getByRole("button", { name: "Mark done" }).click();
  await closeCelebration(page);

  // it fills the ring and STAYS PUT: finishing must not be the one path that
  // ends the session, because counting past the target is normal and welcome
  expect(page.url()).toBe(url);
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "3",
  );
  await page.getByRole("button", { name: "Tap to count" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "4",
  );
});

test("on a short phone the primary action is not covered by the nav", async ({
  page,
}) => {
  // The reported bug: at 667px tall, the count screen's content ran past the
  // viewport and the sticky bottom nav sat on top of the action row.
  await page.setViewportSize({ width: 375, height: 667 });
  await signIn(page, USER);

  await page.goto("/today");
  await page
    .getByRole("main")
    .getByRole("listitem")
    .getByRole("link", { name: /Salawat/ })
    .click();
  await page.waitForURL("**/count/**");

  const action = page.getByRole("button", { name: /Mark done|Back to today/ });
  await expect(action).toBeVisible();
  const btn = (await action.boundingBox())!;
  const nav = (await page
    .getByRole("navigation", { name: "Primary" })
    .boundingBox())!;

  // fully inside the viewport, and clear of the nav rather than behind it
  expect(btn.y + btn.height).toBeLessThanOrEqual(667);
  expect(btn.y + btn.height).toBeLessThanOrEqual(nav.y + 1);
});

test("undo mid-flush can't dip the count under a slow network", async ({
  page,
}) => {
  // The pad used to FREEZE on undo/edit — settle the tap queue, then set, both
  // awaited — precisely because an exact-set racing an in-flight increment made
  // the count bounce (the "count-dip" family). It's optimistic in both
  // directions now, serialized behind one FIFO queue. This proves the dip can't
  // come back even when every write is slow: tap to 3, undo to 2 BEFORE the taps
  // have flushed, and the on-screen number must never flick up to 3 as the
  // increment lands behind the undo.
  test.slow(); // throttled writes — give it the headroom
  await signIn(page, USER);

  // an isolated circle + a task with headroom, so the undo lands mid-flush
  await page.goto("/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", "Latency Lab");
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  const groupId = page.url().match(/\/g\/([^/]+)\//)![1];
  await page.getByPlaceholder("Label (e.g. La ilaha illallah)").fill("Tasbih");
  await page.getByPlaceholder("Daily target").last().fill("10");
  await page.click('button:has-text("Add task")');
  await expect(page.getByText("target 10 · daily")).toBeVisible();

  await page.goto(`/g/${groupId}/today`);
  await page
    .getByRole("main")
    .getByRole("listitem")
    .getByRole("link", { name: /Tasbih/ })
    .click();
  await page.waitForURL("**/count/**");

  // slow EVERY request so a server action takes ~half a second to answer —
  // opening the window a reconcile-against-raw-server would have dipped in
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const throttle = (on: boolean) =>
    cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: on ? 500 : 0,
      downloadThroughput: on ? (1024 * 1024) / 8 : -1,
      uploadThroughput: on ? (1024 * 1024) / 8 : -1,
    });
  await throttle(true);

  const ring = page.getByRole("progressbar");
  const pad = page.getByRole("button", { name: "Tap to count" });
  await pad.click();
  await pad.click();
  await pad.click();
  await expect(ring).toHaveAttribute("aria-valuenow", "3"); // instant, optimistic

  // undo before the 600ms debounce has even dispatched the taps
  await page.getByRole("button", { name: "Undo one count" }).click();
  await expect(ring).toHaveAttribute("aria-valuenow", "2");

  // watch the number across the whole settling window: as the +3 increment
  // lands, then the set(2) behind it, it must stay pinned at 2 — a "3" here is
  // the dip returning.
  const seen = new Set<string>();
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    seen.add((await ring.getAttribute("aria-valuenow")) ?? "");
    await page.waitForTimeout(50);
  }
  expect(seen.has("3")).toBe(false);
  await expect(ring).toHaveAttribute("aria-valuenow", "2");

  // and it was a real write, not just optimistic paint: the DB serves 2.
  // The 3s settling loop above usually drains the queue on its own, but that is
  // incidental timing under a 500ms throttle, not a guarantee — drain it
  // explicitly, like the two reloads earlier in this file.
  await throttle(false);
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "2",
  );
});
