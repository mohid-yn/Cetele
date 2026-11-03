/**
 * The two rules behind tapping a ring on Today, with no database twin, so
 * `quick-count.test.ts` is their only check.
 */

/**
 * What a ring shows: the last confirmed count, or the server's if it has moved
 * further (another device), plus the taps not yet confirmed. `max` is what stops
 * the number dipping when a write returns before the refreshed page data does.
 */
export function displayedCount(
  server: number,
  confirmed: number | null,
  pending: number,
): number {
  return Math.max(server, confirmed ?? 0) + pending;
}

/**
 * Which threshold this tap crossed, if any. Reaching the goal outranks the
 * circle's share, so a single tap across both only celebrates once. With no
 * personal goal the two are one number and this returns "goal".
 */
export function milestoneCrossed(
  previous: number,
  next: number,
  share: number,
  goal: number,
): "goal" | "share" | null {
  if (previous < goal && next >= goal) return "goal";
  if (previous < share && next >= share) return "share";
  return null;
}
