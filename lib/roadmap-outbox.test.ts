import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OUTBOX_MAX_AGE_MS,
  pendingFor,
  withoutExpired,
  type Outbox,
} from "./roadmap-outbox.ts";

const NOW = 1_000_000_000;
const outbox: Outbox = {
  fresh: { done: 3, at: NOW - 1000 },
  stale: { done: 9, at: NOW - OUTBOX_MAX_AGE_MS },
  other: { done: 1, at: NOW - 1000 },
};

describe("pendingFor", () => {
  it("returns a recent save for an item on this screen", () => {
    assert.deepEqual(pendingFor(outbox, new Set(["fresh"]), NOW), [
      { id: "fresh", done: 3 },
    ]);
  });
  it("never resends an expired save", () => {
    assert.deepEqual(pendingFor(outbox, new Set(["stale"]), NOW), []);
  });
  it("leaves another roadmap's items out", () => {
    assert.deepEqual(pendingFor(outbox, new Set(["missing"]), NOW), []);
  });
  it("keeps a save of zero, which is an undo and not an absence", () => {
    assert.deepEqual(
      pendingFor({ a: { done: 0, at: NOW } }, new Set(["a"]), NOW),
      [{ id: "a", done: 0 }],
    );
  });
});

describe("withoutExpired", () => {
  it("drops only what has expired, including other roadmaps' fresh saves", () => {
    assert.deepEqual(Object.keys(withoutExpired(outbox, NOW)).sort(), [
      "fresh",
      "other",
    ]);
  });
});
