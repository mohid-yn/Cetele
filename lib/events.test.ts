import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRsvp,
  clock,
  formatMoment,
  formatWhen,
  hasRoom,
  isoToVenueLocal,
  needsZoneLabel,
  relativeDay,
  repliesOpen,
  upNext,
  venueLocalToISO,
  zoneCity,
  type UpcomingEvent,
} from "./events.ts";

const MEL = "Australia/Melbourne";
const now = new Date("2026-11-10T00:00:00Z"); // Tue 10 Nov, 11am in Melbourne

const ev = (over: Partial<UpcomingEvent> = {}): UpcomingEvent => ({
  id: "e",
  kind: "halaqah",
  title: "Halaqah",
  venue: "",
  startsAt: "2026-11-12T08:00:00Z", // Thu 7pm Melbourne
  endsAt: "2026-11-12T09:30:00Z",
  timezone: MEL,
  status: "published",
  branchName: "South East",
  rsvpClosesAt: null,
  capacity: null,
  myStatus: null,
  going: 0,
  maybe: 0,
  openPolls: 0,
  myOpenVotes: 0,
  questions: 0,
  ...over,
});

describe("repliesOpen", () => {
  it("is open until the deadline, else until the end", () => {
    assert.equal(repliesOpen(ev(), now), true);
    assert.equal(
      repliesOpen(ev({ rsvpClosesAt: "2026-11-09T00:00:00Z" }), now),
      false,
    );
    assert.equal(
      repliesOpen(ev({ endsAt: "2026-11-09T00:00:00Z" }), now),
      false,
    );
  });
  it("is closed on a cancelled event", () => {
    assert.equal(repliesOpen(ev({ status: "cancelled" }), now), false);
  });
});

describe("hasRoom", () => {
  it("is unlimited without a capacity", () => {
    assert.equal(hasRoom(ev({ going: 500 })), true);
  });
  it("is full at capacity, except for someone already going", () => {
    assert.equal(hasRoom(ev({ capacity: 2, going: 2 })), false);
    assert.equal(
      hasRoom(ev({ capacity: 2, going: 2, myStatus: "going" })),
      true,
    );
  });
});

describe("upNext", () => {
  it("shows nothing when there is nothing to do", () => {
    assert.equal(upNext([], now), null);
    assert.equal(upNext([ev({ myStatus: "maybe" })], now), null);
  });
  it("asks for a vote before a reply", () => {
    const a = ev({ id: "a" });
    const b = ev({ id: "b", startsAt: "2026-11-13T08:00:00Z", openPolls: 1 });
    assert.deepEqual(upNext([a, b], now), { event: b, reason: "vote" });
  });
  it("does not ask someone who said no to vote", () => {
    const e = ev({ openPolls: 1, myStatus: "no" });
    assert.equal(upNext([e], now), null);
  });
  it("asks for a reply within a week, and not beyond", () => {
    assert.equal(upNext([ev()], now)?.reason, "reply");
    assert.equal(
      upNext(
        [
          ev({
            startsAt: "2026-11-20T08:00:00Z",
            endsAt: "2026-11-20T09:00:00Z",
          }),
        ],
        now,
      ),
      null,
    );
  });
  it("does not ask for a reply when it is full or closed", () => {
    assert.equal(upNext([ev({ capacity: 1, going: 1 })], now), null);
    assert.equal(
      upNext([ev({ rsvpClosesAt: "2026-11-09T00:00:00Z" })], now),
      null,
    );
  });
  it("reminds someone going within two days", () => {
    const wed = {
      startsAt: "2026-11-11T08:00:00Z",
      endsAt: "2026-11-11T09:30:00Z",
    };
    assert.equal(
      upNext([ev({ myStatus: "going", ...wed })], now)?.reason,
      "soon",
    );
    assert.equal(
      upNext(
        [
          ev({
            myStatus: "going",
            startsAt: "2026-11-15T08:00:00Z",
            endsAt: "2026-11-15T09:00:00Z",
          }),
        ],
        now,
      ),
      null,
    );
  });
  it("ignores cancelled and finished events", () => {
    assert.equal(upNext([ev({ status: "cancelled" })], now), null);
    assert.equal(upNext([ev({ endsAt: "2026-11-09T00:00:00Z" })], now), null);
  });
});

describe("clock", () => {
  it("writes times the way a flyer does", () => {
    assert.equal(clock(19, 0), "7pm");
    assert.equal(clock(19, 30), "7:30pm");
    assert.equal(clock(0, 5), "12:05am");
    assert.equal(clock(12, 0), "12pm");
  });
});

describe("formatWhen", () => {
  it("formats a session in the venue's zone", () => {
    assert.equal(
      formatWhen("2026-11-12T08:00:00Z", "2026-11-12T09:30:00Z", MEL),
      "Thu 12 Nov · 7–8:30pm",
    );
  });
  it("keeps both suffixes across noon", () => {
    assert.equal(
      formatWhen("2026-11-12T00:00:00Z", "2026-11-12T02:00:00Z", MEL),
      "Thu 12 Nov · 11am–1pm",
    );
  });
  it("formats a weekend camp", () => {
    assert.equal(
      formatWhen("2026-11-13T07:00:00Z", "2026-11-15T05:00:00Z", MEL),
      "Fri 13 – Sun 15 Nov",
    );
    assert.equal(
      formatWhen("2026-11-27T07:00:00Z", "2026-11-29T05:00:00Z", MEL).includes(
        "Nov",
      ),
      true,
    );
  });
  it("names both months when a camp crosses one", () => {
    assert.equal(
      formatWhen("2026-11-27T07:00:00Z", "2026-12-01T05:00:00Z", MEL),
      "Fri 27 Nov – Tue 1 Dec",
    );
  });
});

describe("formatMoment", () => {
  it("formats one instant at the venue", () => {
    assert.equal(formatMoment("2026-11-12T08:00:00Z", MEL), "Thu 12 Nov, 7pm");
  });
});

describe("zone labels", () => {
  it("names the city", () => {
    assert.equal(zoneCity(MEL), "Melbourne");
    assert.equal(zoneCity("America/New_York"), "New York");
  });
  it("labels only when the viewer's clock differs", () => {
    assert.equal(needsZoneLabel("2026-11-12T08:00:00Z", MEL, MEL), false);
    // Sydney shares Melbourne's clock.
    assert.equal(
      needsZoneLabel("2026-11-12T08:00:00Z", MEL, "Australia/Sydney"),
      false,
    );
    // Brisbane has no daylight saving, so in November it is an hour behind.
    assert.equal(
      needsZoneLabel("2026-11-12T08:00:00Z", MEL, "Australia/Brisbane"),
      true,
    );
  });
});

describe("relativeDay", () => {
  it("says today, tomorrow, a weekday, then a date", () => {
    assert.equal(relativeDay("2026-11-10T08:00:00Z", MEL, now), "Today");
    assert.equal(relativeDay("2026-11-11T08:00:00Z", MEL, now), "Tomorrow");
    assert.equal(relativeDay("2026-11-12T08:00:00Z", MEL, now), "Thu");
    assert.equal(relativeDay("2026-11-20T08:00:00Z", MEL, now), "20 Nov");
  });
  it("judges the day on the venue's calendar, not UTC's", () => {
    // 1am Melbourne on the 11th is 2pm UTC on the 10th: "Tomorrow", not "Today".
    assert.equal(relativeDay("2026-11-10T14:00:00Z", MEL, now), "Tomorrow");
  });
});

describe("venue-local times", () => {
  it("reads a wall-clock time at the venue", () => {
    // November: Melbourne is UTC+11.
    assert.equal(
      venueLocalToISO("2026-11-12T19:00", MEL),
      "2026-11-12T08:00:00.000Z",
    );
    // June: UTC+10.
    assert.equal(
      venueLocalToISO("2026-06-11T19:00", MEL),
      "2026-06-11T09:00:00.000Z",
    );
    assert.equal(
      venueLocalToISO("2026-11-12T19:00", "Australia/Brisbane"),
      "2026-11-12T09:00:00.000Z",
    );
  });
  it("uses the offset of the time typed on a changeover day", () => {
    // Daylight saving starts 2026-10-04 at 2am in Melbourne.
    assert.equal(
      venueLocalToISO("2026-10-04T01:00", MEL),
      "2026-10-03T15:00:00.000Z",
    );
    assert.equal(
      venueLocalToISO("2026-10-04T10:00", MEL),
      "2026-10-03T23:00:00.000Z",
    );
  });
  it("round-trips", () => {
    for (const local of [
      "2026-11-12T19:00",
      "2026-06-11T07:30",
      "2026-01-01T00:00",
    ]) {
      assert.equal(isoToVenueLocal(venueLocalToISO(local, MEL), MEL), local);
    }
  });
  it("refuses a malformed value", () => {
    assert.throws(() => venueLocalToISO("tomorrow", MEL));
  });
});

describe("applyRsvp", () => {
  it("moves one count between answers", () => {
    const e = ev({ going: 3, maybe: 2, myStatus: "maybe" });
    const after = applyRsvp(e, "going", "maybe");
    assert.equal(after.going, 4);
    assert.equal(after.maybe, 1);
    assert.equal(after.myStatus, "going");
  });
  it("clearing takes one away, never below zero", () => {
    assert.equal(
      applyRsvp(ev({ going: 1, myStatus: "going" }), null, "going").going,
      0,
    );
    assert.equal(applyRsvp(ev({ going: 0 }), null, "going").going, 0);
  });
  it("a 'no' changes neither count", () => {
    const after = applyRsvp(ev({ going: 2, maybe: 2 }), "no", null);
    assert.deepEqual([after.going, after.maybe], [2, 2]);
  });
});
