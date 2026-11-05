import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAdminZone } from "./admin-zone.ts";

describe("isAdminZone", () => {
  it("always holds /admin, whatever the viewer flag says", () => {
    assert.equal(isAdminZone("/admin", false), true);
    assert.equal(isAdminZone("/admin/organisers", false), true);
  });
  it("holds every /programme screen for an organiser", () => {
    assert.equal(isAdminZone("/programme", true), true);
    assert.equal(isAdminZone("/programme/abc/progress", true), true);
    assert.equal(isAdminZone("/programme/connect", true), true);
  });
  it("leaves /programme in the circle's navigation for anyone else", () => {
    assert.equal(isAdminZone("/programme", false), false);
    assert.equal(isAdminZone("/programme/abc/progress", false), false);
  });
  it("does not match a route that only shares the prefix", () => {
    assert.equal(isAdminZone("/administrator", true), false);
    assert.equal(isAdminZone("/programmes", true), false);
  });
  it("leaves the member's screens alone for an organiser", () => {
    assert.equal(isAdminZone("/groups", true), false);
    assert.equal(isAdminZone("/profile", true), false);
    assert.equal(isAdminZone("/g/abc/roadmap", true), false);
  });
});
