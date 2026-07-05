"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useCelebration } from "@/components/demo/celebration";
import { TapPad } from "@/components/demo/tap-pad";
import { DayStrip, fmtLongDate } from "@/components/demo/day-strip";
import { ArrowLeftIcon } from "@/components/demo/icons";
import { playTen } from "@/lib/sound";
import { incrementCount } from "../../today/actions";

/**
 * The optimistic tap pad (M3). Every tap lands locally at once; deltas are
 * batched per day and flushed to the increment_count RPC on a short debounce
 * (the RPC enforces the count-integrity bounds — the client only needs to be
 * honest, not trusted). A rejected flush rolls the local count back.
 */

const FLUSH_MS = 600;

export function CountClient({
  task,
  todayISO,
  initialDate,
  initialCounts,
}: {
  task: { id: string; label: string; subtitle: string | null; target: number };
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
  const isToday = date === todayISO;

  const count = counts[date] ?? 0;
  const remaining = Math.max(0, task.target - count);
  const justCompleted = React.useRef(false);

  // -- batched flushing -------------------------------------------------------
  const pending = React.useRef<Record<string, number>>({});
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
        const res = await incrementCount(task.id, d, delta);
        if (res.error || res.count == null) {
          // reject → roll the optimistic taps back and surface the reason
          setCounts((c) => ({ ...c, [d]: Math.max(0, (c[d] ?? 0) - delta) }));
          setError(res.error ?? "Couldn't save — try again");
        } else {
          // authoritative count + anything the user tapped since this batch
          setCounts((c) => ({
            ...c,
            [d]: res.count! + (pending.current[d] ?? 0),
          }));
        }
      });
    }
    return inflight.current;
  }, [task.id]);

  const queue = React.useCallback(
    (delta: number) => {
      setError(null);
      setCounts((c) => ({ ...c, [date]: (c[date] ?? 0) + delta }));
      pending.current[date] = (pending.current[date] ?? 0) + delta;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), FLUSH_MS);
    },
    [date, flush],
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
          onClick={() => router.push("/today")}
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
          justCompleted.current = false;
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
          onTap={handleTap}
        />
      </div>

      {remaining === 0 ? (
        // Ring already closed — just a way back.
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            void flush().then(() => router.push("/today"));
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
          {/* One tap to finish: fill to the target, celebrate, and head back. */}
          <Button
            variant="accent"
            onClick={() => {
              addCapped(remaining);
              void flush().then(() => router.push("/today"));
            }}
          >
            Mark done
          </Button>
        </div>
      )}
    </div>
  );
}
