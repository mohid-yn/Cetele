"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress-ring";

const TARGET = 33;

/** Interactive tasbih-style demo of ProgressRing — tap to count toward 33. */
export function RingDemo() {
  const [count, setCount] = React.useState(8);
  const done = count >= TARGET;

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={() => setCount((c) => Math.min(c + 1, TARGET))}
        aria-label="Count one dhikr"
        className="rounded-full transition-transform active:scale-95"
      >
        <ProgressRing value={count} max={TARGET} size={148} thickness={14}>
          <div className="flex flex-col items-center">
            <span className="font-display text-4xl font-bold tabular-nums text-foreground">
              {count}
            </span>
            <span className="text-xs text-muted-foreground">/ {TARGET}</span>
          </div>
        </ProgressRing>
      </button>
      <p className="text-sm text-muted-foreground">
        {done ? "✨ Ring closed — masha’Allah" : "Tap the ring to count"}
      </p>
      <Button variant="ghost" size="sm" onClick={() => setCount(0)}>
        Reset
      </Button>
    </div>
  );
}
