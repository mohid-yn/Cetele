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
    // Immediately, not only on the next tick. `initial` is a snapshot the SERVER
    // took, and it can already be wrong on arrival: `TimezoneSync` (D44) writes
    // the real zone from the browser and refreshes, so the first render of a
    // fresh account computes "today" in UTC and the second computes it in the
    // member's own zone. Waiting for the interval left the client holding the
    // UTC date for up to 30 seconds after the correction had landed — measured
    // in e2e, with `timeZone: "Australia/Sydney"` and `serverTodayISO:
    // "2026-08-03"` while this hook still returned "2026-08-02".
    //
    // Everything downstream keys off the value this returns, so during that
    // window a member's taps went to the WRONG DAY — the silent mis-dating D44
    // exists to prevent — and, once assignment and target history are resolved
    // on the member's calendar (0023/0024), their whole task list disappeared:
    // a task assigned "today" is in the future for a client that thinks it is
    // still yesterday. That is the symptom that finally exposed this.
    //
    // Safe for hydration: an effect runs only after the server and client have
    // already agreed on `initial`.
    check();
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
