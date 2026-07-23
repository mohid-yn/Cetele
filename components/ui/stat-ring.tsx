import * as React from "react";
import { cn } from "@/lib/utils";
import { ProgressRing, type ProgressRingProps } from "./progress-ring";

/**
 * A ProgressRing sized for a hero, with a value and caption stacked in the
 * middle — the Group tab's "circle today %". A thin composition over
 * `ProgressRing`, deliberately NOT a fork: the ring's geometry, completion
 * colour and reduced-motion behaviour stay in one place.
 *
 * `softTrack` dims the track so the fill carries more of the eye at hero size,
 * where the default `--muted` track competes with the emerald.
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
  /** Recede the track so the fill reads as the subject. */
  softTrack?: boolean;
}

export function StatRing({
  stat,
  caption,
  size = 128,
  thickness = 12,
  softTrack = true,
  trackColor,
  className,
  ...props
}: StatRingProps) {
  return (
    <ProgressRing
      size={size}
      thickness={thickness}
      trackColor={
        trackColor ??
        (softTrack
          ? "color-mix(in oklab, var(--muted) 60%, transparent)"
          : undefined)
      }
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
