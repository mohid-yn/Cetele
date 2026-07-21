"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useCelebration } from "@/components/app/celebration";
import { TapPad } from "@/components/app/tap-pad";
import { DayStrip, fmtLongDate } from "@/components/app/day-strip";
import { ArrowLeftIcon, MinusIcon } from "@/components/app/icons";
import { playComplete, playTen } from "@/lib/sound";
import { groupHref } from "@/lib/group-href";
import { useLocalToday } from "@/lib/use-local-today";
import { incrementCount } from "../../today/actions";
import { setCount } from "../../group/actions";

/**
 * The optimistic tap pad (M3). Every tap lands locally at once; deltas are
 * batched per day and flushed to the increment_count RPC on a short debounce
 * (the RPC enforces the count-integrity bounds — the client only needs to be
 * honest, not trusted). A rejected flush rolls the local count back.
 *
 * Corrections go the other way. `increment_count` only accepts positive deltas
 * (that one-directional guarantee is part of the count-integrity story), so
 * undoing a stray tap — or fixing a number outright — rides `set_count`, the
 * same exact-set the fortnight grid uses (D29 self-correct). An exact-set can
 * never be issued while taps are still in flight: it would either clobber them
 * or be clobbered, which is the count-dip family of bugs this screen has
 * already paid for. `commitExact` settles the queue first and holds the pad.
 */

const FLUSH_MS = 600;

export function CountClient({
  groupId,
  userId,
  task,
  timeZone,
  todayISO: serverTodayISO,
  initialDate,
  initialCounts,
}: {
  groupId: string;
  /** The viewer — set_count's target, so a correction is always a self-edit. */
  userId: string;
  task: { id: string; label: string; subtitle: string | null; target: number };
  /** The member's day boundary (profiles.timezone, D34). */
  timeZone: string;
  todayISO: string;
  initialDate: string;
  initialCounts: Record<string, number>; // date → my count (last 14 days)
}) {
  const router = useRouter();
  const { celebrate } = useCelebration();
  const [sound, setSound] = React.useState(true);
  const [date, setDate] = React.useState(initialDate);
  const [counts, setCounts] = React.useState(initialCounts);
  const [error, setError] = React.useState<string | null>(null);
  const [correcting, setCorrecting] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  // "This day's ring was ALREADY closed before the current tap" — the guard
  // that keeps the celebration rare. It must be seeded from the day's real
  // count, not from `false`: a ref that starts unclosed on every mount means
  // returning to a finished ring and tapping it re-fires the congratulations,
  // which is exactly how a reward stops meaning anything. Re-seeded whenever
  // the day being counted changes.
  const justCompleted = React.useRef(
    (initialCounts[initialDate] ?? 0) >= task.target,
  );

  // A mirror of `counts` that is readable synchronously. A correction has to
  // know the settled count the instant its flush resolves — reading React state
  // there would see a value from before the flush's own reconciliation.
  const countsRef = React.useRef(initialCounts);
  const ringClosed = React.useCallback(
    (d: string) => (countsRef.current[d] ?? 0) >= task.target,
    [task.target],
  );
  const applyCounts = React.useCallback(
    (fn: (c: Record<string, number>) => Record<string, number>) => {
      countsRef.current = fn(countsRef.current);
      setCounts(countsRef.current);
    },
    [],
  );
  // The server's todayISO is a render-time snapshot; a PWA left open (or
  // resumed) past the member's midnight would keep writing taps to YESTERDAY —
  // silently, since the RPC's 14-day window accepts it. Track the real local
  // today; when it flips, follow it if the user was ON "today" (backfilling an
  // old day deliberately is left alone) and refresh for the new day's data.
  const todayISO = useLocalToday(timeZone, serverTodayISO, (next, prev) => {
    setDate((d) => {
      const now = d === prev ? next : d;
      justCompleted.current = ringClosed(now);
      return now;
    });
    router.refresh();
  });
  const isToday = date === todayISO;

  const count = counts[date] ?? 0;
  const remaining = Math.max(0, task.target - count);

  // -- batched flushing -------------------------------------------------------
  const pending = React.useRef<Record<string, number>>({});
  // EVERY optimistic delta the server hasn't confirmed yet — pending (still
  // debouncing) PLUS batches already handed to the in-flight chain. Reconciling
  // against `pending` alone made the count visibly dip on a slow network: a
  // second batch had been dequeued but not yet answered, so the first batch's
  // reconcile briefly erased those taps.
  const unconfirmed = React.useRef<Record<string, number>>({});
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = React.useRef<Promise<void>>(Promise.resolve());

  const flush = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const batch = pending.current;
    pending.current = {};
    for (const [d, delta] of Object.entries(batch)) {
      if (delta <= 0) continue;
      // serialise flushes so a slow call can't be overtaken by the next one
      inflight.current = inflight.current.then(async () => {
        const res = await incrementCount(groupId, task.id, d, delta);
        unconfirmed.current[d] = (unconfirmed.current[d] ?? 0) - delta;
        // `res` is undefined when the action redirected (stale session) — the
        // navigation is already happening; just don't touch state.
        if (!res) return;
        if (res.error || res.count == null) {
          // reject → roll the optimistic taps back and surface the reason
          applyCounts((c) => ({ ...c, [d]: Math.max(0, (c[d] ?? 0) - delta) }));
          setError(res.error ?? "Couldn't save — try again");
        } else {
          // authoritative count + everything still awaiting confirmation
          applyCounts((c) => ({
            ...c,
            [d]: res.count! + Math.max(0, unconfirmed.current[d] ?? 0),
          }));
        }
      });
    }
    return inflight.current;
  }, [groupId, task.id, applyCounts]);

  const queue = React.useCallback(
    (delta: number) => {
      setError(null);
      applyCounts((c) => ({ ...c, [date]: (c[date] ?? 0) + delta }));
      pending.current[date] = (pending.current[date] ?? 0) + delta;
      unconfirmed.current[date] = (unconfirmed.current[date] ?? 0) + delta;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), FLUSH_MS);
    },
    [date, flush, applyCounts],
  );

  // -- corrections ------------------------------------------------------------
  // Set the day to an exact number (undo a stray tap, or fix the count
  // outright). Every tap already queued is settled FIRST so the two paths can't
  // race, and the pad is held for the round-trip so a tap made mid-flight can't
  // be silently overwritten by the set that's already on its way.
  const commitExact = React.useCallback(
    async (next: (settled: number) => number) => {
      const d = date; // the day can flip under a slow round-trip
      setError(null);
      setCorrecting(true);
      try {
        await flush();
        const value = Math.max(0, Math.round(next(countsRef.current[d] ?? 0)));
        if (value === (countsRef.current[d] ?? 0)) return true;
        const res = await setCount(groupId, userId, task.id, d, value);
        if (!res) return false; // the action redirected (stale session)
        if (res.error) {
          setError(res.error);
          return false;
        }
        applyCounts((c) => ({ ...c, [d]: value }));
        // Dropping back below the target re-arms the celebration, so closing
        // the ring a second time still feels like closing it — and a correction
        // that lands ON the target closes it just as truly as a tap did.
        if (value < task.target) {
          justCompleted.current = false;
        } else if (!justCompleted.current) {
          justCompleted.current = true;
          if (sound) playComplete();
          celebrate({ title: "Ring closed! 🎉" });
        }
        router.refresh();
        return true;
      } finally {
        setCorrecting(false);
      }
    },
    [
      date,
      flush,
      applyCounts,
      groupId,
      userId,
      task.id,
      task.target,
      router,
      sound,
      celebrate,
    ],
  );

  // best-effort flush when the screen unmounts mid-debounce
  React.useEffect(() => {
    const f = flush;
    return () => {
      void f();
    };
  }, [flush]);

  // ---------------------------------------------------------------------------

  const celebrateIfClosed = (next: number) => {
    if (next >= task.target && !justCompleted.current) {
      justCompleted.current = true;
      if (sound) playComplete();
      celebrate({ title: "Ring closed! 🎉" });
    }
  };

  // Manual taps count one at a time, uncapped (you may go past the target).
  const handleTap = () => {
    queue(1);
    celebrateIfClosed(count + 1);
  };

  // The convenience buttons snap *to* the target — never past it.
  const addCapped = (n: number) => {
    const step = Math.min(n, remaining);
    if (step <= 0) return;
    queue(step);
    celebrateIfClosed(count + step);
  };

  return (
    <div className="flex flex-1 flex-col px-4 pt-4 pb-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<ArrowLeftIcon />}
          onClick={() => router.push(groupHref(groupId, "/today"))}
        >
          Today
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSound((s) => !s)}>
          {sound ? "🔊 Sound on" : "🔇 Sound off"}
        </Button>
      </div>

      <div className="mt-2 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">
          {task.label}
        </h1>
        {task.subtitle && (
          <p className="mt-1 text-lg text-muted-foreground" dir="rtl" lang="ar">
            {task.subtitle}
          </p>
        )}
      </div>

      {/* Day picker — log for today, or back-fill a day that's gone by (D8) */}
      <DayStrip
        className="mt-3"
        value={date}
        days={14}
        today={todayISO}
        isDone={(d) => (counts[d] ?? 0) >= task.target}
        onChange={(d) => {
          // switching to a day that's already finished must not re-arm the
          // celebration for it
          justCompleted.current = ringClosed(d);
          setDate(d);
        }}
      />
      {!isToday && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Logging for{" "}
          <span className="font-medium text-foreground">
            {fmtLongDate(date)}
          </span>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-1 flex-col items-center justify-center">
        <TapPad
          value={count}
          max={task.target}
          sound={sound}
          disabled={correcting}
          onTap={handleTap}
        />

        {/* Corrections read as ONE recessive tray, not two floating buttons:
            a soft pill on the muted tint, hairline-divided, muted label. Gold
            is spent on the primary action below and the ring owns the screen —
            an undo must be findable without competing with either. Segments are
            44px so they stay thumb-sized on a phone at any viewport. */}
        <div className="mt-4 inline-flex items-center overflow-hidden rounded-full border border-border bg-card shadow-sm">
          {count > 0 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                disabled={correcting}
                aria-label="Undo one count"
                className="rounded-none text-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => void commitExact((c) => c - 1)}
              >
                <MinusIcon />
              </Button>
              <span aria-hidden className="h-6 w-px bg-border" />
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={correcting}
            className="h-11 rounded-none px-5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              setDraft(String(count));
              setEditOpen(true);
            }}
          >
            Edit count
          </Button>
        </div>
      </div>

      {remaining === 0 ? (
        // Ring already closed — just a way back.
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            void flush().then(() => router.push(groupHref(groupId, "/today")));
          }}
        >
          Back to today
        </Button>
      ) : (
        <div
          className={cn(
            "grid gap-2",
            // Only offer +10 when it can't overshoot the target.
            remaining > 10 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {remaining > 10 && (
            <Button
              variant="outline"
              onClick={() => {
                if (sound) playTen();
                addCapped(10);
              }}
            >
              +10
            </Button>
          )}
          {/* One tap to finish: fill to the target and celebrate — then STAY.
              Counting past a closed ring is normal (extra dhikr is welcome, and
              manual taps have always been uncapped), so finishing shouldn't be
              the one path that ends the session for you. The closed state
              offers "Back to today", and the header keeps its way out. */}
          <Button
            variant="accent"
            onClick={() => {
              addCapped(remaining);
              void flush();
            }}
          >
            Mark done
          </Button>
        </div>
      )}

      {/* Exact entry — a number, not a slider: the targets here run into the
          hundreds, so a drag can't land on the value you actually counted. */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit count"
        description={`${task.label} · ${isToday ? "today" : fmtLongDate(date)}`}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={correcting}
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={correcting || draft.trim() === ""}
              onClick={() => {
                const value = Number(draft);
                if (!Number.isFinite(value)) return;
                void commitExact(() => value).then((ok) => {
                  if (ok) setEditOpen(false);
                });
              }}
            >
              {correcting ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Count for ${task.label}`}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Target {task.target.toLocaleString()}. Setting a lower number never
          shortens a streak you already earned.
        </p>
        {/* A refusal (out of range, outside the 14-day window) has to be read
            here — the page-level alert is behind the backdrop. */}
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}
      </Dialog>
    </div>
  );
}
