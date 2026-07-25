import * as React from "react";
import { cn } from "@/lib/utils";
import { ProgressRing, type ProgressRingProps } from "./progress-ring";

/**
 * A ProgressRing sized for a hero, with a value and caption stacked in the
 * middle — the Group tab's "circle today %". A thin composition over
 * `ProgressRing`, deliberately NOT a fork: the ring's geometry, completion
 * colour and reduced-motion behaviour stay in one place.
 *
 * There used to be a `softTrack` prop, on by default, that dimmed the track to
 * 60% alpha so the fill "carried the eye at hero size". It was solving the
 * wrong problem — the old `--muted` track was already at 1.2:1, so softening it
 * bought nothing and cost the ring its shape. The fill leads by HUE and weight
 * now, not by the track being absent. One track, one token, no fork.
 */
export interface StatRingProps extends Omit<
  ProgressRingProps,
  "children" | "size"
> {
  /** The big number in the middle. */
  stat: React.ReactNode;
  /** Small line under it. */
  caption?: React.ReactNode;
  /** Outer diameter in px. Hero default is larger than ProgressRing's 96. */
  size?: number;
}

export function StatRing({
  stat,
  caption,
  size = 128,
  thickness = 12,
  trackColor,
  className,
  ...props
}: StatRingProps) {
  return (
    <ProgressRing
      size={size}
      thickness={thickness}
      trackColor={trackColor}
      className={cn(className)}
      {...props}
    >
      <span className="font-display text-2xl leading-none font-bold text-foreground tabular-nums">
        {stat}
      </span>
      {caption != null && (
        <span className="mt-1 block text-xs text-muted-foreground">
          {caption}
        </span>
      )}
    </ProgressRing>
  );
}
