/**
 * Achievement badges (CET-20) — escalating accomplishment, never saturating.
 *
 * Streak landmarks (7 / 14 / 30 / 100 days) and consistency awards, earned not
 * given. They escalate (each harder than the last) so they keep meaning instead
 * of turning into wallpaper. White-hat: locked badges are calm aspirations,
 * never a nagging deficit — and an EARNED BADGE IS PERMANENT (D43). The mock
 * re-derived them every render, so a consistency badge could silently un-earn
 * itself on a dip; awards now live in `badge_awards` and are never revoked.
 *
 * Presentational — the catalog and the earned dates both come from the DB.
 */

import * as React from "react";
import { Grid, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  BeadsIcon,
  FlameIcon,
  LeafIcon,
  SproutIcon,
  StarIcon,
  TreeIcon,
} from "@/components/app/icons";

export type EarnedBadge = {
  id: string;
  label: string;
  description: string;
  /** ISO date it was earned, or null while it's still an aspiration. */
  earnedOn: string | null;
};

/**
 * badge id → its drawn mark.
 *
 * The catalog row still carries a `glyph` column, and it is deliberately no
 * longer read: those six values are emoji, so the mark took its colour and
 * style from the OS font and could not honour a token. The `id` is the stable
 * identity anyway — `badge_awards.badge_id` references it, so it cannot drift
 * the way a decorative column can. A row whose id we do not know renders no
 * mark rather than crashing; the tile still carries its label and state.
 */
const BADGE_ICONS: Record<
  string,
  (p: React.SVGProps<SVGSVGElement>) => React.ReactElement
> = {
  spark: SproutIcon, // 7-day — the habit taking root
  alight: FlameIcon, // 14-day current streak
  steadfast: LeafIcon, // 30-day
  consistent: BeadsIcon, // 80% of 30 days — a tasbih, the thing being counted
  rooted: TreeIcon, // 100-day
  devoted: StarIcon, // 95% of 90 days — the rarest
};

const fmtEarned = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function BadgesGrid({ badges }: { badges: EarnedBadge[] }) {
  if (!badges.length) return null;
  const earned = badges.filter((b) => b.earnedOn).length;

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Achievements</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {earned} of {badges.length} earned
        </span>
      </div>

      <Grid cols="tiles" gap="md" className={cardVariants({ padding: "md" })}>
        {badges.map((b) => {
          const Icon = BADGE_ICONS[b.id];
          return (
            <div
              key={b.id}
              title={b.description}
              className="flex flex-col items-center gap-1.5 text-center"
            >
              <div
                className={cn(
                  "grid size-14 place-items-center rounded-2xl transition-transform",
                  // An earned badge gets the accent rim — a sanctioned accent use
                  // (earned, D25) and the only one on this screen. Locked ones
                  // stay muted and flat, so the difference is the reward.
                  b.earnedOn
                    ? "bg-[var(--surface-raised)] text-primary glow-accent hover:-translate-y-0.5 motion-reduce:transform-none"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {/* A locked badge is quiet by being NEUTRAL, not by being faint —
                  the garden's resting-plant lesson (§4). The `opacity-35` this
                  replaced was tuned for an emoji's solid glyph; on a 2px stroke
                  it would have dropped the mark under the 3:1 non-text floor,
                  and a badge you cannot make out is a deficit, not the calm
                  aspiration D8 asks for. `grayscale` went with it: it existed
                  only to desaturate an emoji's own colours, and an icon on
                  `currentColor` has none to desaturate. */}
                {Icon && <Icon aria-hidden className="size-7" />}
              </div>
              <span
                className={cn(
                  "text-[0.7rem] leading-tight font-medium",
                  b.earnedOn ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {b.label}
              </span>
              {b.earnedOn && (
                <span className="text-[0.65rem] text-muted-foreground tabular-nums">
                  {fmtEarned(b.earnedOn)}
                </span>
              )}
            </div>
          );
        })}
      </Grid>
    </section>
  );
}
