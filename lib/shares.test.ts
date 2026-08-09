/**
 * The share mirror, checked against the database's own cases.
 *
 * WHY THIS FILE EXISTS. `lib/shares.ts` decides what the SCREEN says a member
 * owes, and `private.member_share_on` / `private.effective_target` in migration
 * 0032 decide what they actually owe. `lib/assignments.ts` records the trap this
 * pairing sets: a mirror and an original that are wrong TOGETHER, which only a
 * shared oracle catches.
 *
 * THE RULE: every case in the mirror section below is a case pgTAP 018 asserts
 * against the SQL, on the same fixture (circle target 100, a daily task anchored
 * 30 days back, members B and C), in the same order. If you add a case here, add
 * it there.
 *
 * AND THE PART WITH NO TWIN: `currentShares` and `isRaised` exist only on the
 * client — the database has no notion of "what the admin is currently editing"
 * or "badge this row as raised". Nothing can cross-check them, so their section
 * is not a mirror test; it is the whole of their coverage.
 *
 * Runs on Node's own test runner with native type stripping — no dependency:
 *   pnpm test:unit
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  currentShares,
  effectiveTarget,
  isRaised,
  shareOn,
  toShares,
  type Share,
} from "./shares.ts";

/**
 * The circle's own as-of target, inlined rather than imported.
 *
 * `lib/task-config.ts` imports through the `@/*` alias, which Node's test
 * runner cannot resolve — and `effectiveTarget` takes the circle's number as a
 * plain argument precisely so the two layers compose without that dependency.
 * This helper stands in for `targetOn` on the fixture's versions, which is all
 * these cases need: suite 013 is what pins the real one against the SQL.
 */
function circleTargetOn(versions: Version[], dayISO: string): number {
  for (const v of versions) {
    const from = v.effective_from.slice(0, 10);
    const to = v.effective_to === null ? null : v.effective_to.slice(0, 10);
    if (from <= dayISO && (to === null || dayISO < to)) return v.target_count;
  }
  // The pre-creation fallback (`configOn`'s earliest-version rule).
  return versions[0].target_count;
}

type Version = {
  target_count: number;
  effective_from: string;
  effective_to: string | null;
};

// ---------------------------------------------------------------------------
// Fixture — pgTAP 018's "Share Circle"
// ---------------------------------------------------------------------------
// One DAILY task at the circle's target of 100, anchored 30 days back so every
// day in the window is an occasion and the schedule never masks a target
// effect. B is the member whose share moves; C never gets one.
const TASK = "task-ratib";
const B = "member-b";
const C = "member-c";
const UTC = "UTC";

const TODAY = "2026-08-09";
const PAST = "2026-08-04";

/** The circle's own target, unedited: one open version from the task's birth. */
const circleOnly: Version[] = [
  {
    target_count: 100,
    effective_from: "2026-07-10T00:00:00Z",
    effective_to: null,
  },
];

/** B raised to 500, at noon today. */
const raised: Share[] = toShares([
  {
    task_id: TASK,
    user_id: B,
    target_count: 500,
    effective_from: "2026-08-09T12:00:00Z",
    effective_to: null,
  },
]);

describe("shareOn / effectiveTarget — mirrors pgTAP 018", () => {
  // 018 §1 — the default: a circle with no shares set does not move at all
  it("is null when no share was ever set", () => {
    assert.equal(shareOn([], TASK, B, TODAY, UTC), null);
  });

  it("falls back to the circle's target", () => {
    assert.equal(
      effectiveTarget(
        shareOn([], TASK, B, TODAY, UTC),
        circleTargetOn(circleOnly, TODAY),
      ),
      100,
    );
  });

  it("agrees on a past day — an unshared circle does not move", () => {
    assert.equal(
      effectiveTarget(
        shareOn([], TASK, B, PAST, UTC),
        circleTargetOn(circleOnly, PAST),
      ),
      100,
    );
  });

  // 018 §2 — THE ONE THAT CARRIES THE MIGRATION
  it("leaves a past day judged by the share in force THAT day", () => {
    assert.equal(shareOn(raised, TASK, B, PAST, UTC), null);
    assert.equal(
      effectiveTarget(
        shareOn(raised, TASK, B, PAST, UTC),
        circleTargetOn(circleOnly, PAST),
      ),
      100,
    );
  });

  it("governs TODAY by the new share — a raise bites immediately", () => {
    assert.equal(shareOn(raised, TASK, B, TODAY, UTC), 500);
    assert.equal(
      effectiveTarget(
        shareOn(raised, TASK, B, TODAY, UTC),
        circleTargetOn(circleOnly, TODAY),
      ),
      500,
    );
  });

  // 018 §3 — the share is PER MEMBER
  it("leaves another member on the circle's target", () => {
    assert.equal(shareOn(raised, TASK, C, TODAY, UTC), null);
    assert.equal(
      effectiveTarget(
        shareOn(raised, TASK, C, TODAY, UTC),
        circleTargetOn(circleOnly, TODAY),
      ),
      100,
    );
  });

  // 018 §4 — greatest(), NOT coalesce()
  it("lets a later circle-wide raise win over a standing share", () => {
    // The circle moves 100 -> 800: the open version closes and a new one opens.
    const circleRaised: Version[] = [
      {
        target_count: 100,
        effective_from: "2026-07-10T00:00:00Z",
        effective_to: "2026-08-09T13:00:00Z",
      },
      {
        target_count: 800,
        effective_from: "2026-08-09T13:00:00Z",
        effective_to: null,
      },
    ];
    assert.equal(
      effectiveTarget(
        shareOn(raised, TASK, B, TODAY, UTC),
        circleTargetOn(circleRaised, TODAY),
      ),
      800,
      "no stale row may quietly lower a bar",
    );
    assert.equal(
      effectiveTarget(
        shareOn(raised, TASK, C, TODAY, UTC),
        circleTargetOn(circleRaised, TODAY),
      ),
      800,
    );
  });

  // 018 §6 — clearing returns the member to the circle, keeping the history
  it("returns the member to the circle's target once cleared", () => {
    const cleared = toShares([
      {
        task_id: TASK,
        user_id: B,
        target_count: 500,
        effective_from: "2026-08-04T12:00:00Z",
        effective_to: "2026-08-09T09:00:00Z",
      },
    ]);
    assert.equal(shareOn(cleared, TASK, B, TODAY, UTC), null);
    assert.equal(
      effectiveTarget(
        shareOn(cleared, TASK, B, TODAY, UTC),
        circleTargetOn(circleOnly, TODAY),
      ),
      100,
    );
    // ...while the days it covered are still judged by it. Half-open on the
    // upper bound, so the day it was cleared is already back to the circle's.
    assert.equal(shareOn(cleared, TASK, B, PAST, UTC), 500);
    assert.equal(
      effectiveTarget(
        shareOn(cleared, TASK, B, PAST, UTC),
        circleTargetOn(circleOnly, PAST),
      ),
      500,
    );
  });

  // 018 §5 — a change closes one interval and opens the next
  it("reads the open interval when a share has been changed", () => {
    const changed = toShares([
      {
        task_id: TASK,
        user_id: B,
        target_count: 500,
        effective_from: "2026-08-04T12:00:00Z",
        effective_to: "2026-08-09T09:00:00Z",
      },
      {
        task_id: TASK,
        user_id: B,
        target_count: 700,
        effective_from: "2026-08-09T09:00:00Z",
        effective_to: null,
      },
    ]);
    assert.equal(shareOn(changed, TASK, B, TODAY, UTC), 700);
    assert.equal(shareOn(changed, TASK, B, PAST, UTC), 500);
  });
});

// ---------------------------------------------------------------------------
// The member's own calendar — `private.user_date`, not UTC
// ---------------------------------------------------------------------------
// task-config.ts's header measures this: an edit at 14:29 UTC has already
// happened on the NEXT local day in Sydney, so reducing in UTC puts the
// boundary a whole day out. It is the bug the migration exists to prevent,
// coming back through the date cast.
describe("shareOn reduces on the MEMBER's calendar", () => {
  const lateUtc: Share[] = toShares([
    {
      task_id: TASK,
      user_id: B,
      target_count: 500,
      effective_from: "2026-08-09T14:29:00Z",
      effective_to: null,
    },
  ]);

  it("is in force today for a member on UTC", () => {
    assert.equal(shareOn(lateUtc, TASK, B, TODAY, UTC), 500);
  });

  it("is NOT yet in force on the same date for a member in Sydney", () => {
    // 14:29Z is already 00:29 on the 10th in Sydney, so the 9th is untouched —
    // reducing in UTC would have re-judged their whole day at 500.
    assert.equal(shareOn(lateUtc, TASK, B, TODAY, "Australia/Sydney"), null);
    assert.equal(
      shareOn(lateUtc, TASK, B, "2026-08-10", "Australia/Sydney"),
      500,
    );
  });
});

// ---------------------------------------------------------------------------
// Client-only — no SQL twin, so this section is their whole coverage
// ---------------------------------------------------------------------------
describe("currentShares / isRaised", () => {
  const mixed: Share[] = toShares([
    // B: closed, then reopened higher.
    {
      task_id: TASK,
      user_id: B,
      target_count: 500,
      effective_from: "2026-08-01T00:00:00Z",
      effective_to: "2026-08-05T00:00:00Z",
    },
    {
      task_id: TASK,
      user_id: B,
      target_count: 700,
      effective_from: "2026-08-05T00:00:00Z",
      effective_to: null,
    },
    // C: closed and never reopened — back on the circle's number.
    {
      task_id: TASK,
      user_id: C,
      target_count: 300,
      effective_from: "2026-08-01T00:00:00Z",
      effective_to: "2026-08-05T00:00:00Z",
    },
    // A different task entirely.
    {
      task_id: "task-other",
      user_id: B,
      target_count: 900,
      effective_from: "2026-08-01T00:00:00Z",
      effective_to: null,
    },
  ]);

  it("reports only the OPEN share, per member, for one task", () => {
    assert.deepEqual(currentShares(mixed, TASK), { [B]: 700 });
  });

  it("reports nothing for a task nobody has a share on", () => {
    assert.deepEqual(currentShares(mixed, "task-unshared"), {});
  });

  it("counts a share as raised only when it exceeds the circle's target", () => {
    assert.equal(isRaised(700, 100), true);
    assert.equal(isRaised(100, 100), false, "equal is not raised");
    assert.equal(isRaised(null, 100), false);
  });
});
