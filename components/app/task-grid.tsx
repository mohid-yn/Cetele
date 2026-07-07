"use client";

/**
 * Task × day completion grid (real, M5). Rows are the group's tasks; each row
 * has one cell per day (oldest → today) coloured by how much of that task's
 * target was hit, with a ✓ on a fully-closed ring. Tap any cell for the exact
 * count. Forgiveness-framed (D8): a missed day is a calm neutral cell, never red.
 *
 * Data arrives as props (the server did the `logs` range scan under RLS); this
 * leaf only handles picking a cell and — when `editable` (D29 proxy-log by an
 * admin, or a member self-correcting) — writing via the `setCount` action. The
 * RPC owns the bounds/window/attribution; on success we `router.refresh()` so
 * the grid re-reads authoritative data.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button, Input } from "@/components/ui";
import { setCount } from "@/app/(app)/group/actions";
import { CheckIcon } from "@/components/demo/icons";

export type GridCell = {
  date: string;
  count: number;
  target: number;
  pct: number;
  full: boolean;
  loggedBy: string | null;
};
export type GridRow = { taskId: string; label: string; cells: GridCell[] };

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
  loggedBy: string | null;
}

export function TaskGrid({
  userId,
  viewerId,
  rows,
  names,
  days,
  editable = false,
}: {
  /** Whose record this is. */
  userId: string;
  /** The signed-in viewer — self-edits carry no attribution. */
  viewerId: string;
  rows: GridRow[];
  /** profileId → display name, for "logged by …" attribution. */
  names: Record<string, string>;
  days: number;
  editable?: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<Picked | null>(null);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const cols = `5.5rem repeat(${days}, minmax(0, 1fr))`;

  function pick(taskId: string, taskLabel: string, c: GridCell) {
    setError(null);
    setPicked({
      taskId,
      taskLabel,
      date: c.date,
      count: c.count,
      target: c.target,
      pct: c.pct,
      loggedBy: c.loggedBy,
    });
    setDraft(String(c.count));
  }

  async function save() {
    if (!picked) return;
    const value = Math.max(0, Math.round(Number(draft) || 0));
    setSaving(true);
    setError(null);
    const { error } = await setCount(userId, picked.taskId, picked.date, value);
    setSaving(false);
    if (error) {
      setError(error);
      return;
    }
    // Reflect the change in the open panel immediately; the grid cells reconcile
    // when the refreshed server props arrive.
    const selfEdit = userId === viewerId;
    setPicked({
      ...picked,
      count: value,
      pct: picked.target ? Math.min(1, value / picked.target) : 0,
      loggedBy: value > 0 && !selfEdit ? viewerId : null,
    });
    router.refresh();
  }

  const loggedByName = picked?.loggedBy ? names[picked.loggedBy] : undefined;
  const dirty = picked != null && draft !== String(picked.count);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div
            key={row.taskId}
            className="grid items-center gap-1"
            style={{ gridTemplateColumns: cols }}
          >
            <span className="truncate pr-1 text-xs font-medium text-foreground">
              {row.label}
            </span>
            {row.cells.map((c) => {
              const isPicked =
                picked?.taskId === row.taskId && picked?.date === c.date;
              return (
                <button
                  key={c.date}
                  type="button"
                  onClick={() => pick(row.taskId, row.label, c)}
                  title={`${fmtFull(c.date)} — ${c.count.toLocaleString()} / ${c.target.toLocaleString()}`}
                  aria-label={`${row.label}, ${fmtFull(c.date)}: ${c.count} of ${c.target}`}
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
                  disabled={!dirty || saving}
                  className="ml-auto"
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
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
