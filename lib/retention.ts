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
 * A deterministic accountability duo — MUTUAL by construction: everyone is
 * paired adjacently over the same rotated, sorted id list (`i ^ 1`), so my
 * duo's duo is always me. "You won the week together" is therefore true for
 * both people, not just the viewer (the original hash-of-my-id pick was
 * one-way, which meant two members could each name a different partner).
 *
 * Rotated by PERIOD, and the period is now a MONTH rather than a week. The
 * owner's complaint was that they could not tell how duos were established,
 * and a pairing that silently reshuffled every Monday is a large part of why:
 * a partner you hold for seven days never becomes accountability, and the name
 * on the card changed with nothing on screen accounting for it. A month is long
 * enough to notice who you are carrying and be carried by, and the UI now says
 * the rule out loud instead of leaving it to be inferred.
 *
 * Two honest limits of keeping this STATELESS (no table, nobody asked):
 *
 *   1. It is recomputed from CURRENT membership, so someone joining or leaving
 *      mid-month can repair the circle. Storing pairs is the only real fix, and
 *      that was weighed and declined — the trade is no consent flow, no rows to
 *      reconcile when a member leaves, and no stale pair pointing at an
 *      ex-member.
 *   2. Nobody is asked or notified. Both halves see the same card, which is
 *      what makes it fair, but it is an assignment rather than an agreement.
 *
 * In an odd-sized circle exactly one person has no partner. That used to render
 * NOTHING, which is the worst version — the card a member's neighbour is
 * discussing simply does not exist for them, with no reason given. The caller
 * now renders an explicit "no duo this month" state instead (see `PairGoal`).
 */
export function pickBuddy(
  meId: string,
  memberIds: string[],
  periodKey: string,
): string | null {
  const ids = [...new Set(memberIds)].sort();
  if (ids.length < 2) return null;
  const h =
    Array.from(periodKey).reduce(
      (a, c) => (a * 31 + c.charCodeAt(0)) >>> 0,
      7,
    ) >>> 0;
  const rot = h % ids.length;
  const rotated = ids.slice(rot).concat(ids.slice(0, rot));
  const i = rotated.indexOf(meId);
  if (i === -1) return null;
  const j = i ^ 1; // adjacent pairing: (0,1), (2,3), … — symmetric
  return j < rotated.length ? rotated[j] : null; // odd one out this month
}

/**
 * `YYYY-MM` in the member's own day — the rotation seed for `pickBuddy`.
 * Derived from the already-localised ISO date, so a duo turns over on the
 * member's own 1st of the month, not UTC's (D34's per-user day rule).
 */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Combined active-days this week that a duo must reach to win together. */
export const PAIR_TARGET = 10;

// ---------------------------------------------------------------------------
// CET-18 — peer reactions
// ---------------------------------------------------------------------------

/** Mirrors the `kind` CHECK constraint on `public.reactions` (migration 0015). */
export type ReactionKind = "dua" | "mashaAllah" | "heart" | "fire";

/**
 * The reaction set, in display order. It carries no glyph: the mark for each
 * kind is a drawn icon, mapped in `peer-reactions.tsx`, because this is a `.ts`
 * module and the icon is a component. The `label` is the accessible name and
 * the only text a screen reader gets, so it has to stand alone.
 */
export const REACTIONS: { kind: ReactionKind; label: string }[] = [
  { kind: "dua", label: "Dua" },
  { kind: "mashaAllah", label: "MashaAllah" },
  { kind: "heart", label: "Heart" },
  { kind: "fire", label: "On fire" },
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
