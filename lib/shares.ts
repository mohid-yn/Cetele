// Relative, and with the extension, because `lib/shares.test.ts` runs on Node's
// own test runner rather than through the bundler — it resolves by real
// filename and cannot see the `@/*` alias. `lib/local-date.ts` imports nothing
// itself, which is what keeps that reachable. It is also why this module does
// NOT import `lib/task-config.ts` (which does use the alias): the circle's
// target for the day arrives as a number, computed by the caller with
// `targetOn`. That is the better shape regardless — this file's job is the
// member dimension, not deciding where the circle's number came from.
import { timestampDateISO } from "./local-date.ts";

/**
 * What the circle asked of ONE member, and when (0032) — the client's mirror of
 * `private.member_share_on` and `private.effective_target`.
 *
 * A cetele is a shared goal SPLIT between people, and the split is not always
 * equal: an admin may give one member a bigger share of a task than the circle's
 * default (D61). The database judges a past day by the share in force THAT DAY,
 * so a day kept at 100 is still kept after the admin raises that member to 500.
 * This module exists so the screens say the same thing.
 *
 * It is the sibling of `lib/task-config.ts` and carries the same rules — every
 * date is reduced on the MEMBER's calendar, never UTC (D34); when a mirror and
 * its original disagree, the mirror is the bug.
 *
 * TWO NUMBERS THAT ARE NOT THE SAME NUMBER
 *
 *   share (this file)      — the circle's ask of me. Obligation. What "done"
 *                            means for me, what my streak is judged at, and what
 *                            the circle counts on me for. Visible to everyone.
 *   goal  (`lib/goals.ts`) — my own private stretch. Aspiration. Moves my ring
 *                            and my reminder and nothing else.
 *
 * They stack rather than compete: my ring fills toward `max(share, stretch)`,
 * and my day completes at my share. Keep the words apart on any screen showing
 * both — `effectiveGoal` in `lib/goals.ts` takes the SHARE as its floor, not the
 * circle's target.
 */

/** One share interval, as the screens read it. */
export type Share = {
  taskId: string;
  userId: string;
  target: number;
  /** Raw `timestamptz` — reduced to a date per MEMBER, never stored reduced. */
  fromAt: string;
  /** Raw `timestamptz`, or `null` while this is still the live one. */
  toAt: string | null;
};

/** A `member_task_shares` row as PostgREST returns it. */
export type ShareRow = {
  task_id: string;
  user_id: string;
  target_count: number;
  effective_from: string;
  effective_to: string | null;
};

/** DB rows → the shape the predicates below read. Timestamps stay raw. */
export function toShares(rows: ShareRow[] | null): Share[] {
  return (rows ?? []).map((r) => ({
    taskId: r.task_id,
    userId: r.user_id,
    target: r.target_count,
    fromAt: r.effective_from,
    toAt: r.effective_to,
  }));
}

/**
 * This member's own share of this task on this day, or `null` if they had none.
 *
 * PARTIAL, and that is the deliberate difference from `configOn`. That one must
 * always answer, because every task has a config and a missing one would leave a
 * cell with no target at all. A share is the exception rather than the rule —
 * `null` means "nobody set one, so the circle's target stands", which is the
 * overwhelmingly common answer. There is no earliest-version fallback here: a
 * day before the member's first share genuinely had no share.
 *
 * At most one interval can cover a day, so the `desc` tie-break in the SQL only
 * bites on the set-then-change-same-day case; it is mirrored anyway, on the raw
 * timestamp rather than the reduced date, for `task-config.ts`'s reason.
 */
export function shareOn(
  shares: Share[],
  taskId: string,
  userId: string,
  dayISO: string,
  timeZone: string,
): number | null {
  let best: Share | null = null;
  for (const s of shares) {
    if (s.taskId !== taskId || s.userId !== userId) continue;
    const from = timestampDateISO(timeZone, s.fromAt);
    const to = s.toAt === null ? null : timestampDateISO(timeZone, s.toAt);
    if (from <= dayISO && (to === null || dayISO < to)) {
      if (!best || Date.parse(s.fromAt) > Date.parse(best.fromAt)) best = s;
    }
  }
  return best?.target ?? null;
}

/**
 * What this member actually owed for this task on this day.
 *
 * Mirrors `private.effective_target`:
 *
 *     greatest(coalesce(my share, 0), the circle's target that day)
 *
 * `max`, not "the share if there is one" — the difference only shows up later,
 * and it is the whole reason 0018 is written this way. When an admin raises the
 * CIRCLE from 100 to 800, a member sitting on a 500 share must move to 800 with
 * everybody else, rather than keeping 500 from a row nobody remembers setting.
 *
 * `circleTargetThatDay` is what `targetOn` (lib/task-config.ts) returns for the
 * same task and day — passed in rather than looked up here, so the two as-of
 * layers compose without this file depending on that one.
 */
export function effectiveTarget(
  share: number | null,
  circleTargetThatDay: number,
): number {
  return Math.max(share ?? 0, circleTargetThatDay);
}

/**
 * The share standing right now for a task, per member — what an admin is
 * editing. No day maths and so no timezone: "still open" is `toAt === null`,
 * which is true or false on every calendar at once. (`lib/assignments.ts`'s
 * `openFor` makes the same distinction for the same reason.)
 */
export function currentShares(
  shares: Share[],
  taskId: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of shares) {
    if (s.taskId === taskId && s.toAt === null) out[s.userId] = s.target;
  }
  return out;
}

/**
 * Is this member carrying more than the circle's default for this task?
 *
 * The one place this comparison is written, so a screen cannot decide for
 * itself that 100-against-100 counts as "raised". Reads the LIVE circle target,
 * because this answers a question about now — what to badge on the members
 * roster — and not about a past day.
 */
export function isRaised(share: number | null, circleTarget: number): boolean {
  return share != null && share > circleTarget;
}
