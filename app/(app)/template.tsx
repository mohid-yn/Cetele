"use client";

import * as React from "react";
import { motion } from "motion/react";
import { EASE_BRAND, DURATION } from "@/lib/motion";
import { scrollAppToTop } from "@/lib/app-scroll";

/**
 * Per-navigation page transition. A `template` (unlike a `layout`) re-mounts on
 * every route change, so this eases each screen in as you move between tabs —
 * not just on first load, which is all the old `.rise-in` CSS class did.
 *
 * Enter-only, deliberately: the App Router unmounts the outgoing page before an
 * exit animation could run, so a reliable, jank-free transition animates the
 * arriving screen and lets the old one go. Same feel as `rise-in` (a small fade
 * + rise on --ease-brand), now on every visit. Reduced motion is handled by the
 * root MotionConfig.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  // The shell scrolls its content region, not the window, so the router's own
  // scroll-to-top no longer lands anywhere useful. This template re-mounts on
  // every navigation, which makes it the one place that reliably knows a new
  // screen has arrived.
  React.useEffect(() => {
    scrollAppToTop();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: EASE_BRAND }}
      className="flex flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}
