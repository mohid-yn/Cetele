/**
 * The link matcher's ENTIRE coverage.
 *
 * WHY THIS FILE CARRIES MORE WEIGHT THAN A USUAL TEST. `lib/shares.test.ts` is a
 * cross-check: every case there is a case pgTAP 018 asserts against the SQL, so a
 * mistake has two chances to be caught. Nothing in `lib/task-links.ts` has a
 * database twin — 0034 holds the cluster, the fan-out and the same-circle
 * refusal, and knows nothing whatever about how two names are compared. If a
 * rule below is wrong, nothing else in the repo disagrees with it.
 *
 * Runs on Node's own test runner with native type stripping — no dependency:
 *   pnpm test:unit
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_SUGGESTIONS,
  SUGGEST_THRESHOLD,
  labelSimilarity,
  normaliseLabel,
  suggestLinks,
  tokenSimilarity,
  tokenise,
  tokensMatch,
  type LinkableTask,
} from "./task-links.ts";

// ---------------------------------------------------------------------------
// A member in three circles, all of which ask for salawat.
// ---------------------------------------------------------------------------

const task = (
  taskId: string,
  label: string,
  groupId: string,
  groupName: string,
): LinkableTask => ({ taskId, label, groupId, groupName });

const fajrSalawat = task("t1", "Salawat", "g1", "Fajr Circle");
const asrSalawat = task("t2", "Salawat ×100", "g2", "Asr Circle");
const ishaSalawat = task("t3", "Salawaat", "g3", "Isha Circle");
const fajrIstighfar = task("t4", "Istighfar", "g1", "Fajr Circle");
const asrSubhanallah = task("t5", "Subhanallah 33", "g2", "Asr Circle");

// ---------------------------------------------------------------------------
// normaliseLabel — what a label is ABOUT
// ---------------------------------------------------------------------------

describe("normaliseLabel", () => {
  it("folds case and strips punctuation", () => {
    assert.equal(normaliseLabel("Salawat!"), "salawat");
    assert.equal(normaliseLabel("  EVENING   DHIKR  "), "evening dhikr");
    assert.equal(normaliseLabel("Salawat / Durood"), "salawat durood");
  });

  it("strips combining marks — Latin accents and Arabic harakat alike", () => {
    assert.equal(normaliseLabel("Salât"), "salat");
    // ٱلْحَمْدُ and الحمد are the same word; only one of them was typed with vowels.
    assert.equal(normaliseLabel("الْحَمْدُ"), normaliseLabel("الحمد"));
  });

  it("strips a trailing count, however it was written", () => {
    for (const written of [
      "Salawat ×100",
      "Salawat x100",
      "Salawat x 100",
      "Salawat 100",
      "Salawat 100x",
      "Salawat (100)",
      "Salawat - 100",
    ]) {
      assert.equal(normaliseLabel(written), "salawat", written);
    }
  });

  it("strips more than one trailing count", () => {
    assert.equal(normaliseLabel("Salawat (100) ×3"), "salawat");
  });

  it("does not eat a word that happens to end in x or a digit", () => {
    // Without the lookbehind this reduced to "ma" — the x of "Max" read as a
    // multiplication sign.
    assert.equal(normaliseLabel("Max 100"), "max");
    assert.equal(normaliseLabel("Covid19"), "covid19");
  });

  it("survives a label that is nothing but a count", () => {
    assert.equal(normaliseLabel("100"), "");
    assert.deepEqual(tokenise("100"), []);
  });
});

// ---------------------------------------------------------------------------
// tokensMatch — the short-token rule is the one that earns its keep
// ---------------------------------------------------------------------------

describe("tokensMatch", () => {
  it("matches a word with itself", () => {
    assert.equal(tokensMatch("salawat", "salawat"), true);
  });

  it("matches a long word with a near miss", () => {
    // 1 edit over 8 characters — 0.875, above FUZZY_RATIO.
    assert.equal(tokensMatch("salawaat", "salawat"), true);
  });

  it("refuses a long word that is merely similar", () => {
    // 3 edits over 9 — 0.67.
    assert.equal(tokensMatch("istighfar", "astaghfar"), false);
  });

  it("REFUSES car/bar — the rule short tokens exist for", () => {
    // One edit over three characters is a ratio of 0.67, which any threshold
    // loose enough to catch a real typo would wave through. Under four
    // characters, only exact.
    assert.equal(tokensMatch("car", "bar"), false);
    assert.equal(tokensMatch("car", "car"), true);
  });

  it("applies the short rule when EITHER side is short", () => {
    assert.equal(tokensMatch("dua", "duaa"), false);
  });
});

// ---------------------------------------------------------------------------
// tokenSimilarity — Dice, one-to-one, exact-first
// ---------------------------------------------------------------------------

describe("tokenSimilarity", () => {
  it("is 1 for the same words", () => {
    assert.equal(tokenSimilarity(["salawat"], ["salawat"]), 1);
  });

  it("is 0 when either side has no words", () => {
    assert.equal(tokenSimilarity([], ["salawat"]), 0);
    assert.equal(tokenSimilarity(["salawat"], []), 0);
  });

  it("offers a qualified name against a bare one", () => {
    // 2×1 / 3 = 0.67 — above the threshold, and right: "Morning Salawat" and
    // "Salawat" are very likely the same act.
    const score = labelSimilarity("Morning Salawat", "Salawat");
    assert.ok(Math.abs(score - 2 / 3) < 1e-9);
    assert.ok(score >= SUGGEST_THRESHOLD);
  });

  it("does NOT offer two sittings that share one common word", () => {
    // 2×1 / 4 = 0.5. "Morning dhikr" and "Evening dhikr" are two different
    // sittings, and this is the case Dice exists to reject — "how much of the
    // shorter one is covered" would have scored both of these a perfect 1.
    const score = labelSimilarity("Morning dhikr", "Evening dhikr");
    assert.equal(score, 0.5);
    assert.ok(score < SUGGEST_THRESHOLD);
  });

  it("matches one-to-one — a repeated word cannot be matched twice", () => {
    assert.equal(tokenSimilarity(["dhikr", "dhikr"], ["dhikr"]), 2 / 3);
  });

  it("spends an exact match before a fuzzy one", () => {
    // "salawat" must consume the exact "salawat", leaving "salawaat" for the
    // near match — matched greedily in one pass, the fuzzy pairing could eat the
    // exact token and leave the other unmatched at 0.5.
    assert.equal(
      tokenSimilarity(["salawaat", "salawat"], ["salawat", "salawaat"]),
      1,
    );
  });

  it("ignores a difference that is only a count", () => {
    assert.equal(labelSimilarity("Salawat ×100", "Salawat 500"), 1);
    assert.equal(labelSimilarity("Subhanallah 33", "Subhanallah"), 1);
  });

  it("is 0 for two unrelated tasks", () => {
    assert.equal(labelSimilarity("Istighfar", "Salawat"), 0);
  });
});

// ---------------------------------------------------------------------------
// suggestLinks — offers only, cross-circle only
// ---------------------------------------------------------------------------

describe("suggestLinks", () => {
  it("offers the same act across two circles", () => {
    const out = suggestLinks([fajrSalawat, asrSalawat]);
    assert.equal(out.length, 1);
    assert.equal(out[0].a.taskId, "t1");
    assert.equal(out[0].b.taskId, "t2");
    assert.equal(out[0].score, 1);
  });

  it("NEVER offers two tasks in the same circle", () => {
    // 0034 refuses this outright — a single act counted twice inside one
    // circle's own collective total. The offer list must not lead a member to a
    // button that exists to be refused.
    const twin = task("t9", "Salawat", "g1", "Fajr Circle");
    assert.deepEqual(suggestLinks([fajrSalawat, twin]), []);
  });

  it("skips a pair that is already one act", () => {
    const cluster = { t1: "c1", t2: "c1" };
    assert.deepEqual(suggestLinks([fajrSalawat, asrSalawat], cluster), []);
  });

  it("still offers a pair in two DIFFERENT clusters — that is the merge", () => {
    const cluster = { t1: "c1", t2: "c2" };
    const out = suggestLinks([fajrSalawat, asrSalawat], cluster);
    assert.equal(out.length, 1);
  });

  it("offers all three pairs when three circles ask for one act", () => {
    const out = suggestLinks([fajrSalawat, asrSalawat, ishaSalawat]);
    assert.equal(out.length, 3);
    // Clusters mean the member only ever has to accept two of them — the third
    // becomes "already one act" the moment the first two are linked.
  });

  it("leaves unrelated tasks alone", () => {
    const out = suggestLinks([fajrIstighfar, asrSubhanallah]);
    assert.deepEqual(out, []);
  });

  it("orders by score, best first", () => {
    const out = suggestLinks([fajrSalawat, asrSalawat, ishaSalawat]);
    assert.ok(out[0].score >= out[1].score);
    assert.ok(out[1].score >= out[2].score);
    // The exact pair beats the near-miss one.
    assert.equal(out[0].score, 1);
  });

  it("is stable — the same input gives the same order", () => {
    const once = suggestLinks([fajrSalawat, asrSalawat, ishaSalawat]);
    const twice = suggestLinks([fajrSalawat, asrSalawat, ishaSalawat]);
    assert.deepEqual(
      once.map((s) => [s.a.taskId, s.b.taskId]),
      twice.map((s) => [s.a.taskId, s.b.taskId]),
    );
  });

  it("caps the offer list", () => {
    // Twelve circles each carrying salawat — 66 pairs, none of which anybody
    // will read past the first handful.
    const many = Array.from({ length: 12 }, (_, i) =>
      task(`t${i}`, "Salawat", `g${i}`, `Circle ${i}`),
    );
    assert.equal(suggestLinks(many).length, MAX_SUGGESTIONS);
    assert.equal(suggestLinks(many, {}, 3).length, 3);
  });

  it("has nothing to offer a member in one circle", () => {
    assert.deepEqual(suggestLinks([fajrSalawat, fajrIstighfar]), []);
  });
});
