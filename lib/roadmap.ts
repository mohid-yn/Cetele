/**
 * Roadmap — the administration's yearly programme: a set of items sourced
 * OUTSIDE the app (a playlist to watch, a book to read) with rewards at
 * milestones along the way.
 *
 * This is deliberately NOT the daily-task engine, and the two must not touch:
 *
 *   - `logs` is pruned at 14 days (D31a) and back-dating is capped at 13 days
 *     (D36a), so a year-long programme cannot record its progress there at all.
 *   - A roadmap item must never reach `private.obligations`. If "read the book"
 *     counted toward day-completion, a day spent not reading would break a
 *     streak — a punishment mechanic, straight into D8. Roadmap progress only
 *     ever ADDS; it can never take a day, a streak or a plant away.
 *
 * So: different grain (a window, not a day), different retention (the whole
 * programme, never pruned), different scoring (a milestone reached once, not a
 * target met daily). The only thing it shares with tasks is the member.
 *
 * The types here are the contract the UI renders against; the rows come from
 * migration 0025. A roadmap is PUBLISHED once and FOLLOWED by the circles that
 * choose it (`groups.roadmap_id`, D55) — it is not pushed to everyone, because
 * the rewards are the administration's real-world promises and a circle it has
 * never met should not be reading what it is offering.
 *
 * `done` is the member's OWN progress, keyed on (member, item) in the database
 * and never on a group: a member in two circles following the same programme
 * has one record, not two.
 */

/** Where an item is done. `custom` covers anything with no natural source. */
export type RoadmapItemKind = "watch" | "read" | "custom";

export type RoadmapItem = {
  id: string;
  kind: RoadmapItemKind;
  title: string;
  /** Who it is by, or where it is from — a channel, an author. */
  source: string | null;
  /** Where the member goes to do it. External; opens in a new tab. */
  url: string | null;
  /** What one unit is, in the plural: "videos", "chapters", "sessions". */
  unit: string;
  /** How many units finish the item. */
  target: number;
  /** How many the member has recorded so far. */
  done: number;
};

export type RoadmapReward = {
  id: string;
  /** How many items must be complete before this unlocks. */
  threshold: number;
  label: string;
  /** What the administration actually gives. Out-of-app, like D31's reward. */
  description: string | null;
};

export type Roadmap = {
  id: string;
  name: string;
  /** Plain calendar dates — a programme's window is not a timestamp. */
  startsOn: string;
  endsOn: string;
  items: RoadmapItem[];
  /** Ascending by threshold. `nextReward` relies on that order. */
  rewards: RoadmapReward[];
};

export const isItemComplete = (item: RoadmapItem) => item.done >= item.target;

export const completedItems = (items: RoadmapItem[]) =>
  items.filter(isItemComplete).length;

/**
 * Overall progress, weighted by UNITS rather than by items — a 40-video
 * playlist and a 3-chapter essay are not the same distance, and counting them
 * as one item each makes a long item feel like it earns nothing until it lands.
 */
export function overallPct(items: RoadmapItem[]): number {
  const target = items.reduce((n, i) => n + i.target, 0);
  if (!target) return 0;
  const done = items.reduce((n, i) => n + Math.min(i.done, i.target), 0);
  return Math.round((done / target) * 100);
}

/** The next reward still to unlock, or null once every one is earned. */
export function nextReward(
  rewards: RoadmapReward[],
  complete: number,
): RoadmapReward | null {
  return rewards.find((r) => complete < r.threshold) ?? null;
}

/**
 * Days remaining in the window, counted on the MEMBER's calendar — `todayISO`
 * is theirs (D34), never the server's. Both bounds are plain dates, so they
 * parse at UTC midnight and the subtraction is a pure day count with no zone
 * in it. Never negative: a finished programme reads "0 days left", not "-6".
 */
export function daysLeft(endsOn: string, todayISO: string): number {
  const end = Date.parse(`${endsOn}T00:00:00Z`);
  const today = Date.parse(`${todayISO}T00:00:00Z`);
  if (Number.isNaN(end) || Number.isNaN(today)) return 0;
  return Math.max(0, Math.round((end - today) / 86_400_000));
}

/** Whether the window is open on the member's own calendar. */
export const isActiveOn = (roadmap: Roadmap, todayISO: string) =>
  todayISO >= roadmap.startsOn && todayISO <= roadmap.endsOn;
