import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  programmeReach,
  programmeReadiness,
  reachSentence,
} from "./programme-readiness.ts";

const item = (level: number, target = 1, category = "book") => ({
  level,
  category,
  categoryLabel: category === "book" ? "Book" : "Listening",
  unit: category === "book" ? "books" : "minutes",
  target,
});

const base = {
  items: [item(1)],
  requirements: [],
  rewards: [{ threshold: 1, label: "First" }],
  endsOn: "2026-12-31",
  todayISO: "2026-06-01",
  circles: 1,
};

const ids = (checks: { id: string }[]) => checks.map((c) => c.id);

describe("programmeReadiness", () => {
  it("passes a complete roadmap with nothing to say", () => {
    assert.deepEqual(programmeReadiness(base), { blockers: [], notes: [] });
  });

  it("blocks an empty roadmap, and does not also complain about its rewards", () => {
    const r = programmeReadiness({ ...base, items: [] });
    assert.deepEqual(ids(r.blockers), ["no-items"]);
  });

  it("blocks a total the items cannot reach", () => {
    const r = programmeReadiness({
      ...base,
      items: [item(1, 200, "listening"), item(1, 100, "listening")],
      requirements: [{ level: 1, category: "listening", minTotal: 600 }],
    });
    assert.deepEqual(ids(r.blockers), ["budget-1-listening"]);
    assert.match(r.blockers[0].message, /600 minutes.*add up to 300/);
  });

  it("allows a total exactly equal to what is available", () => {
    const r = programmeReadiness({
      ...base,
      items: [item(1, 600, "listening")],
      requirements: [{ level: 1, category: "listening", minTotal: 600 }],
    });
    assert.deepEqual(r.blockers, []);
  });

  it("ignores a leftover requirement on a category with no items", () => {
    const r = programmeReadiness({
      ...base,
      requirements: [{ level: 4, category: "listening", minTotal: 600 }],
    });
    assert.deepEqual(r.blockers, []);
  });

  it("blocks a reward nobody can reach, counting levels rather than the highest number", () => {
    const r = programmeReadiness({
      ...base,
      items: [item(1), item(3)],
      rewards: [{ threshold: 3, label: "Trip" }],
    });
    assert.deepEqual(ids(r.blockers), ["reward-Trip"]);
  });

  it("notes the things that are the organiser's call", () => {
    const r = programmeReadiness({
      ...base,
      rewards: [],
      circles: 0,
      todayISO: "2027-01-01",
    });
    assert.deepEqual(r.blockers, []);
    assert.deepEqual(ids(r.notes), ["no-rewards", "closed", "no-circles"]);
  });

  it("treats the closing day itself as still open", () => {
    const r = programmeReadiness({ ...base, todayISO: "2026-12-31" });
    assert.deepEqual(r.notes, []);
  });
});

describe("programmeReach", () => {
  it("keeps a draft private even with circles lined up", () => {
    const r = programmeReach(false, [{}], 4);
    assert.equal(r.state, "draft");
    assert.match(reachSentence(r), /Only organisers.*1 circle will get it/);
  });

  it("says a draft with no circles is simply private", () => {
    assert.equal(
      reachSentence(programmeReach(false, [], 0)),
      "Only organisers can see this.",
    );
  });

  it("does not call a published roadmap with no circles live", () => {
    const r = programmeReach(true, [], 0);
    assert.equal(r.state, "unassigned");
    assert.match(reachSentence(r), /no member can see it/);
  });

  it("reports the people it is given, and pluralises", () => {
    // 3 people across 2 circles: someone in both counts once. The server does
    // that sum (`roadmap_reach`), pgTAP 022 pins it.
    assert.equal(
      reachSentence(programmeReach(true, [{}, {}], 3)),
      "Live for 3 members in 2 circles.",
    );
    assert.equal(
      reachSentence(programmeReach(true, [{}], 1)),
      "Live for 1 member in 1 circle.",
    );
  });
});
