/**
 * The reward ladder — the spine of a roadmap screen.
 *
 * A roadmap is long (a year), so the daily engine's motivation does not carry
 * it: there is no ring closing tonight and no streak to keep. What carries it
 * is knowing the next milestone and how far off it is, which is why this is the
 * ladder and not a list of prizes.
 *
 * Accent budget: an UNLOCKED reward is the one accent use on this screen — it
 * is earned and it is a celebration, the two things D25 rations rose for.
 * Locked rungs are calm and NEUTRAL, never faint: a reward you cannot read is a
 * deficit, not an aspiration (D8, and the locked-badge lesson in badges.tsx).
 */

import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CheckIcon, GiftIcon } from "@/components/app/icons";
import type { RoadmapReward } from "@/lib/roadmap";

export function RewardLadder({
  rewards,
  complete,
  total,
}: {
  rewards: RoadmapReward[];
  /** Items finished so far — what a threshold is measured against. */
  complete: number;
  /** Items in the roadmap, for the "N of M" reading on each rung. */
  total: number;
}) {
  if (!rewards.length) return null;

  return (
    <ol className="flex flex-col">
      {rewards.map((r, i) => {
        const unlocked = complete >= r.threshold;
        // Exactly one rung is "next": the first still locked. It carries the
        // distance, so the member always has one number to aim at rather than
        // having to work it out across four rungs.
        const isNext =
          !unlocked && rewards.findIndex((x) => complete < x.threshold) === i;
        const remaining = r.threshold - complete;
        const last = i === rewards.length - 1;

        return (
          <li key={r.id} className="flex gap-3">
            {/* Rail: the mark plus the segment running down to the next rung.
                The segment is what makes this read as a road rather than a
                stack of cards — it is covered ground behind you, plain track
                ahead. */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full border",
                  unlocked
                    ? "border-transparent bg-accent-100 text-accent-800"
                    : isNext
                      ? "border-primary bg-primary-100 text-primary-800"
                      : "border-border bg-muted text-muted-foreground",
                )}
              >
                {unlocked ? (
                  <CheckIcon aria-hidden className="size-4.5" />
                ) : (
                  <GiftIcon aria-hidden className="size-4.5" />
                )}
              </div>
              {!last && (
                <div
                  aria-hidden
                  className={cn(
                    "w-0.5 flex-1 rounded-full",
                    unlocked ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </div>

            <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-5")}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p
                  className={cn(
                    "text-sm font-semibold",
                    unlocked || isNext
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {r.label}
                </p>
                {/* Never colour alone (§5 colour-blind safety) — the state is
                    also a word. */}
                {unlocked ? (
                  <Badge variant="accent" size="sm">
                    Unlocked
                  </Badge>
                ) : isNext ? (
                  <Badge variant="primary" size="sm">
                    {remaining} to go
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {r.threshold} of {total} items
                {r.description ? ` · ${r.description}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
