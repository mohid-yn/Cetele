/**
 * The rings rules — roster order and the day-cell ramp.
 *
 * WHY THIS FILE EXISTS. Neither rule has a database twin. `lib/shares.ts` is a
 * mirror of migration 0032 and pgTAP 018 can contradict it; nothing can
 * contradict "which member sorts first" or "how full is a 40%-closed day drawn",
 * because both exist only on the client. So this file is not a cross-check —
 * it is the entire coverage of two rules that encode D8 and D61.
 *
 * Runs on Node's own test runner with native type stripping — no dependency:
 *   pnpm test:unit
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOTHING_DUE, compareByRings, ringRatio } from "./rings.ts";
import { dayCellClass } from "./grid-scale.ts";

const score = (ringsClosed: number, ringsOwed: number, today = 0) => ({
  ringsClosed,
  ringsOwed,
  today,
});

describe("ringRatio", () => {
  it("is the share of the day's rings closed", () => {
    assert.equal(ringRatio(score(2, 4)), 0.5);
    assert.equal(ringRatio(score(4, 4)), 1);
    assert.equal(ringRatio(score(0, 3)), 0);
  });

  it("keeps 'nothing was due' as a THIRD state, not a zero", () => {
    // The whole point of the sentinel: a member owed nothing has neither
    // achieved 0% nor 100%, and collapsing it into either accuses them of a
    // miss or crowns them for a day off.
    assert.equal(ringRatio(score(0, 0)), NOTHING_DUE);
    assert.ok(ringRatio(score(0, 0)) < ringRatio(score(0, 3)));
  });
});

describe("compareByRings", () => {
  it("ranks a FINISHED short day above an unfinished long one", () => {
    // The regression this rule exists to prevent: ordering on rings closed
    // outright files 1-of-1 (done) below 2-of-5 (not done).
    const done = score(1, 1);
    const partial = score(2, 5);
    assert.ok(compareByRings(done, partial) < 0);
  });

  it("does not reward being asked for more — the old raw-total bug (D61)", () => {
    // A member on a big share logging a big number used to outrank a member who
    // actually finished, because the list sorted on the raw count.
    const finished = score(2, 2, 200);
    const bigShareUnfinished = score(1, 2, 900);
    assert.ok(compareByRings(finished, bigShareUnfinished) < 0);
  });

  it("sorts members owed nothing LAST, below even an untouched day", () => {
    const nothingDue = score(0, 0);
    const missedEverything = score(0, 4);
    assert.ok(compareByRings(missedEverything, nothingDue) < 0);
  });

  it("breaks a tie on rings closed, then on the raw count", () => {
    assert.ok(compareByRings(score(3, 6), score(1, 2)) < 0); // same ratio, more rings
    assert.ok(compareByRings(score(1, 2, 500), score(1, 2, 10)) < 0); // same rings
  });

  it("orders a full roster the way the screen renders it", () => {
    const roster = [
      { name: "nothing due", ...score(0, 0, 0) },
      { name: "missed", ...score(0, 3, 0) },
      { name: "half", ...score(2, 4, 50) },
      { name: "finished", ...score(3, 3, 90) },
    ];
    assert.deepEqual(
      [...roster].sort(compareByRings).map((r) => r.name),
      ["finished", "half", "missed", "nothing due"],
    );
  });
});

describe("dayCellClass", () => {
  it("draws an absent obligation as absent — no fill AND no outline", () => {
    // The hairline means "a slot you could have filled", so wearing it on a day
    // nothing was asked would accuse the member of missing something that was
    // never theirs.
    assert.equal(dayCellClass(0, 0, false), "bg-transparent");
    assert.equal(dayCellClass(1, 500, false), "bg-transparent");
  });

  it("outlines a day with no effort, and never darkens it", () => {
    const empty = dayCellClass(0, 0);
    assert.match(empty, /ring-progress-track/);
    assert.doesNotMatch(empty, /bg-primary/);
  });

  it("separates 'tried and fell short' from 'nothing at all'", () => {
    // Without the activity argument a member at 99% on every task would be
    // drawn exactly like one who never opened the app.
    assert.notEqual(dayCellClass(0, 0), dayCellClass(0.2, 40));
    assert.equal(dayCellClass(0.2, 40), "bg-primary/20");
  });

  it("climbs the ramp and tops out at a full fill", () => {
    assert.equal(dayCellClass(0.4, 10), "bg-primary/45");
    assert.equal(dayCellClass(0.7, 10), "bg-primary/70");
    assert.equal(dayCellClass(1, 10), "bg-primary");
    assert.equal(dayCellClass(1.5, 10), "bg-primary", "overshoot stays full");
  });

  it("is never red — D8 forbids a punishment read on any rung", () => {
    for (const [pct, activity] of [
      [0, 0],
      [0.1, 5],
      [0.5, 50],
      [1, 100],
    ] as const) {
      assert.doesNotMatch(
        dayCellClass(pct, activity),
        /danger|destructive|red/,
      );
    }
  });
});
