import { test, expect } from "@playwright/test";
import { makeSuperAdmin, signIn } from "./helpers";

/**
 * The roadmap loop (D55, migration 0025): a circle follows a published
 * programme, its members record progress against work done OUTSIDE the app in
 * sequential LEVELS, and a reward unlocks at the end of each level.
 *
 * The seed carries the real Islamic Development Program for local/CI. These
 * tests pin the STRUCTURE (levels, the budgeted listening category, the
 * compulsory rule) rather than the catalogue, so replacing the placeholder
 * lecture URLs or the reward figures does not break them — but they do name a
 * few items, because a spec that asserts nothing about content cannot tell a
 * rendered programme from an empty one.
 */
const STAMP = Date.now();
const OWNER = `e2e-roadmap-${STAMP}@example.com`;
const OUTSIDER = `e2e-roadmap-out-${STAMP}@example.com`;
// The administration's reader: in NO circle, which is the whole point of them.
const ORGANISER = `e2e-roadmap-org-${STAMP}@example.com`;
/** A second published programme, so "follows several" has something to follow. */
const SECOND_PROGRAMME = "Ramadan Programme (example)";

test.describe.configure({ mode: "serial" });

/** Create a circle and return the manage URL it lands on. */
async function newCircle(
  page: import("@playwright/test").Page,
  name: string,
): Promise<string> {
  await page.goto("/groups");
  await page.click('button:has-text("New group")');
  await page.fill("#new-group-name", name);
  await page.click('button:has-text("Create group")');
  await page.waitForURL("**/group/manage");
  return page.url();
}

test("a circle follows a programme, and its members can record against it", async ({
  page,
}) => {
  await signIn(page, OWNER);
  const manageUrl = await newCircle(page, `Roadmap Circle ${STAMP}`);

  // Before opting in there is NO Roadmap tab. The tab is the only way in now
  // (Q7 resolved) and it is conditional — most circles follow no programme, so
  // a permanent tab leading to "isn't following a programme" would be clutter.
  await page.getByRole("link", { name: "Progress", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Roadmap", exact: true }),
  ).toHaveCount(0);

  // Back to Manage by URL, not history: Manage STREAMS, so for a beat the only
  // thing on the page is the circle name, and an immediate selectOption on a
  // half-rendered screen is a false negative (a trap this suite has hit before).
  await page.goto(manageUrl);
  // A CHECKBOX now, not a <select> (0028): a circle may follow several, and a
  // single-value control cannot express that.
  const optIn = page.getByRole("checkbox", {
    name: "Islamic Development Program",
  });
  await expect(optIn).toBeVisible();

  // WAIT FOR THE WRITE ITSELF, armed BEFORE the click so it cannot be missed.
  // The checkbox flips optimistically the instant it is pressed, so asserting
  // on it proves nothing, and waiting on the nav tab instead means waiting on
  // revalidate → refresh → layout → store — a long chain that is fast enough
  // most of the time and therefore flaky. The Server Action's own response is
  // the exact moment the row exists.
  const written = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.ok(),
  );
  await optIn.check();
  await written;

  // And the nav tab does follow from it.
  await expect(
    page.getByRole("link", { name: "Roadmap", exact: true }).first(),
  ).toBeVisible();

  // BEFORE recording anything: the report already knows this person is on the
  // programme. Built from `roadmap_progress` alone it could not — a member with
  // no rows was indistinguishable from someone not enrolled, and the person an
  // admin most needs to notice is the one who has not started. The roster comes
  // from membership (`roadmap_roster`), carrying the same three readers as the
  // progress policy.
  await page.goto("/programme/progress");
  await expect(page.getByText("Nothing recorded yet")).toHaveCount(0);
  await expect(page.getByText("0 of 3 levels")).toBeVisible();

  // THE WAY IN IS THE NAV TAB. It appears only for a circle that follows a
  // programme, and the flag reaches the nav without the app shell doing any DB
  // work: the group layout reads it and publishes to a store the nav
  // subscribes to (`lib/use-group-roadmap.ts`).
  await page.goto(manageUrl);
  const tab = page.getByRole("link", { name: "Roadmap", exact: true }).first();
  await expect(tab).toBeVisible();
  await tab.click();
  await page.waitForURL("**/roadmap");

  await expect(
    page.getByRole("heading", { level: 1, name: "Roadmap" }),
  ).toBeVisible();

  // THE ADMIN STRIP (D59). This owner leads the circle, so the two jobs that
  // live OFF this screen are on it: how everyone is getting on, and the
  // programme's own content — which is where an organiser edits an item. Before
  // this they were a link at the foot of Manage and a section heading on the
  // report that happened to be a link.
  // The HREFs rather than a click-and-come-back: this test goes on to record
  // taps on this very screen, and a round trip through another route re-mounts
  // the accordions mid-spec — the "clicked before hydration" false negative
  // this suite keeps re-learning. Both destinations are opened for real
  // elsewhere in this file (the organiser's walk below).
  await expect(
    page.getByRole("link", { name: /Members’ progress/ }),
  ).toHaveAttribute("href", "/programme/progress");
  await expect(
    page.getByRole("link", { name: /Open programme/ }),
  ).toHaveAttribute("href", /^\/programme\/[0-9a-f-]+$/);

  // A fresh member starts at LEVEL 1 and has finished nothing. Everyone begins
  // there and logs their way up — there is no level to pick and none to assign.
  await expect(page.getByText("3 levels · none finished yet")).toBeVisible();
  await expect(page.getByText(/Level 1/).first()).toBeVisible();

  // TWO levels of disclosure now (0027): the station is open, and each category
  // opens to its items. Open the three this spec works in — they are
  // independent toggles, so opening one no longer closes another.
  await page.getByRole("button", { name: /^Book/ }).click();
  await page
    .getByRole("button", { name: /^Qur'an\b/ })
    .first()
    .click();
  await page.getByRole("button", { name: /^Listening/ }).click();

  // A one-unit item is a yes/no thing and gets a single toggle, not a counter.
  // `ul > li`, not `li`: the reward LADDER is an <ol>, so a bare li filter
  // matches a reward rung — which has no button on it — not the item card.
  const book = page
    .locator("ul > li")
    .filter({ hasText: "Calling to Good" })
    .first();
  await book.getByRole("button", { name: "Mark done" }).click();
  await expect(book.getByRole("button", { name: "Undo" })).toBeVisible();

  // A multi-unit item counts up. Three taps in a row is the case that matters:
  // the buttons send an ABSOLUTE value, so out-of-order replies would let the
  // loser win — the count-dip family. All three must land.
  const khatm = page.locator("ul > li").filter({ hasText: "½ Khatm" }).first();
  const plus = khatm.getByRole("button", { name: /^Add one to/ });
  await plus.click();
  await plus.click();
  await plus.click();
  await expect(khatm.getByText("3 of 15 juz")).toBeVisible();

  // THE ASSERTION THAT CARRIES THE FEATURE: it survives a reload. Everything
  // above is satisfied by optimistic state with nothing written.
  await page.reload();
  // Disclosure state is client-side and resets on reload — the STATION reopens
  // on the member's current level, but the categories do not. That is the
  // trade for not putting UI state in the URL, and it is why this has to
  // reopen them before asserting on rows.
  await page.getByRole("button", { name: /^Book/ }).click();
  await page
    .getByRole("button", { name: /^Qur'an\b/ })
    .first()
    .click();
  await page.getByRole("button", { name: /^Listening/ }).click();
  await expect(khatm.getByText("3 of 15 juz")).toBeVisible();
  await expect(book.getByRole("button", { name: "Undo" })).toBeVisible();

  // Recording is reversible. A number a member can only push upward is one
  // they will eventually be afraid to touch.
  const minus = khatm.getByRole("button", { name: /^Remove one from/ });
  await minus.click();
  await expect(khatm.getByText("2 of 15 juz")).toBeVisible();

  // ---- the budgeted category, which is scored differently to every other ----
  // "Listen to a total of 600 minutes" from a menu — so the heading reports the
  // BUDGET, not how many of the ten lectures are ticked, and a lecture is worth
  // its whole minute value the moment it is marked done.
  await expect(page.getByText("0 of 600 minutes")).toBeVisible();

  const lecture = page
    .locator("ul > li")
    .filter({ hasText: "Lessons From The Qur'an" })
    .first();
  await lecture.getByRole("button", { name: "Mark done" }).click();

  // 555, not 1: a lecture is recorded all-or-nothing but counts for what it is
  // worth. Writing 1 here would credit a nine-hour playlist as a single minute.
  await expect(page.getByText("555 of 600 minutes")).toBeVisible();

  // THE NEGATIVE THAT CARRIES THE COMPULSORY RULE: the two required lectures
  // are still unwatched, so the level cannot be complete however the minutes
  // add up — and the row says so before the member finds out the hard way.
  await expect(page.getByText("Required").first()).toBeVisible();

  // And now OVER the budget, which is reachable on the real content: level 1's
  // optional lectures are worth 943 minutes against a 600 requirement. 555 + 134
  // is 689 of 600 with neither required lecture watched. The category bar used
  // to read 100% here, over a category that was not complete — the number and
  // the rule beside it saying opposite things. Nothing may be finished by this.
  await page
    .locator("ul > li")
    .filter({ hasText: "The Way of Ascension" })
    .first()
    .getByRole("button", { name: "Mark done" })
    .click();

  await expect(page.getByText("689 of 600 minutes")).toBeVisible();
  await expect(page.getByText("Required").first()).toBeVisible();
  await expect(page.getByText("3 levels · none finished yet")).toBeVisible();

  // The member is TOLD who reads this (D55) — being read without knowing is
  // the thing the disclosure exists to prevent.
  await expect(
    page.getByText(/admins and the programme’s organisers can see/),
  ).toBeVisible();
});

test("the roadmap never touches the daily engine", async ({ page }) => {
  await signIn(page, OWNER);

  // A day spent not reading must never break a streak (D8). Recording six
  // items above changed nothing on Progress: no streak, no consistency, no
  // completed day — the roadmap can only ever ADD.
  await page.goto("/groups");
  await page
    .getByRole("link", { name: /Roadmap Circle/ })
    .first()
    .click();
  // Wait for each landing before acting on it: clicking a nav tab on a
  // half-mounted screen is the false negative this suite keeps re-learning.
  await page.waitForURL("**/today");
  await page.getByRole("link", { name: "Progress", exact: true }).click();
  await page.waitForURL("**/progress");

  await expect(page.getByText("of the last 14 days")).toBeVisible();
  await expect(page.getByText("every day is a fresh start")).toBeVisible();
  // `exact`, because "every day is a fresh start" above also contains it —
  // the strict-mode violation this suite keeps re-learning.
  await expect(page.getByText("Fresh start", { exact: true })).toBeVisible();
});

test("an outsider's circle sees no programme, and the report shows them nobody", async ({
  page,
}) => {
  await signIn(page, OUTSIDER);
  const manageUrl = await newCircle(page, `Outsider Circle ${STAMP}`);

  // A circle that follows nothing gets an explanation, not a redirect — and
  // crucially not the rewards, which are the administration's real promises to
  // people it has actually enrolled.
  await page.goto(manageUrl.replace("/group/manage", "/roadmap"));
  await expect(page.getByText("isn’t following a programme")).toBeVisible();
  await expect(page.getByText("Level 1 complete")).toHaveCount(0);

  // The report is scoped by RLS, not by app code: this admin leads a circle
  // that follows nothing, so there is nobody they are entitled to see — least
  // of all the owner above, who is on the same programme in another circle.
  await page.goto("/programme/progress");
  await expect(page.getByText("Nothing recorded yet")).toBeVisible();

  // And the hub above it is empty for the same reason, in the other direction:
  // `roadmaps` is readable to anyone once published, but the ITEMS are gated on
  // following it (0025) — so a programme this circle does not follow would list
  // as "0 levels · 0 items", a broken programme rather than someone else's. The
  // hub drops it and says why (D59).
  await page.goto("/programme");
  await expect(page.getByText("No programme to show")).toBeVisible();
  await expect(page.getByText(/an admin chooses it in Manage/)).toBeVisible();
});

test("a super admin has a way in, and reads the cohort across circles", async ({
  page,
}) => {
  // A circle owner is NOT an organiser: no entry on /groups, and the footer
  // describes the view they actually have. The negative comes first so the
  // positive below cannot pass on a section that is simply always rendered.
  await signIn(page, OUTSIDER);
  await page.goto("/groups");
  await expect(page.getByText("Administration")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Programme/ })).toHaveCount(0);

  // The gap this closes: a super admin is deliberately in no circle, and the
  // report's ONLY link lived inside a circle's Manage screen — gated on leading
  // a circle that follows a programme, which is precisely what they do not do.
  // Every route was membership-gated, so the app's front door was a dead end
  // and the screen was reachable by typing the URL and nothing else.
  await signIn(page, ORGANISER);
  await makeSuperAdmin(ORGANISER);

  await page.goto("/groups");
  await expect(page.getByText("Administration")).toBeVisible();
  // "Start your first circle" is the app mistaking an administrator for a new
  // member — being in none is the role, not a step they have skipped.
  await expect(page.getByText("Start your first circle")).toHaveCount(0);

  // THE NAV TAB (D59). The card below is still a way in, but an organiser is in
  // no circle by role, so every group-scoped tab is closed to them and the app
  // had nothing permanent to offer: the programme was reachable from one card
  // on one screen. Now the Roadmap tab is in the bar wherever they are, and it
  // lands on the hub rather than on a list of people.
  const orgTab = page
    .getByRole("link", { name: "Roadmap", exact: true })
    .first();
  await expect(orgTab).toBeVisible();
  await orgTab.click();
  await page.waitForURL("**/programme");
  await expect(
    page.getByRole("heading", { level: 1, name: "Roadmap" }),
  ).toBeVisible();

  // The hub forks: the programmes are the content, and the report is one tap
  // away. It used to BE this address, which is why the catalogue — and the
  // editor on it — was behind a section heading that happened to be a link.
  await page.getByRole("link", { name: /Members’ progress/ }).click();
  await page.waitForURL("**/programme/progress");

  // Across circles they are in none of — the whole point of the reader. The
  // OWNER above is on the programme through their own circle.
  await expect(page.getByText("Nothing recorded yet")).toHaveCount(0);
  await expect(page.getByText("0 of 3 levels").first()).toBeVisible();

  // The cohort shape, and it is TEXT — colour alone never carries a reading
  // (§5). Everyone the organiser can see is at zero, so one bucket holds them
  // all and the empty buckets are not drawn.
  // `.first()` — the seed carries TWO programmes now (0028), so the organiser
  // sees a cohort strip per programme and this legend appears once each.
  await expect(page.getByText("not started").first()).toBeVisible();

  // And the footer names THIS reader. It used to describe exactly one of the
  // three — "your own circles' members if you lead one" — so an organiser who
  // leads nothing read a caption about somebody else's view of the screen.
  await expect(page.getByText(/You are an organiser/)).toBeVisible();

  // THE PROGRAMME ITSELF, which an organiser could not reach at all: the
  // member's roadmap is at /g/[groupId]/roadmap and is membership-gated, and an
  // organiser is deliberately in no circle. They could read that Zayd had
  // finished level 2 and not what level 2 asks for. It is now a card on the
  // hub — the screen the tab lands on — rather than a heading on the report.
  // `exact`, or this also matches the footer's "Back to the programmes" — the
  // strict-mode violation this suite keeps re-learning.
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await page.waitForURL("**/programme");
  await page.getByRole("link", { name: /Islamic Development Program/ }).click();
  await page.waitForURL(/\/programme\/[0-9a-f-]+$/);

  await expect(
    page.getByRole("heading", { name: "Islamic Development Program" }),
  ).toBeVisible();
  // By ROLE, not text: "Level 1" also matches the reward rung "Level 1
  // complete" a few hundred pixels above, and the level headings are the thing
  // being asserted here.
  await expect(
    page.getByRole("heading", { name: "Level 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Calling to Good", { exact: true }),
  ).toBeVisible();

  // A BUDGETED category reads as a menu with a total, not a list to finish —
  // the difference between "watch all of these" and "choose 600 minutes".
  await expect(page.getByText("choose 600 minutes")).toBeVisible();
  await expect(page.getByText("135 minutes")).toBeVisible();

  // NO PROGRESS on this screen: it says what the programme asks for, and the
  // member's own roadmap is the one place a `done` is read or written.
  await expect(page.getByRole("button", { name: "Mark done" })).toHaveCount(0);

  // And there is a way back out — to the hub the Roadmap tab lands on, which
  // is where the card that opened this screen lives.
  await page.getByRole("link", { name: "Back" }).click();
  await page.waitForURL("**/programme");
});

test("an organiser appoints another, and can stand them down", async ({
  page,
}) => {
  // The bootstrap: the FIRST organiser has no in-app path by design, so this
  // reaches round the app with the service role exactly as the Supabase
  // dashboard does. Everything after this point goes through the UI.
  await signIn(page, ORGANISER);
  await makeSuperAdmin(ORGANISER);
  await page.goto("/groups");
  await expect(page.getByRole("heading", { name: "Organisers" })).toBeVisible();

  // NOTHING HERE ASSERTS A GLOBAL COUNT, and that is deliberate rather than
  // lazy. The e2e database is shared and accumulates organisers across runs, so
  // "there is exactly one" is not a property this suite can establish — an
  // earlier version asserted it and passed alone while failing in the full
  // suite. The LOCKOUT rule (the last organiser cannot be stood down) is a
  // database invariant with a transactional fixture and a rollback assertion in
  // pgTAP 015; what e2e is for is the wiring, so that is all it checks.

  // Appointing by EXACT email. There is no picker and there must not be — a
  // browsable list of the app's users is the god view D26/D27 refuses.
  await page.fill("#organiser-email", OUTSIDER);
  await page.getByRole("button", { name: "Appoint" }).click();
  await expect(page.getByText(OUTSIDER)).toBeVisible();

  // The refusals are the RPC's own words, surfaced to whoever typed the
  // address — the only person who can act on either.
  await page.fill("#organiser-email", OUTSIDER);
  await page.getByRole("button", { name: "Appoint" }).click();
  await expect(
    page.getByText("that person is already an organiser"),
  ).toBeVisible();

  await page.fill("#organiser-email", `nobody-${STAMP}@example.com`);
  await page.getByRole("button", { name: "Appoint" }).click();
  await expect(
    page.getByText("no account with that email address"),
  ).toBeVisible();

  // The person just appointed really is one: they can now read the report,
  // which was gated against them a moment ago (spec above asserts that half).
  await signIn(page, OUTSIDER);
  await page.goto("/programme/progress");
  await expect(page.getByText(/You are an organiser/)).toBeVisible();

  // Standing down, through the confirm step, and the row goes.
  await signIn(page, ORGANISER);
  await page.goto("/groups");
  const row = page.locator("li", { hasText: OUTSIDER });
  await row.getByRole("button", { name: "Remove" }).click();
  await page
    .getByRole("button", { name: "Remove", exact: true })
    .last()
    .click();
  await expect(page.getByText(OUTSIDER)).toHaveCount(0);

  // And the role really is gone, not just the row.
  await signIn(page, OUTSIDER);
  await page.goto("/programme/progress");
  await expect(page.getByText(/You are an organiser/)).toHaveCount(0);
});

test("the timeline, its pictures, and an organiser editing an item", async ({
  page,
}) => {
  await signIn(page, ORGANISER);
  await makeSuperAdmin(ORGANISER);

  // The catalogue carries the booklet's own descriptions and cover artwork
  // (0027). Before this, an item was a title and a target and nothing else.
  await page.goto("/programme/00000000-0000-0000-0000-0000000000f1");
  await expect(
    page.getByRole("heading", { name: "Islamic Development Program" }),
  ).toBeVisible();
  await expect(page.getByText(/amr bil ma'ruf/)).toBeVisible();
  await expect(
    page.locator('img[src="/roadmap/calling-to-good.png"]'),
  ).toBeVisible();

  // THE EDITOR. The link is why it exists: the booklet's URLs are placeholders,
  // so every item shipped with none and the only way to enter a real one was a
  // migration and a deploy.
  await page.getByRole("button", { name: "Edit Guarding the Tongue" }).click();
  const link = page.getByLabel("Link");
  await expect(link).toBeVisible();

  // A `javascript:` URL is rendered as an anchor to every member of every
  // circle following the programme. Refused, and the dialog STAYS OPEN with the
  // reason on it — the shape every other refusal in this app has.
  await link.fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("a link must start with http:// or https://"),
  ).toBeVisible();

  await link.fill("https://youtube.com/watch?v=e2e-guarding");
  await page.getByLabel("Description").fill("A short talk on the tongue.");
  await page.getByRole("button", { name: "Save" }).click();

  // RELOADED before asserting, deliberately. `router.refresh()` makes the row
  // update in place, but asserting on that only proves the optimistic path; a
  // reload proves the edit is IN THE DATABASE, which is the claim that matters
  // for content every member will read.
  await page.reload();
  await expect(
    page.getByText("https://youtube.com/watch?v=e2e-guarding"),
  ).toBeVisible();
  await expect(page.getByText("A short talk on the tongue.")).toBeVisible();

  // AND THE MEMBER SEES IT, which is the whole point of the editor: the two
  // screens read the same row, so an organiser's edit reaches every circle
  // following the programme without a deploy.
  await signIn(page, OWNER);
  await page.goto("/groups");
  await page
    .getByRole("link", { name: /Roadmap Circle/ })
    .first()
    .click();
  await page.waitForURL("**/today");
  await page
    .getByRole("link", { name: "Roadmap", exact: true })
    .first()
    .click();
  await page.waitForURL("**/roadmap");

  await page.getByRole("button", { name: /^Listening/ }).click();
  await expect(page.getByText("A short talk on the tongue.")).toBeVisible();
});

test("a member walks the timeline: stations, then categories, then items", async ({
  page,
}) => {
  await signIn(page, OWNER);

  // OWNER's circle followed the programme in the first spec in this file.
  await page.goto("/groups");
  const circle = page.getByRole("link", { name: /Roadmap Circle/ }).first();
  await expect(circle).toBeVisible();
  await circle.click();
  await page.waitForURL("**/today");

  await page
    .getByRole("link", { name: "Roadmap", exact: true })
    .first()
    .click();
  await page.waitForURL("**/roadmap");

  // TWO levels of disclosure. The station opens to categories, and a category
  // opens to items — opening a level and getting forty cards is the wall this
  // structure replaced.
  const station = page.getByRole("button", { name: /^Level 1/ });
  await expect(station).toHaveAttribute("aria-expanded", "true");

  const book = page.getByRole("button", { name: /^Book/ });
  await expect(book).toBeVisible();
  // Collapsed, a category shows its covers rather than its rows.
  await expect(
    page.locator('img[src="/roadmap/belief-and-unbelief.png"]').first(),
  ).toBeVisible();
  // ...and no item controls, because nothing is open yet.
  await expect(page.getByRole("button", { name: "Mark done" })).toHaveCount(0);

  await book.click();
  await expect(
    page.getByText("Calling to Good", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/amr bil ma'ruf/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark done" }).first(),
  ).toBeVisible();

  // A later level is NOT called "Locked", and that is deliberate: nothing
  // refuses a write to it. `set_roadmap_progress` checks the programme is
  // followed and clamps to the target, and that is all — a Locked badge would
  // be the screen inventing a rule the database does not keep.
  await expect(page.getByRole("button", { name: /^Level 2/ })).toBeVisible();
  await expect(page.getByText("Locked")).toHaveCount(0);
});

test("a circle follows TWO programmes, and the roadmap switches between them", async ({
  page,
}) => {
  // The whole point of 0028: the old single column made this unrepresentable,
  // so a circle wanting both had to choose or be split in two.
  await signIn(page, OWNER);
  await page.goto("/groups");
  await page
    .getByRole("link", { name: /Roadmap Circle/ })
    .first()
    .click();
  await page.waitForURL("**/today");
  const groupId = page.url().match(/\/g\/([^/]+)\//)![1];

  // The SECOND programme comes from the seed, not from this spec: content is
  // authored by migration (D55) and `service_role` holds no write grant on
  // `roadmaps`, so there is deliberately no path for a test to create one.

  await page.goto(`/g/${groupId}/group/manage`);
  const second = page.getByRole("checkbox", { name: SECOND_PROGRAMME });
  await expect(second).toBeVisible();
  await second.check();

  // Both are now followed, and the checkbox list says so — the state a
  // <select> could not have represented at all.
  await expect(
    page.getByRole("checkbox", { name: "Islamic Development Program" }),
  ).toBeChecked();
  await expect(second).toBeChecked();

  await page.goto(`/g/${groupId}/roadmap`);

  // THE SWITCHER, which only exists with more than one. It defaults to the
  // NEWEST programme, which is almost always the live one.
  const tabs = page.getByRole("link", { name: SECOND_PROGRAMME });
  await expect(tabs).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Islamic Development Program" }),
  ).toBeVisible();

  // Switching is a NAVIGATION — a real URL, so it survives a reload and can be
  // shared, which a client-held selection could not.
  await page.getByRole("link", { name: "Islamic Development Program" }).click();
  await page.waitForURL(/\/roadmap\?r=/);
  // The CHIP marks itself current, which is the switcher's own claim about
  // what is on screen — the programme name alone is ambiguous, because the
  // subtitle names it too.
  await expect(
    page.getByRole("link", { name: "Islamic Development Program" }),
  ).toHaveAttribute("aria-current", "page");
  // And the content really did change: the Ramadan fixture's only book is gone.
  await expect(page.getByText("A Ramadan Reader")).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Roadmap" }),
  ).toBeVisible();

  // AND UN-FOLLOWING KEEPS THE RECORD. This circle's owner marked items done in
  // the first spec; dropping the programme and picking it up again must find
  // them exactly where they were (D55 — progress belongs to the member).
  await page.goto(`/g/${groupId}/group/manage`);
  const first = page.getByRole("checkbox", {
    name: "Islamic Development Program",
  });
  await first.uncheck();
  await expect(first).not.toBeChecked();
  await first.check();
  await expect(first).toBeChecked();

  await page.goto(`/g/${groupId}/roadmap`);
  await page.getByRole("link", { name: "Islamic Development Program" }).click();
  await page.waitForURL(/\/roadmap\?r=/);
  await page.getByRole("button", { name: /^Book/ }).click();
  await expect(
    page
      .locator("ul > li")
      .filter({ hasText: "Calling to Good" })
      .first()
      .getByRole("button", { name: "Undo" }),
  ).toBeVisible();
});
