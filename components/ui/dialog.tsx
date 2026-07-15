"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE_BRAND, DURATION } from "@/lib/motion";
import { Button } from "./button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  /** Right-aligned action row (Buttons). */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Lightweight accessible modal — backdrop + centred card, ESC and click-outside
 * to dismiss, `role="dialog"` + `aria-modal`. Replaces native `confirm()` so
 * destructive admin actions get a real, on-brand confirmation surface.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  // Read onClose through a ref so the effect below depends only on `open` —
  // an inline `onClose={() => …}` prop changes identity every parent render,
  // and re-running the effect would steal focus from whatever the user is
  // typing into (the focus() call must fire once per open, not per keystroke).
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    // Move focus into the dialog for keyboard users — unless something inside
    // it (e.g. an autoFocus input) already took it.
    if (!cardRef.current?.contains(document.activeElement)) {
      cardRef.current?.focus();
    }
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (typeof document === "undefined") return null;

  // Portal to <body> so the modal escapes any transformed ancestor (e.g. the
  // page-transition wrapper, which keeps a `transform`) — otherwise
  // `position: fixed` resolves against that ancestor and the dialog/backdrop are
  // offset instead of covering the whole viewport. AnimatePresence stays mounted
  // (never early-returns on !open) so the card + backdrop animate OUT on close,
  // not just in — the overlay itself lives inside the conditional, so nothing
  // covers the screen while closed.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          key="dialog"
          className="fixed inset-0 z-[var(--z-modal)] grid place-items-center p-4"
        >
          <motion.div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast, ease: EASE_BRAND }}
          />
          <motion.div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={cn(
              "relative w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl outline-none",
              className,
            )}
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: DURATION.base, ease: EASE_BRAND }}
          >
            {title && (
              <h2 className="font-display text-lg font-bold text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
            {children && <div className="mt-4">{children}</div>}
            {footer && (
              <div className="mt-5 flex justify-end gap-2">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Destructive actions get the red button (default). */
  destructive?: boolean;
}

/** A yes/no confirmation built on Dialog — used for every destructive action. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = true,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
