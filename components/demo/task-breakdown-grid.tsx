"use client";

/**
 * Task × day completion grid — the clear, readable "fortnight" view. Rows are
 * the group's tasks; each row has one cell per day (oldest → today) coloured by
 * how much of that task's target was hit, with a ✓ on a fully-closed ring. Tap
 * any cell for the exact count. Forgiveness-framed (D8): a missed day is a calm
 * neutral cell, never red.
 *
 * Shared by the admin member-breakdown dialog and the personal Progress view,
 * so "how am I doing?" and "how is this member doing?" read identically.
 *
 * When `editable` (D29 proxy-logging — an admin tallying for a member, or a
 * member correcting their own record), the picked-cell panel becomes an editor:
 * set the exact count, "Mark done", or "Clear". Admin-made entries are
 * attributed ("logged by …"); a member editing their own record isn't.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button, Input } from "@/components/ui";
import { useMock, sel } from "@/lib/mock/store";
import { CheckIcon } from "./icons";

/** Emerald intensity by share of the task's target hit that day (green = growth);
 *  no activity reads as a neutral cell, never red (D8). */
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

interface Picked {
  taskId: string;
  taskLabel: string;
  date: string;
  count: number;
  target: number;
  pct: number;
  loggedBy?: string;
}

export function TaskBreakdownGrid({
  userId,
  groupId,
  days = 14,
  editable = false,
}: {
  userId: string;
  groupId: string;
  days?: number;
  /** D29: allow setting/correcting counts from the picked-cell panel. */
  editable?: boolean;
}) {
  const { state, actions } = useMock();
  const [picked, setPicked] = React.useState<Picked | null>(null);
  const [draft, setDraft] = React.useState("");

  const { rows } = sel.taskBreakdown(state, userId, groupId, days);
  const cols = `5.5rem repeat(${days}, minmax(0, 1fr))`;

  function pick(p: Picked) {
    setPicked(p);
    setDraft(String(p.count));
  }

  function save() {
    if (!picked) return;
    const value = Math.max(0, Math.round(Number(draft) || 0));
    actions.setCount(userId, picked.taskId, picked.date, value);
    // Reflect the change locally so the panel updates without a re-tap; an
    // admin editing someone else's record stamps the attribution.
    const selfEdit = userId === state.session.currentUserId;
    setPicked({
      ...picked,
      count: value,
      pct: picked.target ? Math.min(1, value / picked.target) : 0,
      loggedBy:
        value > 0 && !selfEdit ? state.session.currentUserId : undefined,
    });
  }

  const loggedByName = picked?.loggedBy
    ? sel.user(state, picked.loggedBy)?.name
    : undefined;
  const dirty = picked != null && draft !== String(picked.count);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        {rows.map(({ task, cells }) => (
          <div
            key={task.id}
            className="grid items-center gap-1"
            style={{ gridTemplateColumns: cols }}
          >
            <span className="truncate pr-1 text-xs font-medium text-foreground">
              {task.label}
            </span>
            {cells.map((c) => {
              const isPicked =
                picked?.taskId === task.id && picked?.date === c.date;
              return (
                <button
                  key={c.date}
                  type="button"
                  onClick={() =>
                    pick({
                      taskId: task.id,
                      taskLabel: task.label,
                      date: c.date,
                      count: c.count,
                      target: c.target,
                      pct: c.pct,
                      loggedBy: c.loggedBy,
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
          style={{ gridTemplateColumns: cols }}
          aria-hidden
        >
          <span />
          <span className="col-span-7">{days} days ago</span>
          <span className="col-span-7 text-right">today</span>
        </div>
      </div>

      {/* Picked-cell detail (+ editor when editable) */}
      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm">
        {picked ? (
          <div className="flex flex-col gap-2.5">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-medium text-foreground">
                {fmtFull(picked.date)}
              </span>
              <span className="text-muted-foreground">
                · {picked.taskLabel}
              </span>
              {loggedByName && (
                <span className="text-xs text-muted-foreground">
                  · logged by {loggedByName}
                </span>
              )}
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

            {editable && (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="Count for this day"
                  className="h-9 w-24"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft(String(picked.target))}
                >
                  Mark done
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDraft("0")}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={save}
                  disabled={!dirty}
                  className="ml-auto"
                >
                  Save
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">
            Tap any square to see that day&apos;s exact count
            {editable ? " — or to log it" : ""}.
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
  );
}
