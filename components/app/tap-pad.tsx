"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ProgressRing } from "@/components/ui";
import { playTap } from "@/lib/sound";
import { hapticTick } from "@/lib/haptics";
import { DURATION, EASE_BRAND } from "@/lib/motion";
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
  const lastFeedbackAt = React.useRef(0);
  const done = value >= max;
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;

  // The pad plays ONE tick per tap, always — the tasbih-bead feel. It used to
  // branch to a "celebratory" pattern whenever `done`, but `done` is the
  // PRE-tap value, so that never fired on the tap that closes the ring: it
  // fired on every tap after it, which is a reward you can summon on demand.
  // The close is celebrated once, on the transition, by `celebrateIfClosed` in
  // count-client — that is the only place it belongs.
  const fireFeedback = () => {
    lastFeedbackAt.current = Date.now();
    if (sound) playTap();
    hapticTick();
  };

  // Feedback lands on finger-DOWN, not on `click` — which for touch resolves at
  // touchend, so the tick arrived on release and read as lagging the press
  // rather than being caused by it. The COUNT stays on `click` (keyboard
  // activation, and the ripple/pop stay tied to the committed tap).
  const handlePointerDown = () => {
    if (disabled) return;
    fireFeedback();
  };

  const handleTap = () => {
    // Keyboard activation fires `click` with no preceding pointerdown; the
    // timestamp lets that path feed itself without double-firing on touch,
    // where pointerdown is always well under 400ms ahead of the click.
    if (Date.now() - lastFeedbackAt.current > 400) fireFeedback();
    setPopKey((k) => k + 1);
    onTap();
  };

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
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

        {/* One ripple per tap — FEEDBACK, not celebration, so it eases out
            (ease-brand), never the emphasis register. Keyed by popKey so each tap
            spawns its own; MotionConfig reducedMotion="user" collapses it. */}
        <AnimatePresence>
          <motion.span
            key={popKey}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full bg-primary/20"
            initial={{ scale: 0.6, opacity: 0.25 }}
            animate={{ scale: 1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.base, ease: EASE_BRAND }}
          />
        </AnimatePresence>
        <ProgressRing
          value={value}
          max={max}
          size={260}
          thickness={18}
          // `fluid`, not `h-full w-full`: `size` is an inline style the class
          // could never beat, so the ring rendered at a flat 260px inside this
          // min(16rem, 28dvh) box — overflowing it to the RIGHT (grid falls
          // back to start-alignment when an item overruns its track) and
          // landing 12px off-centre from its own glow and the caption below.
          fluid
          // No trackColor override. This ring is the one you stare at for a
          // whole session, and it had the faintest track in the app: --muted
          // thinned to 60% alpha, ~1.1:1 on cream — the "receding track" was
          // receding all the way out of sight, so at a low count there was no
          // circle to read the arc against. It takes the token like every
          // other ring.
          className="relative"
        >
          <div className="flex flex-col items-center">
            <span
              key={popKey}
              className="font-display text-6xl font-bold text-foreground tabular-nums"
              style={{
                // `--ease-brand`, not `--ease-emphasized`. The emphasized ease
                // is reserved for "earned celebrations ONLY" — and this fires on
                // EVERY tap, hundreds of times a session. A dramatic settle
                // repeated that often stops reading as reward and starts
                // reading as jitter, the wrong feel for dhikr. The emphasis ease
                // stays where it is earned: the ring-close celebration.
                animation: "count-pop var(--duration-fast) var(--ease-brand)",
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
