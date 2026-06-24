"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { useAnimatedNumber } from "./use-animated-number";

/**
 * The live collective counter — "41,300 / 100,000 today". Reads the group total
 * from the store (which the realtime ticker keeps nudging) and animates jumps.
 */
export function LiveCounter({ className }: { className?: string }) {
  const { state } = useMock();
  const { total, goal } = sel.groupToday(state, state.session.activeGroupId);
  const shown = useAnimatedNumber(total);
  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;

  return (
    <div
      className={cn(
        "rounded-2xl bg-primary p-5 text-primary-foreground shadow-md",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-primary-foreground/70 uppercase">
          Group total today
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-primary-foreground/80">
          <span className="size-2 animate-pulse rounded-full bg-accent" />
          live
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-3xl font-bold tabular-nums">
          {shown.toLocaleString()}
        </span>
        <span className="text-sm text-primary-foreground/60">
          / {goal.toLocaleString()}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary-foreground/15">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-brand)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
