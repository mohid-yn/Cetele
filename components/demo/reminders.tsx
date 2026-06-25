"use client";

/**
 * Reminders + habit-stacking (CET-11) — the missing *trigger*.
 *
 * The Hook loop and Fogg's B=MAP both start with a prompt at the moment
 * motivation and ability align. Rather than a vague "don't forget!", each
 * reminder is *stacked on an existing anchor* ("After Fajr, complete your
 * SubhanAllah ×100") — the Tiny-Habits pattern, far stickier.
 *
 * Mock only: toggles are local state and the "test" button shows a simulated
 * push notification. A real build sends Web Push from a cron (D10).
 */

import * as React from "react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { BellIcon } from "./icons";

/** Prayer anchors to stack reminders on, in daily order. */
const ANCHORS = [
  { anchor: "After Fajr", time: "5:10 AM" },
  { anchor: "After Dhuhr", time: "1:15 PM" },
  { anchor: "After Asr", time: "4:45 PM" },
  { anchor: "After Maghrib", time: "8:30 PM" },
  { anchor: "After Isha", time: "10:00 PM" },
];

interface ReminderRow {
  taskId: string;
  label: string;
  target: number;
  anchor: string;
  time: string;
  on: boolean;
}

export function Reminders() {
  const { state } = useMock();
  const group = sel.activeGroup(state);
  const tasks = sel.groupTasks(state, group.id);

  const [rows, setRows] = React.useState<ReminderRow[]>(() =>
    tasks.map((t, i) => ({
      taskId: t.id,
      label: t.label,
      target: t.targetCount,
      anchor: ANCHORS[i % ANCHORS.length].anchor,
      time: ANCHORS[i % ANCHORS.length].time,
      on: i < 2, // a couple on by default, so it's not noisy
    })),
  );
  const [preview, setPreview] = React.useState<ReminderRow | null>(null);
  const timer = React.useRef<number | null>(null);

  const toggle = (taskId: string) =>
    setRows((rs) =>
      rs.map((r) => (r.taskId === taskId ? { ...r, on: !r.on } : r)),
    );

  const sendTest = () => {
    const active = rows.find((r) => r.on) ?? rows[0];
    if (!active) return;
    setPreview(active);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPreview(null), 4200);
    if (typeof navigator !== "undefined" && "vibrate" in navigator)
      navigator.vibrate?.(30);
  };

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const activeCount = rows.filter((r) => r.on).length;

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Reminders</h2>
        <span className="text-xs text-muted-foreground">
          {activeCount} on · stacked on prayer
        </span>
      </div>

      <Card className="divide-y divide-border p-0">
        {rows.map((r) => (
          <div key={r.taskId} className="flex items-center gap-3 px-4 py-3">
            <div
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full",
                r.on
                  ? "bg-primary-100 text-primary-700"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <BellIcon className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {r.anchor} —{" "}
                <span className="text-muted-foreground">
                  {r.label} ×{r.target}
                </span>
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {r.time}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={r.on}
              aria-label={`${r.anchor} reminder`}
              onClick={() => toggle(r.taskId)}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-[var(--duration-fast)]",
                r.on ? "bg-primary" : "bg-neutral-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-5 rounded-full bg-neutral-0 shadow-sm transition-[left] duration-[var(--duration-fast)]",
                  r.on ? "left-[1.375rem]" : "left-0.5",
                )}
              />
            </button>
          </div>
        ))}

        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Smart timing learns when you usually log and nudges just before.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={sendTest}
          >
            Preview
          </Button>
        </div>
      </Card>

      {/* Simulated push notification */}
      {preview && (
        <button
          type="button"
          onClick={() => setPreview(null)}
          className="fixed inset-x-0 top-3 z-[var(--z-toast)] mx-auto flex w-[min(22rem,calc(100%-1.5rem))] items-start gap-3 rounded-2xl border border-border bg-card p-3.5 text-left shadow-xl"
          style={{
            animation: "celebrate-in var(--duration-base) var(--ease-spring)",
          }}
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <BellIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">
              Cetele · now
            </p>
            <p className="text-sm font-semibold text-foreground">
              {preview.anchor} 🤲
            </p>
            <p className="text-sm text-muted-foreground">
              Time for {preview.label} ×{preview.target}. Your circle is
              counting with you.
            </p>
          </div>
        </button>
      )}
    </section>
  );
}
