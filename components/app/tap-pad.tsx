"use client";

import * as React from "react";
import { ProgressRing } from "@/components/ui";
import { playTap } from "@/lib/sound";
import { cn } from "@/lib/utils";

interface TapPadProps {
  value: number;
  max: number;
  /** Whether sound is on. */
  sound: boolean;
  onTap: () => void;
}

/**
 * The tasbih-style tap target: a big ring you tap to count, with haptics, a
 * click tone, and a number "pop" on each press. The visual + tactile hook.
 */
export function TapPad({ value, max, sound, onTap }: TapPadProps) {
  const [popKey, setPopKey] = React.useState(0);
  const done = value >= max;

  const handleTap = () => {
    if (sound) playTap();
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(done ? [0, 30, 20, 40] : 18);
    }
    setPopKey((k) => k + 1);
    onTap();
  };

  return (
    <button
      type="button"
      onClick={handleTap}
      aria-label="Tap to count"
      className={cn(
        "group relative grid w-full place-items-center rounded-3xl py-8 transition-transform",
        "focus-visible:outline-none active:scale-[0.99]",
      )}
    >
      <ProgressRing value={value} max={max} size={260} thickness={18}>
        <div className="flex flex-col items-center">
          <span
            key={popKey}
            className="font-display text-6xl font-bold text-foreground tabular-nums"
            style={{
              animation: "count-pop var(--duration-fast) var(--ease-spring)",
            }}
          >
            {value.toLocaleString()}
          </span>
          <span className="mt-1 text-sm text-muted-foreground">
            of {max.toLocaleString()}
          </span>
        </div>
      </ProgressRing>
      <span className="mt-5 text-sm font-medium text-muted-foreground">
        {done ? "Completed — tap to keep going" : "Tap anywhere to count"}
      </span>
    </button>
  );
}
