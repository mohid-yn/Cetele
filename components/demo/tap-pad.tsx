"use client";

import * as React from "react";
import { ProgressRing } from "@/components/ui";
import { cn } from "@/lib/utils";

let audioCtx: AudioContext | null = null;
function click() {
  if (typeof window === "undefined") return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // audio not available — silent is fine
  }
}

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
    if (sound) click();
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
