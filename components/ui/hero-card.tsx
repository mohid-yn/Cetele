import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The one number a screen is about (Progress' streak, a roadmap's level). It is
 * type on the page, with no box around it: the size and the position carry the
 * emphasis. This was a gradient card with a sheen, an icon tile, an uppercase
 * label and a pill, which is the stock "hero metric" every generated dashboard
 * opens with, and the one screen that wore it looked borrowed from another app.
 */
export interface HeroCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Small icon tile, top-left — a flame, a ring, a crescent. */
  medallion?: React.ReactNode;
  /** The eyebrow above the stat. */
  label?: React.ReactNode;
  /** The headline value. */
  stat?: React.ReactNode;
  /** Supporting line under the stat. */
  caption?: React.ReactNode;
  /** Right-hand slot — a chip, a badge, a secondary stat. */
  trailing?: React.ReactNode;
}

export function HeroCard({
  medallion,
  label,
  stat,
  caption,
  trailing,
  className,
  children,
  ...props
}: HeroCardProps) {
  return (
    <div className={cn("pt-1", className)} {...props}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {label != null && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              {medallion}
              {label}
            </p>
          )}
          {stat != null && (
            <p className="mt-1 font-display text-6xl leading-none font-bold text-foreground tabular-nums">
              {stat}
            </p>
          )}
          {caption != null && (
            <p className="mt-2 text-sm text-foreground">{caption}</p>
          )}
        </div>
        {trailing != null && <div className="shrink-0 pb-0.5">{trailing}</div>}
      </div>
      {children != null && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** The quiet secondary fact beside the number, such as "Longest 5". */
export function HeroChip({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("text-sm text-muted-foreground tabular-nums", className)}
      {...props}
    />
  );
}
