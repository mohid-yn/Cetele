"use client";

/**
 * Member task-breakdown (admin oversight). When a group/app admin taps a member
 * on the Group → Members roster, this shows that member's per-task completion
 * for the last fortnight — so the admin can follow up about *specific days*
 * ("you missed Salawat Tue–Thu — everything ok?"). Forgiveness-framed (D8): a
 * missed day is a calm neutral cell, never a red alarm. Read-only.
 *
 * Fortnight window by design: short enough to be cheap to store/query, long
 * enough to spot a slip. Behind a real backend it's one `logs` range scan.
 */

import * as React from "react";
import { Dialog, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { CheckIcon, FlameIcon } from "./icons";

const DAYS = 14;

/** Emerald intensity by share of the task's target hit that day (green = growth);
 *  no activity reads as a neutral cell, never red (D8). Mirrors the heatmap. */
function cellClass(pct: number, count: number): string {
  if (count <= 0) return "bg-muted";
  if (pct >= 1) return "bg-primary";
  if (pct >= 0.66) return "bg-primary/70";
  if (pct >= 0.33) return "bg-primary/45";
  return "bg-primary/20";
}

function fmtFull(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function MemberBreakdownDialog({
  userId,
  groupId,
  open,
  onClose,
}: {
  userId: string | null;
  groupId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { state } = useMock();
  // A tapped cell → the exact figure for that day+task (the "ask about a day").
  // The parent keys this component by member, so it remounts (and `picked`
  // resets) each time a different member is opened — no reset effect needed.
  const [picked, setPicked] = React.useState<{
    taskLabel: string;
    date: string;
    count: number;
    target: number;
    pct: number;
  } | null>(null);

  if (!userId) return null;

  const user = sel.user(state, userId);
  if (!user) return null;

  const role = sel.membershipRole(state, userId, groupId);
  const { dates, rows } = sel.taskBreakdown(state, userId, groupId, DAYS);
  const score = sel.consistency(state, userId, groupId, DAYS);
  const streak = sel.streak(state, userId)?.current ?? 0;
  const daysFull = Array.from({ length: DAYS }, (_, i) =>
    sel.dayCompletion(state, userId, groupId, dates[i]),
  ).filter((d) => d.full).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={user.name}
      description={`Last ${DAYS} days · tap a square for that day's detail`}
      // Full-width on phones, but grow on larger screens so the 14-day grid is
      // comfortable instead of a tiny box in the middle of a wide desktop.
      className="max-w-[min(95vw,48rem)]"
    >
      <div className="flex flex-col gap-4">
        {/* Summary chips */}
        <div className="flex flex-wrap items-center gap-2">
          {role === "group_admin" && (
            <Badge variant="primary" size="sm">
              admin
            </Badge>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground tabular-nums">
            {score}% fully complete
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground tabular-nums">
            {daysFull}/{DAYS} full days
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground tabular-nums">
            <FlameIcon className="size-3.5 text-accent" />
            {streak}d streak
          </span>
        </div>

        {/* Task × day grid. First column = task label, then one cell per day. */}
        <div className="flex flex-col gap-1.5">
          {rows.map(({ task, cells }) => (
            <div
              key={task.id}
              className="grid items-center gap-1"
              style={{
                gridTemplateColumns: `5.5rem repeat(${DAYS}, minmax(0, 1fr))`,
              }}
            >
              <span className="truncate pr-1 text-xs font-medium text-foreground">
                {task.label}
              </span>
              {cells.map((c) => {
                const isPicked =
                  picked?.taskLabel === task.label && picked?.date === c.date;
                return (
                  <button
                    key={c.date}
                    type="button"
                    onClick={() =>
                      setPicked({
                        taskLabel: task.label,
                        date: c.date,
                        count: c.count,
                        target: c.target,
                        pct: c.pct,
                      })
                    }
                    title={`${fmtFull(c.date)} — ${c.count.toLocaleString()} / ${c.target.toLocaleString()}`}
                    aria-label={`${task.label}, ${fmtFull(c.date)}: ${c.count} of ${c.target}`}
                    className={cn(
                      "grid aspect-square place-items-center rounded-[3px] transition-transform hover:scale-110",
                      cellClass(c.pct, c.count),
                      isPicked &&
                        "ring-2 ring-accent ring-offset-1 ring-offset-card",
                    )}
                  >
                    {c.full && (
                      <CheckIcon className="size-2.5 text-primary-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {/* Older → today caption under the grid */}
          <div
            className="grid gap-1 text-[10px] text-muted-foreground"
            style={{
              gridTemplateColumns: `5.5rem repeat(${DAYS}, minmax(0, 1fr))`,
            }}
            aria-hidden
          >
            <span />
            <span className="col-span-7">{DAYS} days ago</span>
            <span className="col-span-7 text-right">today</span>
          </div>
        </div>

        {/* Picked-cell detail — the figure the admin follows up on */}
        <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm">
          {picked ? (
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-medium text-foreground">
                {fmtFull(picked.date)}
              </span>
              <span className="text-muted-foreground">
                · {picked.taskLabel}
              </span>
              <span className="ml-auto font-display font-semibold text-foreground tabular-nums">
                {picked.count.toLocaleString()} /{" "}
                {picked.target.toLocaleString()}
                {picked.pct >= 1 ? (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-success">
                    <CheckIcon className="size-3.5" />
                    done
                  </span>
                ) : (
                  <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                    {Math.round(picked.pct * 100)}%
                  </span>
                )}
              </span>
            </p>
          ) : (
            <p className="text-muted-foreground">
              Tap any square to see that day&apos;s exact count.
            </p>
          )}
        </div>

        {/* Legend — colour always paired with a label (§5 colour-blind safety) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3.5 rounded-[3px] bg-muted" />
            Missed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3.5 rounded-[3px] bg-primary/45" />
            Partial
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="grid size-3.5 place-items-center rounded-[3px] bg-primary">
              <CheckIcon className="size-2.5 text-primary-foreground" />
            </span>
            Done
          </span>
        </div>
      </div>
    </Dialog>
  );
}
