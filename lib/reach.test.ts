import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lineage, subtreeCircleCounts, type ReachBranch } from "./reach.ts";

// YN → MEL → {NORTH, SOUTH};  YN → SYD
const tree: ReachBranch[] = [
  { id: "yn", parentId: null, name: "Youth Nexus", depth: 0, circles: 1 },
  { id: "mel", parentId: "yn", name: "Melbourne", depth: 1, circles: 0 },
  { id: "north", parentId: "mel", name: "North", depth: 2, circles: 3 },
  { id: "south", parentId: "mel", name: "South", depth: 2, circles: 2 },
  { id: "syd", parentId: "yn", name: "Sydney", depth: 1, circles: 4 },
];

describe("subtreeCircleCounts", () => {
  it("counts a branch's own circles plus every branch inside it", () => {
    const c = subtreeCircleCounts(tree);
    assert.equal(c.get("north"), 3);
    assert.equal(c.get("mel"), 5);
    assert.equal(c.get("yn"), 10);
    assert.equal(c.get("syd"), 4);
  });

  it("does not depend on the order the rows arrive in", () => {
    const c = subtreeCircleCounts([...tree].reverse());
    assert.equal(c.get("yn"), 10);
  });

  it("gives an empty branch zero, not undefined", () => {
    const c = subtreeCircleCounts([
      { id: "x", parentId: null, name: "X", depth: 0, circles: 0 },
    ]);
    assert.equal(c.get("x"), 0);
  });

  it("counts a steward's partial tree from its own top", () => {
    // A steward of Melbourne is not sent Youth Nexus.
    const c = subtreeCircleCounts(tree.filter((b) => b.id !== "yn"));
    assert.equal(c.get("mel"), 5);
  });
});

describe("lineage", () => {
  it("is the branch and every ancestor, nearest first", () => {
    assert.deepEqual(lineage(tree, "north"), ["north", "mel", "yn"]);
  });
  it("is empty for a circle in no branch", () => {
    assert.deepEqual(lineage(tree, null), []);
  });
});
