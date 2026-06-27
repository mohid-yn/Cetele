"use client";

/**
 * Reminders (CET-11) — the missing *trigger*.
 *
 * The Hook loop and Fogg's B=MAP both start with a prompt at the moment
 * motivation and ability align. Each task can carry its own daily reminder at a
 * **custom clock time the member sets** — flexibility over a fixed prayer anchor
 * (product-owner call; prayer-time quick-fill presets could layer on later).
 *
 * Mock only: times + on/off persist to the store (so they stick across reloads);
 * the "Preview" button shows a simulated push. A real build sends Web Push from
 * a cron (D10).
 */

import * as React from "react";
import { Button, Card, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { BellIcon } from "./icons";

/** "HH:MM" (24h) → "h:MM AM/PM" for display. */
function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function Reminders() {
  const { state, actions } = useMock();
  const group = sel.activeGroup(state);
  const me = sel.currentUser(state);
  const rows = sel.remindersFor(state, me.id, group.id);

  const [preview, setPreview] = React.useState<{
    label: string;
    target: number;
    time: string;
  } | null>(null);
  const timer = React.useRef<number | null>(null);

  const sendTest = () => {
    const active = rows.find((r) => r.on) ?? rows[0];
    if (!active) return;
    setPreview({
      label: active.task.label,
      target: active.task.targetCount,
      time: active.time,
    });
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
          {activeCount} on · your times
        </span>
      </div>

      <Card className="divide-y divide-border p-0">
        {rows.map((r) => (
          <div key={r.task.id} className="flex items-center gap-3 px-4 py-3">
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
                {r.task.label}{" "}
                <span className="text-muted-foreground">
                  ×{r.task.targetCount}
                </span>
              </p>
              <p
                className={cn(
                  "text-xs tabular-nums",
                  r.on ? "text-muted-foreground" : "text-muted-foreground/60",
                )}
              >
                {fmt12(r.time)}
                {!r.on && " · off"}
              </p>
            </div>

            {/* Editable custom time (CET-11) */}
            <Input
              type="time"
              value={r.time}
              onChange={(e) =>
                actions.setReminderTime(r.task.id, e.target.value)
              }
              aria-label={`${r.task.label} reminder time`}
              className={cn(
                "h-9 w-[7.5rem] shrink-0 tabular-nums",
                !r.on && "opacity-60",
              )}
            />

            <button
              role="switch"
              aria-checked={r.on}
              aria-label={`${r.task.label} reminder`}
              onClick={() => actions.toggleReminder(r.task.id)}
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
            Pick a time that fits your day — change it whenever you like.
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
              Cetele · {fmt12(preview.time)}
            </p>
            <p className="text-sm font-semibold text-foreground">
              Time for {preview.label} 🤲
            </p>
            <p className="text-sm text-muted-foreground">
              {preview.label} ×{preview.target}. Your circle is counting with
              you.
            </p>
          </div>
        </button>
      )}
    </section>
  );
}
