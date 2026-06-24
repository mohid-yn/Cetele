"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface HeatCell {
  date: string;
  /** Fraction of the day's tasks fully closed (0..1). */
  pct: number;
  /** Whether every ring was closed that day. */
  full: boolean;
  /** Whether there was any activity at all (distinguishes "missed" from "low"). */
  active: boolean;
}

/** Map a day's completion to an emerald-intensity utility (green = growth). A
 *  missed day (no activity) reads as a neutral cell — never a red alarm (D8). */
function cellClass(c: HeatCell): string {
  if (!c.active) return "bg-muted";
  if (c.full) return "bg-primary";
  if (c.pct >= 0.66) return "bg-primary/70";
  if (c.pct >= 0.33) return "bg-primary/45";
  return "bg-primary/20";
}

/**
 * GitHub-style consistency heatmap (CET-16). Columns = weeks, rows = weekdays;
 * emerald intensity = share of that day's rings closed. Colour is paired with a
 * hover `title` (date + closed/total) so it never relies on hue alone (§5).
 */
export function ConsistencyHeatmap({
  data,
  className,
}: {
  data: (HeatCell & { closed: number; total: number })[];
  className?: string;
}) {
  // Pad the front so the first cell lands on its real weekday row (Sun-first).
  const leading = data.length
    ? new Date(data[0].date + "T00:00:00").getDay()
    : 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className="grid grid-flow-col grid-rows-7 gap-1"
        role="img"
        aria-label="Daily completion over time"
      >
        {Array.from({ length: leading }).map((_, i) => (
          <span key={`pad-${i}`} className="size-3.5" aria-hidden />
        ))}
        {data.map((c) => (
          <span
            key={c.date}
            title={`${c.date} — ${c.closed}/${c.total} rings closed`}
            className={cn("size-3.5 rounded-[3px]", cellClass(c))}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Less</span>
        <span className="size-3.5 rounded-[3px] bg-muted" />
        <span className="size-3.5 rounded-[3px] bg-primary/20" />
        <span className="size-3.5 rounded-[3px] bg-primary/45" />
        <span className="size-3.5 rounded-[3px] bg-primary/70" />
        <span className="size-3.5 rounded-[3px] bg-primary" />
        <span>More</span>
      </div>
    </div>
  );
}
