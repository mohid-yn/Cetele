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
