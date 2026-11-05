import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { myProgressCircle, type MyCircle } from "./my-progress-circle.ts";

const circle = (id: string, ...roadmaps: string[]): MyCircle => ({
  group_id: id,
  groups: {
    name: `Circle ${id}`,
    group_roadmaps: roadmaps.map((roadmap_id) => ({ roadmap_id })),
  },
});

describe("myProgressCircle", () => {
  it("finds a following circle when the active one does not follow it", () => {
    assert.deepEqual(
      myProgressCircle([circle("a"), circle("b", "r")], "r", "a"),
      { groupId: "b", name: "Circle b" },
    );
  });
  it("prefers the active circle when several follow it", () => {
    assert.equal(
      myProgressCircle([circle("a", "r"), circle("b", "r")], "r", "b")?.groupId,
      "b",
    );
  });
  it("falls back to the first with no active circle", () => {
    assert.equal(
      myProgressCircle([circle("a", "r"), circle("b", "r")], "r", null)
        ?.groupId,
      "a",
    );
  });
  it("answers null when no circle of theirs follows it", () => {
    assert.equal(myProgressCircle([circle("a", "other")], "r", "a"), null);
    assert.equal(myProgressCircle([], "r", null), null);
  });
  it("ignores a membership whose circle could not be read", () => {
    assert.equal(
      myProgressCircle([{ group_id: "a", groups: null }], "r", "a"),
      null,
    );
  });
});
