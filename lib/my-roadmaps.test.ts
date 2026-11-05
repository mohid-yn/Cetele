import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { followsRoadmap, type MyCircle } from "./my-roadmaps.ts";

const circle = (...roadmaps: string[]): MyCircle => ({
  groups: { group_roadmaps: roadmaps.map((roadmap_id) => ({ roadmap_id })) },
});

describe("followsRoadmap", () => {
  it("finds it in any circle, not only the first", () => {
    assert.equal(followsRoadmap([circle(), circle("r")], "r"), true);
  });
  it("answers false when their circles follow something else", () => {
    assert.equal(followsRoadmap([circle("other")], "r"), false);
    assert.equal(followsRoadmap([], "r"), false);
  });
  it("ignores a membership whose circle could not be read", () => {
    assert.equal(followsRoadmap([{ groups: null }], "r"), false);
  });
});
