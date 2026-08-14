/**
 * The ONE completion ramp every day-grid in the app draws with.
 *
 * Two grids now render "how did this day go" as a coloured square: the task ×
 * day grid on a member's breakdown (a single task's share of its target) and
 * the member × day rings matrix (how many of that day's rings closed). They are
 * different questions with the same answer shape, and the moment the ramp
 * exists twice the two grids start disagreeing about what "nearly done" looks
 * like — the drift this repo has paid for in `obligations`' mirrors more than
 * once. So the scale lives here and both call it.
 *
 * The rules encoded below are not styling preferences; each is an invariant:
 *
 * - **Green = growth, never red.** A missed day is a calm neutral cell (D8).
 * - **The empty cell is OUTLINED, not darkened.** `bg-muted` alone measured
 *   1.2:1 on the card, so the grid had no visible shape — but filling it with
 *   the track tone makes a MISSED day visually heavier than a barely-touched
 *   one, inverting the intensity ramp into a punishment read. A hairline gives
 *   the slot presence without weight.
 * - **Absence is not failure.** A day nothing was owed wears no fill AND no
 *   outline: the hairline means "a slot you could have filled", so wearing it
 *   where nothing was asked would accuse the member of missing something that
 *   was never theirs.
 */

/**
 * @param pct      How much of the day's ask was met, 0–1.
 * @param activity Any effort at all that day (a raw count, or the number of
 *                 rings closed). Separates "tried and fell short" — which earns
 *                 the lightest rung — from "nothing at all", which earns the
 *                 outline. Without it a member at 99% on every task would be
 *                 drawn exactly like one who never opened the app.
 * @param owed     Was anything asked of them at all that day (0023 + frequency)?
 */
export function dayCellClass(
  pct: number,
  activity: number,
  owed = true,
): string {
  if (!owed) return "bg-transparent";
  if (activity <= 0) return "bg-muted ring-1 ring-inset ring-progress-track";
  if (pct >= 1) return "bg-primary";
  if (pct >= 0.66) return "bg-primary/70";
  if (pct >= 0.33) return "bg-primary/45";
  return "bg-primary/20";
}
