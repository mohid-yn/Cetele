/**
 * Events (D80): the pure rules the screens share, kept here so `test:unit` can
 * pin them. Nothing in this file touches the network.
 *
 * TIME. An event's times are instants (`timestamptz`), and every event carries
 * its VENUE's zone. A halaqah at 7pm in Melbourne is shown as 7pm, in Melbourne
 * time, to a member reading it from Perth, because the venue is where they have
 * to be. The label says so when the two zones differ.
 */

export type RsvpStatus = "going" | "maybe" | "no";

/** One row of `my_upcoming_events`, the only read Today's card and /events need. */
export type UpcomingEvent = {
  id: string;
  kind: "camp" | "halaqah";
  title: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: "published" | "cancelled";
  branchName: string;
  rsvpClosesAt: string | null;
  capacity: number | null;
  myStatus: RsvpStatus | null;
  going: number;
  maybe: number;
  openPolls: number;
  myOpenVotes: number;
  questions: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Can the member still answer? Mirrors `set_rsvp`'s refusal rules. */
export function repliesOpen(
  e: { status: string } & Pick<UpcomingEvent, "rsvpClosesAt" | "endsAt">,
  now: Date,
): boolean {
  if (e.status !== "published") return false;
  const closes = new Date(e.rsvpClosesAt ?? e.endsAt).getTime();
  return now.getTime() < closes;
}

/** Is there room for one more "going"? Someone already going always has room. */
export function hasRoom(
  e: Pick<UpcomingEvent, "capacity" | "going" | "myStatus">,
): boolean {
  if (e.capacity == null) return true;
  if (e.myStatus === "going") return true;
  return e.going < e.capacity;
}

export type UpNextReason = "vote" | "reply" | "soon";

/**
 * The ONE thing Today's card shows, or nothing.
 *
 * Today is where people log. The card earns its place only when there is
 * something to do in one tap, or something happening very soon, so it is
 * absent most days rather than a permanent block above the circle.
 *
 * In order: a poll you have not voted in for something in the next week (it
 * closes when the session starts); then an event in the next week you have
 * not answered; then something you are going to within two days.
 */
export function upNext(
  events: UpcomingEvent[],
  now: Date,
): { event: UpcomingEvent; reason: UpNextReason } | null {
  const live = events
    .filter((e) => e.status === "published")
    .filter((e) => new Date(e.endsAt).getTime() > now.getTime())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const within = (e: UpcomingEvent, days: number) =>
    new Date(e.startsAt).getTime() - now.getTime() <= days * DAY_MS;

  const vote = live.find(
    (e) => within(e, 7) && e.openPolls > e.myOpenVotes && e.myStatus !== "no",
  );
  if (vote) return { event: vote, reason: "vote" };

  const reply = live.find(
    (e) =>
      within(e, 7) && e.myStatus == null && repliesOpen(e, now) && hasRoom(e),
  );
  if (reply) return { event: reply, reason: "reply" };

  const soon = live.find((e) => within(e, 2) && e.myStatus === "going");
  if (soon) return { event: soon, reason: "soon" };

  return null;
}

// ---------------------------------------------------------------------------
// Formatting, in the venue's zone
// ---------------------------------------------------------------------------

function parts(iso: string, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(
    f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour),
    min: Number(p.minute),
  };
}

/** "7pm", "7:30pm", "12pm" — the short form people write on a flyer. */
export function clock(h: number, min: number): string {
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return min === 0
    ? `${h12}${suffix}`
    : `${h12}:${String(min).padStart(2, "0")}${suffix}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function weekday(y: number, m: number, d: number): string {
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * When, in the venue's zone.
 *   same day:  "Thu 14 Nov · 7–8:30pm"
 *   multi-day: "Fri 14 – Sun 16 Nov"  /  "Fri 28 Nov – Sun 1 Dec"
 */
export function formatWhen(
  startsAt: string,
  endsAt: string,
  timeZone: string,
): string {
  const s = parts(startsAt, timeZone);
  const e = parts(endsAt, timeZone);
  const sameDay = s.y === e.y && s.m === e.m && s.d === e.d;
  const sDay = `${weekday(s.y, s.m, s.d)} ${s.d}`;
  if (sameDay) {
    const sClock = clock(s.h, s.min);
    const eClock = clock(e.h, e.min);
    // "7–8:30pm" when both are in the afternoon; "11am–1pm" across noon.
    const range =
      sClock.slice(-2) === eClock.slice(-2)
        ? `${sClock.slice(0, -2)}–${eClock}`
        : `${sClock}–${eClock}`;
    return `${sDay} ${MONTHS[s.m - 1]} · ${range}`;
  }
  const eDay = `${weekday(e.y, e.m, e.d)} ${e.d}`;
  return s.m === e.m && s.y === e.y
    ? `${sDay} – ${eDay} ${MONTHS[e.m - 1]}`
    : `${sDay} ${MONTHS[s.m - 1]} – ${eDay} ${MONTHS[e.m - 1]}`;
}

/** The time alone, at the venue: "7pm". */
export function clockAt(iso: string, timeZone: string): string {
  const p = parts(iso, timeZone);
  return clock(p.h, p.min);
}

/** One instant in the venue's zone: "Thu 12 Nov, 7pm". */
export function formatMoment(iso: string, timeZone: string): string {
  const p = parts(iso, timeZone);
  return `${weekday(p.y, p.m, p.d)} ${p.d} ${MONTHS[p.m - 1]}, ${clock(p.h, p.min)}`;
}

/** "Melbourne" from "Australia/Melbourne", for "(Melbourne time)". */
export function zoneCity(timeZone: string): string {
  return (timeZone.split("/").at(-1) ?? timeZone).replace(/_/g, " ");
}

/**
 * Does the viewer need telling which zone the times are in? Only when their
 * own clock reads differently at the event's start: Melbourne and Sydney share
 * a clock most of the year, and saying "(Melbourne time)" to someone in Sydney
 * would be noise.
 */
export function needsZoneLabel(
  startsAt: string,
  eventZone: string,
  viewerZone: string,
): boolean {
  if (eventZone === viewerZone) return false;
  const a = parts(startsAt, eventZone);
  const b = parts(startsAt, viewerZone);
  return a.h !== b.h || a.min !== b.min || a.d !== b.d;
}

/** "Today", "Tomorrow", or the weekday, judged on the venue's calendar. */
export function relativeDay(
  startsAt: string,
  timeZone: string,
  now: Date,
): string {
  const s = parts(startsAt, timeZone);
  const n = parts(now.toISOString(), timeZone);
  const days = Math.round(
    (Date.UTC(s.y, s.m - 1, s.d) - Date.UTC(n.y, n.m - 1, n.d)) / DAY_MS,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7) return weekday(s.y, s.m, s.d);
  return `${s.d} ${MONTHS[s.m - 1]}`;
}

// ---------------------------------------------------------------------------
// The admin form: a wall-clock time AT THE VENUE <-> an instant
// ---------------------------------------------------------------------------

/** Minutes the zone is ahead of UTC at that instant. */
function offsetMinutes(utcMs: number, timeZone: string): number {
  const p = parts(new Date(utcMs).toISOString(), timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  return Math.round((asUtc - Math.floor(utcMs / 60000) * 60000) / 60000);
}

/**
 * "2026-11-14T19:00" typed for a venue in `timeZone` → the ISO instant.
 *
 * The browser's `datetime-local` has no zone, and treating it as the
 * ORGANISER's zone would post a Brisbane camp at the wrong hour whenever a
 * Melbourne steward entered it during daylight saving. Two passes, so a time
 * typed on the day the clocks change resolves with the offset of that time,
 * not of midnight.
 */
export function venueLocalToISO(local: string, timeZone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error("expected YYYY-MM-DDTHH:MM");
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = wall - offsetMinutes(wall, timeZone) * 60000;
  guess = wall - offsetMinutes(guess, timeZone) * 60000;
  return new Date(guess).toISOString();
}

/** The inverse, for filling the form when editing. */
export function isoToVenueLocal(iso: string, timeZone: string): string {
  const p = parts(iso, timeZone);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${two(p.m)}-${two(p.d)}T${two(p.h)}:${two(p.min)}`;
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Poll kinds as the member reads them. */
export const POLL_KINDS = {
  topic: "Topic",
  food: "Food",
  activity: "Activity",
  other: "Poll",
} as const;
export type PollKind = keyof typeof POLL_KINDS;

/** A `my_upcoming_events` row, as PostgREST returns it. */
export type UpcomingRow = {
  id: string;
  kind: string;
  title: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: string;
  branch_name: string;
  rsvp_closes_at: string | null;
  capacity: number | null;
  my_status: string | null;
  going: number;
  maybe: number;
  open_polls: number;
  my_open_votes: number;
  questions: number;
};

export function toUpcoming(r: UpcomingRow): UpcomingEvent {
  return {
    id: r.id,
    kind: r.kind === "camp" ? "camp" : "halaqah",
    title: r.title,
    venue: r.venue,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    timezone: r.timezone,
    status: r.status === "cancelled" ? "cancelled" : "published",
    branchName: r.branch_name,
    rsvpClosesAt: r.rsvp_closes_at,
    capacity: r.capacity,
    myStatus: (r.my_status as RsvpStatus | null) ?? null,
    going: r.going,
    maybe: r.maybe,
    openPolls: r.open_polls,
    myOpenVotes: r.my_open_votes,
    questions: r.questions,
  };
}

/**
 * Keep a card's counts in step with a tap, without a refetch. Moving from
 * "maybe" to "going" takes one from maybe and adds one to going.
 */
export function applyRsvp(
  e: UpcomingEvent,
  next: RsvpStatus | null,
  prev: RsvpStatus | null,
): UpcomingEvent {
  const delta = (s: RsvpStatus) => (next === s ? 1 : 0) - (prev === s ? 1 : 0);
  return {
    ...e,
    myStatus: next,
    going: Math.max(0, e.going + delta("going")),
    maybe: Math.max(0, e.maybe + delta("maybe")),
  };
}
