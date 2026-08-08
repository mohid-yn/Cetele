import { cn } from "@/lib/utils";
import type { LevelBucket } from "@/lib/roadmap";

/**
 * The cohort at a glance — how many people are at each level count.
 *
 * WHY IT EXISTS. The report was a flat list of names, which answers "how is
 * Yusuf doing" and nothing else. The administration's question is "how many
 * have got how far", because the contribution is paid per LEVEL (D55) and the
 * people still at zero are the ones worth chasing. At three circles the list
 * carried that by eye; at the size the programme is meant to run, it cannot.
 *
 * COLOUR IS NEVER THE MESSAGE (§5). The strip is `aria-hidden` decoration and
 * the legend below it carries the whole reading in text — a number and a label
 * per bucket. Anyone who cannot separate two sage tints loses nothing.
 *
 * The ramp is one token at varying opacity rather than steps off the primary
 * scale, because the scale's tints are fixed hex in both themes while
 * `--primary` is theme-aware: on dark it is already the light sage, so an
 * opacity ramp stays legible where `bg-primary-300` would invert the reading.
 * Opacity is not a colour, so the token contract is intact.
 */
export function CohortShape({
  distribution,
  total,
}: {
  distribution: LevelBucket[];
  /** Levels in the programme — the top of the ramp. */
  total: number;
}) {
  const people = distribution.reduce((n, b) => n + b.count, 0);
  if (people === 0) return null;

  // Deeper sage the further along. Bucket 0 is left to show the track through,
  // which is the same "nothing here yet" language every other bar on the app
  // uses for an empty span.
  const tint = (levels: number) =>
    total > 0 ? 0.35 + (0.65 * levels) / total : 1;

  const label = (levels: number) =>
    levels === 0
      ? "not started"
      : `${levels} ${levels === 1 ? "level" : "levels"}`;

  return (
    <div className="mb-2">
      <div
        aria-hidden
        className="flex h-2.5 overflow-hidden rounded-full bg-progress-track"
      >
        {distribution.map((b) =>
          b.count === 0 ? null : (
            <div
              key={b.levels}
              className={cn("h-full", b.levels > 0 && "bg-primary")}
              style={{
                width: `${(b.count / people) * 100}%`,
                opacity: b.levels > 0 ? tint(b.levels) : undefined,
              }}
            />
          ),
        )}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {distribution.map((b) =>
          b.count === 0 ? null : (
            <li
              key={b.levels}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  b.levels > 0 ? "bg-primary" : "bg-progress-track",
                )}
                style={{
                  opacity: b.levels > 0 ? tint(b.levels) : undefined,
                }}
              />
              <span className="font-semibold text-foreground tabular-nums">
                {b.count}
              </span>
              <span>{label(b.levels)}</span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
