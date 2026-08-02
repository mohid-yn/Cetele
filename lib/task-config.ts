import { timestampDateISO } from "@/lib/local-date";

/**
 * What a task asked for, and when (0024) — the client's mirror of
 * `private.task_config_on`.
 *
 * An admin may change a task's target or its cycle at any time. The database
 * judges a past day by the configuration THAT DAY had, so a day kept at 100 is
 * still kept after the circle moves to 500. This module exists so the screens
 * say the same thing.
 *
 * It is not cosmetic. The count screen's day-strip, Today's day-strip and the
 * Progress grid all render a fortnight of past days, and all three mark a day
 * done by comparing a count to a target. Reading the LIVE target there would
 * un-tick every day already kept the moment an admin raises the bar — the exact
 * bug fixed once already for a member's own goal (a number chosen later cannot
 * un-keep a day already kept), with the admin holding the pen.
 *
 * EVERY DATE HERE IS THE MEMBER'S, NOT UTC
 *
 * A version is stored as a timestamp and compared against a member's local day
 * (D34), so it has to be reduced on THAT member's calendar — `private.user_date`
 * does exactly this in SQL. Reducing in UTC instead puts the boundary a whole
 * day out for a large slice of every day: measured on this stack, an edit at
 * 14:29 UTC lands on the previous local day for a member in Sydney, and their
 * yesterday is then re-judged at the new target. That is the bug the migration
 * exists to prevent, coming back through the date cast. `lib/assignments.ts` is
 * the sibling of this file and carries the same rule.
 *
 * When a mirror and its original disagree, the mirror is the bug.
 */

/** One configuration interval, as the screens read it. */
export type ConfigVersion = {
  taskId: string;
  target: number;
  frequencyDays: number;
  /** Raw `timestamptz` — reduced to a date per MEMBER, never stored reduced. */
  fromAt: string;
  /** Raw `timestamptz`, or `null` while this is still the live one. */
  toAt: string | null;
};

/** A `task_config_versions` row as PostgREST returns it. */
export type ConfigVersionRow = {
  task_id: string;
  target_count: number;
  frequency_days: number;
  effective_from: string;
  effective_to: string | null;
};

/** DB rows → the shape the predicates below read. Timestamps stay raw. */
export function toConfigVersions(
  rows: ConfigVersionRow[] | null,
): ConfigVersion[] {
  return (rows ?? []).map((r) => ({
    taskId: r.task_id,
    target: r.target_count,
    frequencyDays: r.frequency_days,
    fromAt: r.effective_from,
    toAt: r.effective_to,
  }));
}

/**
 * The configuration this task ran under on this day, on this member's calendar.
 *
 * Mirrors `private.task_config_on`, fallback included: a day that PRECEDES the
 * task's first version reads that first version rather than nothing. The
 * day-strip deliberately offers days from before a task existed — that is how
 * the past gets repaired (D48) — so returning nothing for them would leave those
 * cells with no target to measure against.
 *
 * The tie-break for "earliest" is on the raw TIMESTAMP, never the reduced date.
 * A task created and then edited on the same day has two versions whose dates
 * are equal, and ordering by date comes down to whatever order PostgREST
 * happened to return. The SQL orders by the timestamptz; the first cut of this
 * file did not, and an e2e caught it — a task created today and raised today
 * read its NEW target on yesterday's back-filled cell.
 *
 * `null` only when the task has no versions at all, which the trigger behind
 * the table makes impossible. Callers fall back to the task's live numbers,
 * which degrades to the pre-0024 behaviour rather than to a target of zero.
 */
export function configOn(
  versions: ConfigVersion[],
  taskId: string,
  dayISO: string,
  timeZone: string,
): { target: number; frequencyDays: number } | null {
  let earliest: ConfigVersion | null = null;
  for (const v of versions) {
    if (v.taskId !== taskId) continue;
    const from = timestampDateISO(timeZone, v.fromAt);
    const to = v.toAt === null ? null : timestampDateISO(timeZone, v.toAt);
    // In force that day — at most one row can be, so this can return at once.
    if (from <= dayISO && (to === null || dayISO < to)) {
      return { target: v.target, frequencyDays: v.frequencyDays };
    }
    if (!earliest || Date.parse(v.fromAt) < Date.parse(earliest.fromAt))
      earliest = v;
  }
  return earliest
    ? { target: earliest.target, frequencyDays: earliest.frequencyDays }
    : null;
}

/**
 * The target this task asked for on this day, falling back to its live one.
 *
 * The shape almost every caller wants: a screen that has a task in hand always
 * has its current target, and wants the historical one where there is one.
 */
export function targetOn(
  versions: ConfigVersion[],
  taskId: string,
  dayISO: string,
  timeZone: string,
  liveTarget: number,
): number {
  return configOn(versions, taskId, dayISO, timeZone)?.target ?? liveTarget;
}

/** The cycle this task ran on that day, falling back to its live one. */
export function frequencyOn(
  versions: ConfigVersion[],
  taskId: string,
  dayISO: string,
  timeZone: string,
  liveFrequency: number,
): number {
  return (
    configOn(versions, taskId, dayISO, timeZone)?.frequencyDays ?? liveFrequency
  );
}
