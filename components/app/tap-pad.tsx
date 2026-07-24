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
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;

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
        "group relative grid w-full place-items-center rounded-3xl py-4 transition-transform",
        "focus-visible:outline-none active:scale-[0.99]",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      {/* 260px is the intent, but a 667px-tall phone cannot hold that plus the
          day strip and the action bar — so the ring yields to viewport height
          instead of pushing the primary action off the screen. Tall screens are
          unaffected (the cap wins). */}
      {/* The glow is a sibling BEHIND the ring, not a wrapper, so its opacity
          ramps without fading the ring with it. It grows with proximity to the
          target and is fullest at 100% — an earned moment, where the
          celebration already fires. */}
      <div
        className="relative grid place-items-center"
        style={{ width: "min(16rem, 28dvh)", height: "min(16rem, 28dvh)" }}
      >
        <div
          aria-hidden
          className="absolute inset-0 rounded-full glow-primary transition-opacity duration-[var(--duration-slow)] ease-[var(--ease-brand)]"
          style={{ opacity: pct }}
        />
        <ProgressRing
          value={value}
          max={max}
          size={260}
          thickness={18}
          // A receding track lets the emerald fill carry the eye at hero size.
          trackColor="color-mix(in oklab, var(--muted) 60%, transparent)"
          className="relative h-full w-full"
        >
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
            {/* Softer than the value, not smaller than legible: the target is
                context, the count is the subject. Deliberately NOT enlarging
                the value past text-6xl — targets here run to four digits and
                the ring shrinks to 28dvh on a short phone, so a bigger size
                overflows the inner circle exactly where it matters least. */}
            <span className="mt-1 text-xs text-muted-foreground/80">
              of {max.toLocaleString()}
            </span>
          </div>
        </ProgressRing>
      </div>
      <span className="mt-4 text-xs text-muted-foreground">
        {done ? "Completed — tap to keep going" : "Tap anywhere to count"}
      </span>
    </button>
  );
}
