"use client";

import * as React from "react";
import { displayedCount } from "@/lib/quick-count";
import { incrementCount } from "./actions";

/** Short enough to feel saved, long enough that a burst becomes one write. */
const FLUSH_MS = 300;
/** The most `increment_count` accepts in one call (D36a). */
const MAX_DELTA = 500;

type Entry = { confirmed: number | null; pending: number };
const keyOf = (date: string, taskId: string) => `${date}|${taskId}`;

/**
 * Count from Today without leaving it. Same guarantees as the count screen's
 * queue: taps coalesce, and each task's writes run strictly in order, so a slow
 * reply can't overtake a newer one and pull the number back (the count-dip family).
 *
 * EVERYTHING IS KEYED BY DAY, because the day can change under a pending tap: on
 * a first visit "today" moves when the member's timezone syncs, and it moves
 * again at midnight. A tap belongs to the day on screen when it happened.
 *
 * Anything unsent is flushed when the screen goes away or the app is backgrounded,
 * because a member will tap and immediately switch away.
 */
export function useQuickCount(groupId: string) {
  const [entries, setEntries] = React.useState<Record<string, Entry>>({});
  const [error, setError] = React.useState<string | null>(null);
  const unsent = React.useRef(
    new Map<string, { taskId: string; date: string; count: number }>(),
  );
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const chains = React.useRef(new Map<string, Promise<void>>());

  const flush = React.useCallback(
    (key: string) => {
      const timer = timers.current.get(key);
      if (timer) clearTimeout(timer);
      timers.current.delete(key);

      const batch = unsent.current.get(key);
      if (!batch) return;
      const { taskId, date, count: total } = batch;
      const delta = Math.min(total, MAX_DELTA);
      if (total > delta) {
        unsent.current.set(key, { ...batch, count: total - delta });
      } else {
        unsent.current.delete(key);
      }

      const run = async () => {
        let res: { count: number | null; error: string | null } | undefined;
        try {
          res = await incrementCount(groupId, taskId, date, delta);
        } catch {
          res = { count: null, error: "Couldn't save. Try again." };
        }
        // Undefined means the action redirected for a stale session.
        if (!res) return;
        const failed = res.error != null || res.count == null;
        if (failed) setError("That tap didn't save. Try again.");
        const count = res.count;
        setEntries((prev) => {
          const entry = prev[key] ?? { confirmed: null, pending: 0 };
          return {
            ...prev,
            [key]: {
              confirmed: failed ? entry.confirmed : count,
              pending: Math.max(0, entry.pending - delta),
            },
          };
        });
      };
      const previous = chains.current.get(key) ?? Promise.resolve();
      chains.current.set(key, previous.then(run, run));
    },
    [groupId],
  );

  const tap = React.useCallback(
    /** `now` skips the wait: the tap that closes a ring shouldn't sit unsent. */
    (taskId: string, date: string, now = false) => {
      const key = keyOf(date, taskId);
      setError(null);
      setEntries((prev) => {
        const entry = prev[key] ?? { confirmed: null, pending: 0 };
        return { ...prev, [key]: { ...entry, pending: entry.pending + 1 } };
      });
      const batch = unsent.current.get(key);
      unsent.current.set(key, {
        taskId,
        date,
        count: (batch?.count ?? 0) + 1,
      });
      const timer = timers.current.get(key);
      if (timer) clearTimeout(timer);
      if (now) {
        flush(key);
        return;
      }
      timers.current.set(
        key,
        setTimeout(() => flush(key), FLUSH_MS),
      );
    },
    [flush],
  );

  React.useEffect(() => {
    const batches = unsent.current;
    const flushAll = () => [...batches.keys()].forEach(flush);
    const onHide = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushAll);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushAll);
      flushAll();
    };
  }, [flush]);

  const countFor = React.useCallback(
    (taskId: string, date: string, server: number) => {
      const entry = entries[keyOf(date, taskId)];
      return entry
        ? displayedCount(server, entry.confirmed, entry.pending)
        : server;
    },
    [entries],
  );

  return { tap, countFor, error };
}
