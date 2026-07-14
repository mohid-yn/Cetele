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

import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

export type EarnedBadge = {
  id: string;
  glyph: string;
  label: string;
  description: string;
  /** ISO date it was earned, or null while it's still an aspiration. */
  earnedOn: string | null;
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

      <Card className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-6">
        {badges.map((b) => (
          <div
            key={b.id}
            title={b.description}
            className="flex flex-col items-center gap-1.5 text-center"
          >
            <div
              className={cn(
                "grid size-14 place-items-center rounded-2xl text-2xl transition-transform",
                b.earnedOn
                  ? "bg-accent-100 shadow-sm hover:-translate-y-0.5"
                  : "bg-muted grayscale",
              )}
            >
              <span aria-hidden className={cn(!b.earnedOn && "opacity-35")}>
                {b.glyph}
              </span>
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
        ))}
      </Card>
    </section>
  );
}
