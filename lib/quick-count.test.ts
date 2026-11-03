import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayedCount, milestoneCrossed } from "./quick-count.ts";

describe("displayedCount", () => {
  it("adds unconfirmed taps to the server's count", () => {
    assert.equal(displayedCount(5, null, 3), 8);
  });
  it("does not dip when a write returns before the page data refreshes", () => {
    assert.equal(displayedCount(5, 8, 0), 8);
  });
  it("follows the server when another device has gone further", () => {
    assert.equal(displayedCount(12, 8, 1), 13);
  });
});

describe("milestoneCrossed", () => {
  it("fires once, on the tap that closes the ring", () => {
    assert.equal(milestoneCrossed(2, 3, 3, 3), "goal");
    assert.equal(milestoneCrossed(1, 2, 3, 3), null);
    assert.equal(milestoneCrossed(3, 4, 3, 3), null);
  });
  it("marks the circle's share on the way to a higher personal goal", () => {
    assert.equal(milestoneCrossed(32, 33, 33, 100), "share");
    assert.equal(milestoneCrossed(33, 34, 33, 100), null);
    assert.equal(milestoneCrossed(99, 100, 33, 100), "goal");
  });
});
