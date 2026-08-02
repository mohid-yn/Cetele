/**
 * Personal stretch goals (D51) — one expression, in one place.
 *
 * A member may raise their own bar for a task above the target their circle's
 * admin set (D5/D6). The override lives in `member_task_goals` and is applied
 * here and nowhere else, so the raise-only rule cannot drift between screens:
 *
 *     effective goal = max(group target, override ?? 0)
 *
 * An override can therefore only ever RAISE. A member cannot quietly owe the
 * circle less than the circle asked — the cetele is a shared goal split between
 * people, so opting down is not a personal setting — and when an admin later
 * raises the group target past somebody's override, the group target simply
 * wins with no stale row left lowering their bar.
 *
 * WHAT THIS IS FOR, AND WHAT IT MUST NOT TOUCH
 *
 * The stretch changes what a member is AIMING at. It must never change what the
 * app records or judges: day-completion, the streak, the 30-day consistency
 * band, steadfastness (D31), the garden's height (D49) and the circle's
 * collective goal all stay on the GROUP target. If the personal goal reached
 * them, raising your goal would make your own streak breakable, your percentage
 * lower and your plant shorter than a member who never raised anything — the
 * app would punish the ambition it just invited, which is the shape D8 forbids.
 *
 * So on a screen that shows both, keep the two words apart:
 *   `target` — the circle's share of the work. What "done" means.
 *   `goal`   — what I am aiming at today. What the ring fills toward.
 */

/** A task as the member's own screens see it: the circle's share + my bar. */
export type GoalTask = {
  /** The admin's target for the whole circle (`tasks.target_count`). */
  target: number;
  /** My raised bar, if I have set one. Always ≥ `target` once resolved. */
  goal: number;
};

/** Apply an override to a group target. The only place the rule is written. */
export function effectiveGoal(
  groupTarget: number,
  override: number | null | undefined,
): number {
  return Math.max(groupTarget, override ?? 0);
}

/** Have I raised my bar on this task above the circle's share? */
export function isStretched(t: GoalTask): boolean {
  return t.goal > t.target;
}

/**
 * The largest goal `set_task_goal` will accept — the same sanity cap
 * `increment_count`/`set_count` enforce on the COUNT (D36a), against the same
 * group target. Mirrored here so the dialog can refuse out-of-range input
 * synchronously; a goal above it would be one no legal write could ever close.
 */
export function goalCap(groupTarget: number): number {
  return Math.max(groupTarget * 10, groupTarget + 1000);
}

/* ---------------------------------------------------------------------------
 * Frequency (0021) — the same shape as the count goal, on the time axis.
 * ------------------------------------------------------------------------- */

/** Days between occasions, and the day the cycle is anchored at. */
export type Schedule = {
  /** The circle's cycle. 1 = daily. */
  frequencyDays: number;
  /** My own denser cycle, if I set one. Never looser than the circle's. */
  myFrequencyDays?: number | null;
  /** `tasks.created_at` as an ISO date — the anchor the cycle counts from. */
  createdOn: string;
};

/** The largest interval a task may be set to — bounded by the 14-day log window. */
export const MAX_FREQUENCY_DAYS = 14;

function daysBetween(fromISO: string, toISO: string): number {
  // Parsed as UTC midnights on both sides, so DST cannot shift the difference.
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Is this task due on this day, for this member?
 *
 * Mirrors `private.task_due_on` exactly, including the UNION: the member's own
 * cycle ADDS occasions and never removes one. `least(circle, mine)` would be
 * wrong — a circle on every-3 owes days 0,3,6 and a member on every-2 owes
 * 0,2,4, so day 3 is an occasion the circle asks for that the member's cycle
 * skips. The union makes the superset property true for any pair of numbers.
 */
export function isDueOn(s: Schedule, dayISO: string): boolean {
  const n = daysBetween(s.createdOn, dayISO);
  if (n < 0) return false; // never due before the task existed
  return (
    n % s.frequencyDays === 0 ||
    (s.myFrequencyDays != null && n % s.myFrequencyDays === 0)
  );
}

/**
 * Days until this task next comes round, counting from `dayISO`. 0 = today.
 * Bounded by MAX_FREQUENCY_DAYS + 1 probes, so it always terminates.
 */
export function daysUntilDue(s: Schedule, dayISO: string): number {
  const start = Date.parse(`${dayISO}T00:00:00Z`);
  for (let i = 0; i <= MAX_FREQUENCY_DAYS; i++) {
    const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    if (isDueOn(s, d)) return i;
  }
  return MAX_FREQUENCY_DAYS;
}

/**
 * "Daily" / "Weekly" / "Every 3 days" — the one place this phrasing is written.
 *
 * The two common intervals get their real NAMES rather than their arithmetic.
 * "Every 7 days" is a number a reader has to convert; "Weekly" is the word they
 * were already thinking in, and these are the values a circle actually picks.
 * It lives here rather than in the picker so the chip you press and the caption
 * you read it back from cannot end up calling the same interval two things.
 */
export function frequencyLabel(days: number): string {
  if (days === 1) return "Daily";
  if (days === 7) return "Weekly";
  if (days === 14) return "Every 2 weeks";
  return `Every ${days} days`;
}

/** "Due today" / "Due tomorrow" / "Due in 3 days". */
export function dueLabel(daysAway: number): string {
  if (daysAway <= 0) return "Due today";
  if (daysAway === 1) return "Due tomorrow";
  return `Due in ${daysAway} days`;
}
