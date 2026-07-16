"use client";

import * as React from "react";
import { localDateISO } from "@/lib/local-date";

/**
 * The member's local "today", kept CURRENT across their midnight (D34/D44).
 *
 * A server component computes todayISO once per render — but a PWA is exactly
 * the app you leave open (or suspended) overnight, and a client that keeps
 * holding that snapshot writes counts to YESTERDAY after the boundary: the
 * increment RPC's 14-day window accepts the stale date, so the mistake is
 * silent — today's ring never moves and the streak quietly misses.
 *
 * So: seed from the server value (hydration-safe — both sides render the same
 * string), then re-check the profile-timezone date whenever the app wakes up
 * (visibilitychange / focus — how a suspended PWA resumes) plus a slow interval
 * for a screen that simply stays open. When the day flips, `onDayChange` fires
 * (from the event handler, so callers may set state) — re-anchor any "today"
 * selection and `router.refresh()` to pull the new day's server data.
 */
export function useLocalToday(
  timeZone: string,
  initial: string,
  onDayChange?: (next: string, prev: string) => void,
): string {
  const [today, setToday] = React.useState(initial);
  const todayRef = React.useRef(initial);
  // Latest-ref for the callback, so the listeners effect below never has to
  // re-subscribe just because a caller passed a fresh inline closure.
  const cbRef = React.useRef(onDayChange);
  React.useEffect(() => {
    cbRef.current = onDayChange;
  });

  React.useEffect(() => {
    const check = () => {
      const next = localDateISO(timeZone);
      const prev = todayRef.current;
      if (next === prev) return;
      todayRef.current = next;
      setToday(next);
      cbRef.current?.(next, prev);
    };
    // 30s keeps the boundary tight without meaningful cost; the wake-up events
    // are what actually catch the common case (phone unlocked after midnight).
    const id = setInterval(check, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [timeZone]);

  return today;
}
