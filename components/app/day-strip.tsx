"use client";

/**
 * Horizontal day picker — Today, Yest., then the recent fortnight. Tap a day to
 * view / log for it. Back-filling a missed day is a primary action (D8: come
 * back, don't quit), so this sits at the top of Today and the count screen.
 * `isDone` flags which days are already complete (a ✓), so gaps are obvious.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { isoDaysAgo } from "@/lib/local-date";
import { CheckIcon } from "./icons";

function label(date: string, i: number): string {
  if (i === 0) return "Today";
  if (i === 1) return "Yest.";
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
  });
}
function dayNum(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
  });
}

export function DayStrip({
  value,
  onChange,
  isDone,
  days = 14,
  today,
  className,
}: {
  value: string;
  onChange: (date: string) => void;
  isDone?: (date: string) => boolean;
  days?: number;
  /**
   * ISO anchor for "Today" — the member's profile-timezone date (D34). REQUIRED
   * since M9: it used to fall back to the device clock (what the mock did), but
   * the device clock is not the member's day boundary, and quietly disagreeing
   * with the server about which day it is, is exactly the class of bug D44 was.
   */
  today: string;
  className?: string;
}) {
  const dates = Array.from({ length: days }, (_, i) => isoDaysAgo(today, i));
  return (
    <div className={cn("-mx-4 no-scrollbar overflow-x-auto px-4", className)}>
      <div className="flex gap-1.5">
        {dates.map((d, i) => {
          const active = d === value;
          const done = isDone?.(d) ?? false;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(d)}
              className={cn(
                "flex shrink-0 flex-col items-center gap-0.5 rounded-xl border px-2.5 py-1.5 transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              <span className="text-[0.65rem] font-medium tracking-wide uppercase">
                {label(d, i)}
              </span>
              <span className="font-display text-sm font-bold tabular-nums">
                {dayNum(d)}
              </span>
              <span className="grid h-3 place-items-center">
                {done && (
                  <CheckIcon
                    className={cn(
                      "size-3",
                      active ? "text-primary-foreground" : "text-success",
                    )}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Long human date for the "Logging for …" caption. */
export function fmtLongDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
