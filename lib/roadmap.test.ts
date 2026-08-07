/**
 * The roadmap mirror, checked against the database's own cases.
 *
 * WHY THIS FILE EXISTS. `lib/roadmap.ts` decides what the screen says is
 * finished, and `private.category_complete` / `level_complete` / `levels_complete`
 * in migration 0025 decide what actually is. Three comments and STATUS all
 * claimed "pgTAP 014 pins the mirror against the SQL" — and pgTAP only ever ran
 * the SQL. Nothing had executed this TypeScript, so the pair the whole design
 * rests on had exactly one side tested.
 *
 * THE RULE: every case below is a case suite 014 asserts against the SQL, in the
 * same order, on the same fixture. That is what makes it a cross-check rather
 * than a second opinion — the trap `lib/assignments.ts` records is a mirror and
 * an original that are wrong TOGETHER, and only a shared oracle catches it. If
 * you add a case here, add it there.
 *
 * AND THE PART WITH NO TWIN: `categoryPct` / `levelPct` exist only on the
 * client, because the database computes no fractions. Nothing can cross-check
 * them, so the percentage section below is not a mirror test — it is the whole
 * of their coverage, and it is where the 100%-over-an-incomplete-category bug
 * lived undetected.
 *
 * Runs on Node's own test runner with native type stripping — no dependency:
 *   pnpm test:unit
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  categoryComplete,
  categoryPct,
  currentLevel,
  daysLeft,
  isActiveOn,
  levelComplete,
  levelPct,
  levelsComplete,
  levelsOf,
  nextReward,
  programmeWindow,
  type LevelRequirement,
  type Roadmap,
  type RoadmapCategory,
  type RoadmapItem,
} from "./roadmap.ts";

// ---------------------------------------------------------------------------
// Fixture — the same one as pgTAP 014's "Levels programme" (roadmap P)
// ---------------------------------------------------------------------------
// Level 1 has a PLAIN category (two books, both required) and a BUDGETED one
// (three lectures, 100 minutes needed, one of them compulsory). Level 2 has a
// single book, so "no skipping" can be tested.

type Spec = {
  id: string;
  level: number;
  category: RoadmapCategory;
  target: number;
  compulsory?: boolean;
  done?: number;
};

const item = (s: Spec): RoadmapItem => ({
  id: s.id,
  level: s.level,
  category: s.category,
  title: s.id,
  source: null,
  url: null,
  unit: "units",
  target: s.target,
  compulsory: s.compulsory ?? false,
  done: s.done ?? 0,
});

/** The catalogue, with `done` overlaid per test — progress is the variable. */
const catalogue = (done: Record<string, number> = {}): RoadmapItem[] =>
  (
    [
      { id: "book-one", level: 1, category: "book", target: 1 },
      { id: "book-two", level: 1, category: "book", target: 1 },
      {
        id: "compulsory-talk",
        level: 1,
        category: "listening",
        target: 40,
        compulsory: true,
      },
      { id: "optional-long", level: 1, category: "listening", target: 90 },
      { id: "optional-short", level: 1, category: "listening", target: 30 },
      { id: "level-two-book", level: 2, category: "book", target: 1 },
    ] satisfies Spec[]
  ).map((s) => item({ ...s, done: done[s.id] ?? 0 }));

const reqs: LevelRequirement[] = [
  { level: 1, category: "listening", minTotal: 100 },
];

describe("completion — mirrors private.category_complete / level_complete", () => {
  // THE REGRESSION THAT MATTERS MOST, and the one this suite would have caught
  // on the first run: `least` IGNORES nulls in Postgres, so `least(p.done,
  // i.target)` on an untouched item returned the TARGET and a member who had
  // recorded nothing completed the programme. The mirror's `Math.min` has no
  // such behaviour, which is exactly why a mirror is not a check — only a shared
  // set of cases is.
  it("no progress at all is not completion", () => {
    const items = catalogue();
    assert.equal(categoryComplete(items, reqs, 1, "book"), false);
    assert.equal(levelComplete(items, reqs, 1), false);
    assert.equal(levelsComplete(items, reqs), 0);
  });

  it("a plain category needs EVERY item", () => {
    assert.equal(
      categoryComplete(catalogue({ "book-one": 1 }), reqs, 1, "book"),
      false,
      "one book of two is not the book category",
    );
    assert.equal(
      categoryComplete(
        catalogue({ "book-one": 1, "book-two": 1 }),
        reqs,
        1,
        "book",
      ),
      true,
      "both books is",
    );
  });

  // THE NEGATIVE THE `compulsory` COLUMN EXISTS FOR. 90 + 30 = 120, comfortably
  // over the 100 needed, with the compulsory talk untouched.
  it("a budget met with a compulsory item outstanding is NOT complete", () => {
    const items = catalogue({
      "book-one": 1,
      "book-two": 1,
      "optional-long": 90,
      "optional-short": 30,
    });
    assert.equal(categoryComplete(items, reqs, 1, "listening"), false);
    assert.equal(levelComplete(items, reqs, 1), false);
  });

  it("the compulsory item lands and the budget is met", () => {
    const items = catalogue({
      "book-one": 1,
      "book-two": 1,
      "optional-long": 90,
      "optional-short": 30,
      "compulsory-talk": 40,
    });
    assert.equal(categoryComplete(items, reqs, 1, "listening"), true);
    assert.equal(levelComplete(items, reqs, 1), true);
    assert.equal(levelsComplete(items, reqs), 1);
  });

  // The RPC clamps, but the rule must not depend on the writer having done so —
  // a direct fix-up or an imported row could carry anything.
  it("over-recording one item cannot buy the budget", () => {
    const items = catalogue({ "optional-short": 9999 });
    assert.equal(
      categoryComplete(items, reqs, 1, "listening"),
      false,
      "a 30-minute talk recorded as 9,999 still only counts for 30",
    );
  });

  it("levels are earned from the BOTTOM UP — no skipping", () => {
    const items = catalogue({ "level-two-book": 1 });
    assert.equal(levelComplete(items, reqs, 2), true, "level 2 outright");
    assert.equal(
      levelsComplete(items, reqs),
      0,
      "finishing level 2 while level 1 is unfinished earns NOTHING",
    );
  });

  it("an empty level, and an empty category, are NOT complete", () => {
    const items = catalogue();
    assert.equal(levelComplete(items, reqs, 99), false);
    assert.equal(categoryComplete(items, reqs, 1, "memorisation"), false);
    assert.equal(categoryComplete(items, reqs, 99, "book"), false);
  });

  it("currentLevel is the lowest unfinished, and null once all are done", () => {
    assert.equal(currentLevel(catalogue(), reqs), 1);
    assert.equal(levelsOf(catalogue()).join(","), "1,2");

    const allDone = catalogue({
      "book-one": 1,
      "book-two": 1,
      "compulsory-talk": 40,
      "optional-long": 90,
      "level-two-book": 1,
    });
    assert.equal(levelsComplete(allDone, reqs), 2);
    assert.equal(currentLevel(allDone, reqs), null);
    assert.equal(
      currentLevel([], reqs),
      null,
      "and null when there is nothing",
    );
  });
});

// ---------------------------------------------------------------------------
// Percentages — CLIENT-ONLY. No SQL twin, so this is their whole coverage.
// ---------------------------------------------------------------------------

describe("percentages — 100% means complete and nothing else rounds into it", () => {
  // The bug, on the REAL level-1 content: the optional lectures total 943
  // minutes against a 600-minute budget, so a member can reach 689 of 600 with
  // neither required lecture watched. The bar read 100%, the heading read
  // "689 of 600 minutes", and the category was not complete.
  it("a met budget with a compulsory item outstanding holds at 99", () => {
    const items = catalogue({ "optional-long": 90, "optional-short": 30 });
    assert.equal(categoryComplete(items, reqs, 1, "listening"), false);
    assert.equal(
      categoryPct(items, reqs, 1, "listening"),
      99,
      "120 of 100 minutes is over budget and still not finished",
    );
  });

  it("...and reaches 100 the moment it actually is complete", () => {
    const items = catalogue({
      "compulsory-talk": 40,
      "optional-long": 90,
      "optional-short": 30,
    });
    assert.equal(categoryPct(items, reqs, 1, "listening"), 100);
  });

  // The second way in, and it needs no compulsory item at all: 249 of 250 is
  // 99.6%, which Math.round takes to 100 with an item still unfinished.
  it("plain rounding cannot reach 100 either", () => {
    const items = [
      item({ id: "a", level: 5, category: "book", target: 249, done: 249 }),
      item({ id: "b", level: 5, category: "book", target: 1, done: 0 }),
    ];
    assert.equal(categoryComplete(items, [], 5, "book"), false);
    assert.equal(categoryPct(items, [], 5, "book"), 99);
  });

  // levelPct needs its own cap rather than inheriting its parts': an average of
  // 100 and 99 is 99.5, which rounds straight back up.
  it("a level average cannot round up into 100", () => {
    const items = catalogue({
      "book-one": 1,
      "book-two": 1,
      "optional-long": 90,
      "optional-short": 30,
    });
    assert.equal(categoryPct(items, reqs, 1, "book"), 100);
    assert.equal(categoryPct(items, reqs, 1, "listening"), 99);
    assert.equal(levelComplete(items, reqs, 1), false);
    assert.equal(levelPct(items, reqs, 1), 99, "not Math.round(99.5) === 100");
  });

  it("a finished level is 100", () => {
    const items = catalogue({
      "book-one": 1,
      "book-two": 1,
      "compulsory-talk": 40,
      "optional-long": 90,
    });
    assert.equal(levelComplete(items, reqs, 1), true);
    assert.equal(levelPct(items, reqs, 1), 100);
  });

  it("a budgeted category scores against the BUDGET, not the menu", () => {
    // 90 of a 100-minute budget on a menu worth 160 is 90%, not 56%.
    const items = catalogue({ "optional-long": 90 });
    assert.equal(categoryPct(items, reqs, 1, "listening"), 90);
  });

  it("nothing recorded is 0, and an absent category is 0", () => {
    assert.equal(categoryPct(catalogue(), reqs, 1, "listening"), 0);
    assert.equal(categoryPct(catalogue(), reqs, 1, "quran"), 0);
    assert.equal(levelPct(catalogue(), reqs, 99), 0);
  });
});

// ---------------------------------------------------------------------------
// Rewards and the window
// ---------------------------------------------------------------------------

describe("rewards", () => {
  const rewards = [
    { id: "r1", threshold: 1, label: "One", description: null },
    { id: "r2", threshold: 2, label: "Two", description: null },
    { id: "r3", threshold: 3, label: "Three", description: null },
  ];

  it("the next reward is the first above the levels earned", () => {
    assert.equal(nextReward(rewards, 0)?.id, "r1");
    assert.equal(nextReward(rewards, 1)?.id, "r2");
    assert.equal(nextReward(rewards, 3), null, "null once every one is earned");
    assert.equal(nextReward([], 0), null);
  });
});

describe("the window, on the member's own calendar (D34)", () => {
  const roadmap = {
    id: "p",
    name: "Programme",
    startsOn: "2026-01-01",
    endsOn: "2026-12-31",
    items: [],
    requirements: [],
    rewards: [],
  } satisfies Roadmap;

  it("reports upcoming, open and closed as different things", () => {
    assert.deepEqual(
      programmeWindow("2026-01-01", "2026-12-31", "2025-12-25"),
      {
        state: "upcoming",
        days: 7,
      },
    );
    assert.deepEqual(
      programmeWindow("2026-01-01", "2026-12-31", "2026-06-01"),
      {
        state: "open",
        days: 213,
      },
    );
    // The whole reason this exists: "0 days left" is the truth about the LAST
    // day of an open programme, and it was also what a programme closed six
    // years ago said, every day, forever.
    assert.deepEqual(
      programmeWindow("2026-01-01", "2026-12-31", "2026-12-31"),
      {
        state: "open",
        days: 0,
      },
    );
    assert.deepEqual(
      programmeWindow("2026-01-01", "2026-12-31", "2027-01-01"),
      {
        state: "closed",
        days: 0,
      },
    );
  });

  it("isActiveOn agrees with it at both boundaries", () => {
    assert.equal(isActiveOn(roadmap, "2025-12-31"), false);
    assert.equal(isActiveOn(roadmap, "2026-01-01"), true, "inclusive start");
    assert.equal(isActiveOn(roadmap, "2026-12-31"), true, "inclusive end");
    assert.equal(isActiveOn(roadmap, "2027-01-01"), false);
  });

  it("daysLeft is a pure day count and never negative", () => {
    assert.equal(daysLeft("2026-12-31", "2026-12-24"), 7);
    assert.equal(daysLeft("2026-12-31", "2027-06-01"), 0);
    // Across a DST boundary in the member's zone: both bounds parse at UTC
    // midnight, so the subtraction carries no zone and no 23/25-hour day.
    assert.equal(daysLeft("2026-04-06", "2026-04-01"), 5);
    assert.equal(daysLeft("not-a-date", "2026-01-01"), 0);
  });
});
