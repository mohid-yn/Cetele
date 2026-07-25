/**
 * The derived half of the v2 retention layer (CET-17 / CET-19 / CET-21 / CET-22).
 *
 * Four of the six v2 features store nothing at all — they are functions of data
 * the app already has (group consistency, the 7-day standings, a membership's
 * age, a streak's last-active date). Keeping that arithmetic here, pure and
 * server-side, means the screens stay declarative and the rules are testable
 * without a database.
 *
 * (The two that DO persist — reactions and badges — live in migration 0015.)
 */

import { isoDaysAgo } from "./local-date";

// ---------------------------------------------------------------------------
// CET-17 — the group garden
// ---------------------------------------------------------------------------

export type Garden = {
  /** 0..3 — Resting · Sprouting · Growing · Flourishing. */
  stage: number;
  /** 0..1 — the DURABLE layer: how established the planting is. */
  vitality: number;
  /** 0..1 — today's share of the collective goal. */
  todayPct: number;
  /** How many members have logged anything today. */
  tendedToday: number;
  /** How many members the circle has. */
  memberCount: number;
  /** The circle met its whole collective goal today. */
  closedToday: boolean;
};

/**
 * Growth blends the DURABLE signal (the circle's 30-day consistency) with a
 * nudge from today, so tapping toward the goal visibly moves the garden in the
 * session rather than only tomorrow. Low stages read calm/dormant — never dead,
 * never shaming (D8).
 *
 * **Why the short-term fields exist.** Vitality alone could not carry a day: a
 * 30-day mean moves ~3 points per perfect day and today is capped at +18, so a
 * whole circle's effort changed a plant's height by ~12px out of 84 — the
 * garden was built to be slow, which is right for the durable layer and wrong
 * as the *only* layer. There was nothing to come back and look at. So the day
 * gets its own signals, each one a fact rather than a mood: who has tended
 * today, how far along the collective goal is, and whether it closed. Growth
 * still comes only from the durable side, so a quiet day never shrinks anything
 * — the day can add, never subtract (D8).
 */
export function gardenStage(
  consistency30: number,
  todayPct: number,
  today: { tended: number; members: number } = { tended: 0, members: 0 },
): Garden {
  const t = Math.max(0, Math.min(1, todayPct));
  // 22, not 18: at 18 a circle that closed EVERY ring today still sat under the
  // "Resting" label — next to its own sun — because a brand-new circle's 30-day
  // consistency is 0 and 18 fell just short of the 20 that means Sprouting. A
  // fully-closed day should be worth at least the first stage on its own.
  const blended = Math.min(100, consistency30 + t * 22);
  const stage = blended < 20 ? 0 : blended < 40 ? 1 : blended < 65 ? 2 : 3;
  return {
    stage,
    vitality: blended / 100,
    todayPct: t,
    tendedToday: Math.max(0, Math.min(today.tended, today.members)),
    memberCount: Math.max(0, today.members),
    closedToday: t >= 1,
  };
}

/**
 * How many drawn plants bloom, when the bed holds fewer plants than the circle
 * holds members. Proportional, but a single contribution NEVER rounds away to
 * zero blooms: someone's dhikr happened, and the picture must not say it didn't
 * (the D43 instinct — never let the UI misreport worship).
 */
export function bloomCount(
  tended: number,
  members: number,
  drawn: number,
): number {
  if (tended <= 0 || members <= 0 || drawn <= 0) return 0;
  if (tended >= members) return drawn;
  return Math.max(1, Math.round((tended / members) * drawn));
}

export const GARDEN_STAGE_LABEL = [
  "Resting",
  "Sprouting",
  "Growing",
  "Flourishing",
];

export const GARDEN_STAGE_COPY = [
  "Quiet for now — a few rings today will wake it up. No rush, no guilt.",
  "First shoots. The circle is finding its rhythm.",
  "Coming alive — the garden grows every day you close your rings together.",
  "MashaAllah — your circle's garden is thriving. Keep tending it.",
];

// ---------------------------------------------------------------------------
// CET-22 — winnable pair goals
// ---------------------------------------------------------------------------

/**
 * A deterministic accountability buddy — MUTUAL by construction: everyone is
 * paired adjacently over the same rotated, sorted id list (`i ^ 1`), so my
 * buddy's buddy is always me — "you won the week together" is then true for
 * both people, not just the viewer (the old hash-of-my-id pick was one-way).
 *
 * Stable within a week (derived from ids + the ISO week key, never from array
 * order, which the DB does not guarantee), and rotated BY week: pairs refresh
 * weekly ("Pair goal · this week"), and in an odd-sized circle the person left
 * without a partner (→ null, the card simply doesn't render) is someone
 * different each week instead of the same member forever.
 */
export function pickBuddy(
  meId: string,
  memberIds: string[],
  weekKey: string,
): string | null {
  const ids = [...new Set(memberIds)].sort();
  if (ids.length < 2) return null;
  const h =
    Array.from(weekKey).reduce(
      (a, c) => (a * 31 + c.charCodeAt(0)) >>> 0,
      7,
    ) >>> 0;
  const rot = h % ids.length;
  const rotated = ids.slice(rot).concat(ids.slice(0, rot));
  const i = rotated.indexOf(meId);
  if (i === -1) return null;
  const j = i ^ 1; // adjacent pairing: (0,1), (2,3), … — symmetric
  return j < rotated.length ? rotated[j] : null; // odd one out this week
}

/** Combined active-days this week that a pair must reach to win together. */
export const PAIR_TARGET = 10;

// ---------------------------------------------------------------------------
// CET-18 — peer reactions
// ---------------------------------------------------------------------------

/** Mirrors the `kind` CHECK constraint on `public.reactions` (migration 0015). */
export type ReactionKind = "dua" | "mashaAllah" | "heart" | "fire";

export const REACTIONS: { kind: ReactionKind; glyph: string; label: string }[] =
  [
    { kind: "dua", glyph: "🤲", label: "Dua" },
    { kind: "mashaAllah", glyph: "✨", label: "MashaAllah" },
    { kind: "heart", glyph: "❤️", label: "Heart" },
    { kind: "fire", glyph: "🔥", label: "On fire" },
  ];

// ---------------------------------------------------------------------------
// CET-19 — fresh-start re-engagement
// ---------------------------------------------------------------------------

export type LandmarkType = "comeback" | "month" | "week";

export type Landmark = {
  type: LandmarkType;
  /**
   * The dismissal key — identifies THIS OCCURRENCE, not the landmark type, so
   * dismissing this week's banner says nothing about next week's.
   */
  key: string;
  title: string;
  body: string;
};

const COPY: Record<LandmarkType, { title: string; body: string }> = {
  comeback: {
    title: "Welcome back — pick up where you left off",
    body: "Every day is a fresh start. Your circle saved your spot; one task today is all it takes to begin again.",
  },
  month: {
    title: "A new month, a clean slate",
    body: "Fresh start. Pick one task and begin the chain again today — your circle is right here with you.",
  },
  week: {
    title: "New week, fresh start",
    body: "However last week went, today resets the rhythm. Close one ring and you're moving again.",
  },
};

/** ISO-8601 week key (`2026-W29`) — Monday-based, matching the week landmark.
 *  Also the weekly rotation seed for `pickBuddy` (exported for its callers). */
export function isoWeekKey(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  // Shift to the Thursday of this week: ISO weeks are numbered by their Thursday.
  const day = t.getUTCDay() || 7; // Sunday → 7
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * The fresh-start effect: people restart a habit most readily at a temporal
 * landmark. We surface a calm, clean-slate banner at one — framed as an
 * opportunity, never as guilt (D8).
 *
 * A COMEBACK outranks the calendar: someone returning from a lapse needs the
 * "your spot is saved" framing more than they need to be told it's Monday. A
 * member who was active yesterday gets no banner at all — they never left.
 */
export function detectLandmark(
  todayISO: string,
  lastActive: string | null,
): Landmark | null {
  const day = Number(todayISO.slice(8, 10));
  const dow = new Date(`${todayISO}T00:00:00Z`).getUTCDay();

  // Lapsed: nothing kept for 2+ days, but they DO have a history to come back
  // to (a brand-new member is not "back" — CET-21's welcome covers them).
  const lapsed = lastActive !== null && lastActive < isoDaysAgo(todayISO, 2);

  const type: LandmarkType | null = lapsed
    ? "comeback"
    : day === 1
      ? "month"
      : dow === 1
        ? "week"
        : null;
  if (!type) return null;

  const key =
    type === "comeback"
      ? `comeback:${todayISO}`
      : type === "month"
        ? `month:${todayISO.slice(0, 7)}`
        : `week:${isoWeekKey(todayISO)}`;

  return { type, key, ...COPY[type] };
}

// ---------------------------------------------------------------------------
// CET-21 — endowed-progress onboarding
// ---------------------------------------------------------------------------

/** A member counts as "new" for their first few days in a circle. */
export const WELCOME_DAYS = 3;

/**
 * Endowed progress, told TRUTHFULLY (D43).
 *
 * The research lever is real — starting visibly part-way beats starting at zero
 * — but the honest version endows the member with the CIRCLE's genuine progress,
 * not with dhikr they never performed. We never write a count on someone's
 * behalf to manufacture momentum; the circle is already moving, and that is the
 * true thing worth showing them on day one.
 *
 * Shows while they are new AND have logged nothing yet; the first tap retires it.
 */
export function showWelcome({
  joinedOn,
  todayISO,
  myCountToday,
}: {
  joinedOn: string | null;
  todayISO: string;
  myCountToday: number;
}): boolean {
  if (!joinedOn || myCountToday > 0) return false;
  return joinedOn >= isoDaysAgo(todayISO, WELCOME_DAYS);
}
