import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { followsRoadmap, takePartOffer, type MyCircle } from "./my-roadmaps.ts";

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

describe("takePartOffer", () => {
  const base = {
    isOrganiser: true,
    published: true,
    closed: false,
    inFollowingCircle: false,
    takingPart: false,
  };
  it("offers joining to an organiser with no way to log", () => {
    assert.equal(takePartOffer(base), "join");
  });
  it("offers nothing to a member", () => {
    assert.equal(takePartOffer({ ...base, isOrganiser: false }), null);
  });
  it("offers nothing on a draft", () => {
    assert.equal(takePartOffer({ ...base, published: false }), null);
  });
  it("offers nothing when a circle already lets them log", () => {
    assert.equal(takePartOffer({ ...base, inFollowingCircle: true }), null);
  });
  it("does not invite anyone onto a closed roadmap", () => {
    assert.equal(takePartOffer({ ...base, closed: true }), null);
  });
  it("always lets someone taking part leave, even after it closes", () => {
    assert.equal(
      takePartOffer({ ...base, takingPart: true, closed: true }),
      "leave",
    );
  });
});
