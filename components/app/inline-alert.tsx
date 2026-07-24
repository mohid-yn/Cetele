"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { DURATION, easeBrand } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A page-level inline error that eases in rather than popping. Errors appear
 * mid-interaction — a refused count, a failed save — so an abrupt line of red
 * text reads as a glitch; a 150ms fade reads as the app answering you.
 *
 * Render it unconditionally and pass the (possibly null) error as children:
 * the AnimatePresence has to stay mounted to animate the EXIT, which a bare
 * `{error && <Alert/>}` at the call site would skip.
 *
 * For alerts inside a Dialog, don't use this — the dialog owns its own
 * entrance and a second one fights it (B.4).
 */
export function InlineAlert({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence>
      {children ? (
        <motion.p
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={easeBrand(DURATION.fast)}
          className={cn("text-xs text-danger", className)}
        >
          {children}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}
