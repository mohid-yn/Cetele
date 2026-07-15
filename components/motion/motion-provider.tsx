"use client";

import * as React from "react";
import { MotionConfig } from "motion/react";
import { EASE_BRAND, DURATION } from "@/lib/motion";

/**
 * App-wide Motion config.
 *
 * `reducedMotion="user"` makes every `motion` component honour the OS
 * `prefers-reduced-motion` setting automatically — transform/opacity animations
 * are dropped, meaning is kept — which mirrors the CSS `@media (prefers-reduced-
 * motion)` guard in globals.css. One switch, both systems, no per-component
 * branching.
 *
 * The default transition matches --ease-brand/--duration-base, so a bare
 * `<motion.div layout>` already feels on-brand without spelling it out.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: DURATION.base, ease: EASE_BRAND }}
    >
      {children}
    </MotionConfig>
  );
}
