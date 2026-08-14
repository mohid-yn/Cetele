/**
 * How a member's day is scored in RINGS, and how a roster of them is ordered.
 *
 * A "ring" is one task's obligation for one day, closed when the count reaches
 * what that day asked of that member — `greatest(their share, the circle's
 * target)` as of that day (D61), never a stretch goal they set for themselves
 * (D51). Which tasks were owed at all comes from the caller (assignment
 * intervals + frequency, resolved on the member's own calendar, D34); this
 * module only does the scoring and the ordering on top of that answer.
 *
 * NO DATABASE TWIN. Unlike `lib/shares.ts`, nothing in here mirrors a SQL rule:
 * the ratio and the roster order exist only on the client, so `lib/rings.test.ts`
 * is not a cross-check against pgTAP — it is the whole of their coverage.
 */

/** The scoring shape a roster row carries. */
export type RingScore = {
  /** Rings the day asked of them. 0 = nothing was due. */
  ringsOwed: number;
  /** Of those, how many closed. */
  ringsClosed: number;
  /** Raw count that day — the tiebreak, and the only figure that can show
   *  somebody carried on past what was asked. */
  today: number;
};

/**
 * Share of today's rings closed, 0–1 — or `NOTHING_DUE` when nothing was owed.
 *
 * A member owed nothing has not achieved 0% and has not achieved 100%; they are
 * simply not part of today's picture, and collapsing that into either number is
 * how a roster ends up either accusing them of a miss or crowning them for a day
 * off. The sentinel keeps the third state third.
 */
export const NOTHING_DUE = -1;

export function ringRatio(s: RingScore): number {
  return s.ringsOwed ? s.ringsClosed / s.ringsOwed : NOTHING_DUE;
}

/**
 * Roster order: by PROPORTION of the day closed, then by rings closed, then by
 * raw count.
 *
 * Proportion first, and that is the whole point. Ordering on rings closed
 * outright files a member owed one ring who closed it BELOW one who closed two
 * of five — the first finished their day and the second did not. Ordering on the
 * raw total (what this list used to do) is worse still once a circle splits
 * unevenly: it ranks by the SIZE of somebody's share, so being asked for more
 * made you look better for completing proportionally less.
 *
 * Members owed nothing sort last, by the sentinel — leading a roster with people
 * who had a day off reads as a verdict on everyone beneath them.
 */
export function compareByRings(a: RingScore, b: RingScore): number {
  return (
    ringRatio(b) - ringRatio(a) ||
    b.ringsClosed - a.ringsClosed ||
    b.today - a.today
  );
}
