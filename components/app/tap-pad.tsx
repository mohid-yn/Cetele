"use client";

import * as React from "react";
import { ProgressRing } from "@/components/ui";
import { playTap } from "@/lib/sound";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface TapPadProps {
  value: number;
  max: number;
  /** Whether sound is on. */
  sound: boolean;
  /** Held while an exact-set correction is in flight, so a tap can't be
   *  overwritten by the set that's already on its way. */
  disabled?: boolean;
  onTap: () => void;
}

/**
 * The tasbih-style tap target: a big ring you tap to count, with haptics, a
 * click tone, and a number "pop" on each press. The visual + tactile hook.
 */
export function TapPad({
  value,
  max,
  sound,
  disabled = false,
  onTap,
}: TapPadProps) {
  const [popKey, setPopKey] = React.useState(0);
  const done = value >= max;

  const handleTap = () => {
    if (sound) playTap();
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      // The short tick is tactile FEEDBACK (the tasbih-bead feel) and stays; the
      // multi-buzz completion pattern is celebratory — reduced-motion users get
      // the plain tick there too.
      navigator.vibrate?.(
        done && !prefersReducedMotion() ? [0, 30, 20, 40] : 18,
      );
    }
    setPopKey((k) => k + 1);
    onTap();
  };

  return (
    <button
      type="button"
      onClick={handleTap}
      disabled={disabled}
      aria-label="Tap to count"
      className={cn(
        "group relative grid w-full place-items-center rounded-3xl py-8 transition-transform",
        "focus-visible:outline-none active:scale-[0.99]",
        disabled && "pointer-events-none opacity-60",
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
