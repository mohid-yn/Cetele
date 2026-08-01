/**
 * Winnable sub-group / duo goals (CET-22).
 *
 * A single whole-group ranking can dishearten the bottom half. A shared goal
 * between two people keeps competition *winnable* and intrinsic (Duolingo's
 * lesson) — you win *together* by both showing up, not by out-scoring a peer.
 * Here: the duo's combined active-days this week against a modest shared
 * target.
 *
 * Stores nothing — the partner is a deterministic, mutual pick (`pickBuddy`)
 * and the days-active figures are the ones Standings (M5) already computes.
 *
 * Three things this card has to do that the first version did not, all from the
 * owner not being able to tell how duos were established:
 *
 *   1. SAY THE RULE. The pairing was a hash of the ISO week, so the name simply
 *      changed every Monday with nothing accounting for it. It is monthly now,
 *      and the card states that in words.
 *   2. SHOW BOTH CONTRIBUTIONS. One combined number cannot tell you whether you
 *      are being carried or doing the carrying, which is most of what makes a
 *      duo mean anything.
 *   3. NEVER BLAME. The old line — "N more active days between you to win the
 *      week" — points at the shortfall, and when your partner is the reason for
 *      it that sentence has an obvious subject. D8 forbids that framing
 *      everywhere else in the app; the copy here now says either of you can
 *      close it, because with a COMBINED target that is literally true.
 */

import { Avatar, Card, ProgressBar } from "@/components/ui";
import { cn } from "@/lib/utils";

export type Pair = {
  myName: string;
  buddyName: string;
  /** Active days this week, mine and theirs — shown separately, never ranked. */
  myDays: number;
  buddyDays: number;
  combined: number;
  target: number;
  met: boolean;
};

const first = (name: string) => name.split(" ")[0];

/**
 * The odd-one-out. An odd-sized circle always leaves exactly one person without
 * a partner, and rendering nothing for them was the worst available answer: the
 * card their neighbours are talking about just is not there, with no reason
 * given. Saying it plainly costs one card and removes the mystery.
 */
export function NoPairGoal() {
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-foreground">No duo this month</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Your circle has an odd number of people, so one person sits out each
        month — this month that&apos;s you. You&apos;re still in the ranking
        below, and the circle&apos;s goal still counts your rings.
      </p>
    </Card>
  );
}

export function PairGoal({ pair }: { pair: Pair }) {
  const { myName, buddyName, myDays, buddyDays, combined, target, met } = pair;
  const pct = Math.min(100, (combined / target) * 100);
  const remaining = Math.max(0, target - combined);

  return (
    <Card
      className={cn("p-4", met && "border-success-500/40 bg-success-500/5")}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            <Avatar name={myName} size="sm" className="ring-2 ring-card" />
            <Avatar name={buddyName} size="sm" className="ring-2 ring-card" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              You &amp; {first(buddyName)}
            </p>
            <p className="text-xs text-muted-foreground">
              Your duo &middot; this month
            </p>
          </div>
        </div>
        <span className="font-display text-sm font-bold text-foreground tabular-nums">
          {combined}/{target}
        </span>
      </div>

      <ProgressBar value={pct} tone={met ? "success" : "primary"} />

      {/* Both contributions, plainly and in a fixed order (you first, always).
          Not a ranking and never sorted by size — the point is that the two
          numbers ADD UP, not that one of them is bigger. */}
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        You {myDays} &middot; {first(buddyName)} {buddyDays}
      </p>

      <p className="mt-1 text-xs text-muted-foreground">
        {met ? (
          <span className="font-medium text-success">
            MashaAllah — you reached it together.
          </span>
        ) : (
          <>
            {remaining} {remaining === 1 ? "day" : "days"} to go — either of you
            can bring it home.
          </>
        )}
      </p>

      {/* The rule, said out loud. Without this the name on the card changes and
          the member has no way to find out why. */}
      <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
        Your circle pairs everyone up each month. The goal resets every week.
      </p>
    </Card>
  );
}
