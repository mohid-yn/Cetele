/**
 * The garden's reward rules. None has a database twin — they exist only on the
 * client — so this file is their entire coverage. The rules it pins are the
 * ones that would quietly break D8/D49 if they drifted: a plot that moves, a
 * replayed loss, a rare bloom that a reload can re-roll.
 *
 *   pnpm test:unit
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BLOOM_KINDS,
  arrangeBed,
  bloomKind,
  dailyVisitor,
  diffSince,
  hash32,
  isRareBloom,
  joinNames,
  parseSnapshot,
  stageProgress,
  sunHeight,
  type GardenMember,
} from "./garden.ts";

const m = (userId: string, tended = false, isMe = false): GardenMember => ({
  userId,
  name: userId.toUpperCase(),
  isMe,
  tended,
});

describe("stageProgress", () => {
  it("measures progress inside the current stage band", () => {
    assert.deepEqual(stageProgress(0), { stage: 0, next: 1, pct: 0 });
    assert.deepEqual(stageProgress(0.3), { stage: 1, next: 2, pct: 0.5 });
    const g = stageProgress(0.525);
    assert.equal(g.stage, 2);
    assert.equal(g.next, 3);
    assert.ok(Math.abs(g.pct - 0.5) < 1e-9);
  });
  it("agrees with gardenStage's thresholds at every boundary", () => {
    assert.equal(stageProgress(0.199).stage, 0);
    assert.equal(stageProgress(0.2).stage, 1);
    assert.equal(stageProgress(0.4).stage, 2);
    assert.equal(stageProgress(0.65).stage, 3);
  });
  it("has no next stage at the top", () => {
    const top = stageProgress(1);
    assert.equal(top.next, null);
    assert.equal(top.pct, 1);
  });
});

describe("sunHeight", () => {
  it("is down at zero, fully up at the goal", () => {
    assert.equal(sunHeight(0), 0);
    assert.equal(sunHeight(1), 1);
    assert.equal(sunHeight(1.4), 1);
  });
  it("peeks over the hill on the very first count", () => {
    assert.ok(sunHeight(0.01) >= 0.12);
  });
  it("only ever rises, and rises fastest near the goal", () => {
    let prev = 0;
    for (let t = 0.05; t <= 1; t += 0.05) {
      const h = sunHeight(t);
      assert.ok(h >= prev, `not monotonic at ${t}`);
      prev = h;
    }
    const early = sunHeight(0.2) - sunHeight(0.1);
    const late = sunHeight(0.9) - sunHeight(0.8);
    assert.ok(late > early);
  });
});

describe("seeded variety", () => {
  it("hash32 is stable", () => {
    assert.equal(hash32("cetele"), hash32("cetele"));
    assert.notEqual(hash32("a"), hash32("b"));
  });
  it("a member's flower never changes", () => {
    assert.equal(bloomKind("u1"), bloomKind("u1"));
    assert.ok(BLOOM_KINDS.includes(bloomKind("u1")));
  });
  it("rare blooms and visitors are the same for every viewer and reload", () => {
    assert.equal(
      isRareBloom("g", "2026-11-06", "u"),
      isRareBloom("g", "2026-11-06", "u"),
    );
    assert.equal(
      dailyVisitor("g", "2026-11-06"),
      dailyVisitor("g", "2026-11-06"),
    );
  });
  it("rare blooms are rare (roughly 1 in 9)", () => {
    let rare = 0;
    for (let i = 0; i < 9000; i++) if (isRareBloom("g", `d${i}`, "u")) rare++;
    assert.ok(rare > 700 && rare < 1300, `got ${rare}`);
  });
  it("the golden butterfly is the rarest visitor", () => {
    const n: Record<string, number> = {};
    for (let i = 0; i < 10000; i++) {
      const v = dailyVisitor("g", `d${i}`);
      n[v] = (n[v] ?? 0) + 1;
    }
    assert.ok(n["golden-butterfly"] < n.bird);
    assert.ok(n.bird < n.bee && n.bee < n.butterfly);
  });
});

describe("arrangeBed", () => {
  it("is one plot per member, in an order activity cannot change", () => {
    const a = arrangeBed([m("c"), m("a", true), m("b")], 1, 0);
    const b = arrangeBed([m("b", true), m("c", true), m("a")], 2, 0);
    assert.deepEqual(
      a.map((p) => p.member?.userId),
      b.map((p) => p.member?.userId),
    );
    assert.deepEqual(
      a.map((p) => p.blooming),
      [true, false, false],
    );
  });
  it("past 12 members becomes proportional, with exactly `blooms` open", () => {
    const big = Array.from({ length: 20 }, (_, i) => m(`u${i}`, i < 5));
    const bed = arrangeBed(big, 3, 0);
    assert.equal(bed.length, 12);
    assert.ok(bed.every((p) => p.member === null));
    assert.equal(bed.filter((p) => p.blooming).length, 3);
  });
});

describe("diffSince", () => {
  const now = { day: "2026-11-06", tended: ["a", "b"], closed: true, stage: 2 };
  it("replays nothing on a first visit", () => {
    assert.deepEqual(diffSince(null, now), {
      newlyTended: [],
      justClosed: false,
      stagedUp: false,
    });
  });
  it("replays only what is new today", () => {
    const prev = { day: "2026-11-06", tended: ["a"], closed: false, stage: 2 };
    assert.deepEqual(diffSince(prev, now), {
      newlyTended: ["b"],
      justClosed: true,
      stagedUp: false,
    });
  });
  it("treats everything as new after a day boundary, but compares stage", () => {
    const prev = {
      day: "2026-11-05",
      tended: ["a", "b"],
      closed: true,
      stage: 1,
    };
    assert.deepEqual(diffSince(prev, now), {
      newlyTended: ["a", "b"],
      justClosed: true,
      stagedUp: true,
    });
  });
  it("never replays a loss (D49)", () => {
    const prev = {
      day: "2026-11-06",
      tended: ["a", "b", "c"],
      closed: true,
      stage: 3,
    };
    assert.deepEqual(diffSince(prev, now), {
      newlyTended: [],
      justClosed: false,
      stagedUp: false,
    });
  });
});

describe("parseSnapshot", () => {
  it("reads a good snapshot and rejects junk", () => {
    const s = { day: "d", tended: ["a"], closed: false, stage: 1 };
    assert.deepEqual(parseSnapshot(JSON.stringify(s)), s);
    assert.equal(parseSnapshot(null), null);
    assert.equal(parseSnapshot("{"), null);
    assert.equal(parseSnapshot('{"day":1}'), null);
  });
});

describe("joinNames", () => {
  it("reads naturally at every length", () => {
    assert.equal(joinNames([]), "");
    assert.equal(joinNames(["A"]), "A");
    assert.equal(joinNames(["A", "B"]), "A and B");
    assert.equal(joinNames(["A", "B", "C"]), "A, B and C");
    assert.equal(joinNames(["A", "B", "C", "D", "E"]), "A, B and 3 others");
  });
});
