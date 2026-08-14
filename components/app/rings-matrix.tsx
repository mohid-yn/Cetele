/**
 * Member × day rings matrix — the circle's fortnight in one view (admin-only).
 *
 * The per-member breakdown (`task-grid`) answers "how has THIS member been
 * doing", one name at a time behind a tap. That is the right shape for a
 * record and the wrong one for a circle: seeing everybody meant opening every
 * member in turn and holding fourteen days each in your head, so the two things
 * an admin actually watches for were invisible — one person quietly fading over
 * a week, and a day the WHOLE circle dropped (which is a fact about the day, not
 * about the people, and is unreadable from any single member's grid).
 *
 * Same data as the breakdown, axes swapped. A cell is one member's day: how many
 * of the rings that day asked of them they closed. It draws with the shared
 * `dayCellClass` ramp rather than its own, so "nearly done" cannot come to mean
 * two different shades in two grids one tap apart.
 *
 * Read-only by design. The roster directly beneath it carries the tap targets
 * into each member's record, so making the squares interactive too would put two
 * routes to the same place on one screen — and a matrix is for noticing, not for
 * editing (D59's lesson about one surface carrying two jobs).
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { dayCellClass } from "@/lib/grid-scale";

export type RingCell = {
  date: string;
  /** Rings this day asked of them (0023 + frequency). 0 = nothing owed. */
  owed: number;
  /** Of those, how many closed — against their own obligation (D61), never a
   *  stretch goal they set themselves (D51). */
  closed: number;
  /** Any effort at all that day, over the tasks that were theirs. */
  activity: number;
};
export type RingRow = {
  userId: string;
  name: string;
  isMe: boolean;
  cells: RingCell[];
};

function fmtFull(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function describe(c: RingCell): string {
  if (c.owed === 0) return "nothing due";
  return `${c.closed} of ${c.owed} rings`;
}

/**
 * Today's rings as marks rather than as a score — the roster's version.
 *
 * The framing is deliberate and is the whole reason this is dots and not a bare
 * "0 of 4": every member of the circle sees this row, and a bare fraction next
 * to somebody's name is a VERDICT rendered to their peers, which is the shame
 * mechanic D8/D28 rule out. Filled marks read as what is present; the rest are
 * hairline outlines — the empty-cell rule (`dayCellClass`) in miniature, and for
 * the identical reason. Nothing here is ever red.
 *
 * Caps at 8, because past that the marks stop being countable at a glance and
 * the fraction beside them is doing the work anyway.
 */
export function RingDots({ closed, owed }: { closed: number; owed: number }) {
  if (owed === 0 || owed > 8) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-hidden
      // The fraction beside this carries the meaning for a screen reader; the
      // marks are decoration of it, so announcing eight separate dots would be
      // noise rather than information.
    >
      {Array.from({ length: owed }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full",
            i < closed ? "bg-primary" : "ring-1 ring-progress-track ring-inset",
          )}
        />
      ))}
    </span>
  );
}

export function RingsMatrix({ rows, days }: { rows: RingRow[]; days: number }) {
  // The 44px tap floor does not apply — these cells are not controls — but the
  // FLOOR-not-size rule still does: a fixed track would keep the phone's width
  // on a 4K monitor. `minmax` bottoms out at a legible square on a phone (where
  // the row scrolls) and spends whatever room a desktop actually has.
  const cellCols = `repeat(${days}, minmax(1.25rem, 1fr))`;

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {/* A label column that never scrolls, beside cells that do — the same
            split `task-grid` uses, and for the same reason: a long name floated
            over the squares is unreadable in both directions. The height ladder
            is duplicated onto both columns because that is the only thing
            keeping them in step once the cells grow with the viewport. */}
        <div className="flex shrink-0 flex-col gap-1">
          {rows.map((r) => (
            <div
              key={r.userId}
              className="flex h-5 max-w-[7.5rem] items-center pr-1 lg:h-6"
            >
              <span
                className={cn(
                  "truncate text-xs",
                  r.isMe
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground",
                )}
              >
                {r.name}
                {r.isMe && " (you)"}
              </span>
            </div>
          ))}
          <div className="h-4" aria-hidden />
        </div>

        <div className="-m-1 no-scrollbar min-w-0 flex-1 overflow-x-auto p-1">
          <div className="flex w-full max-w-[88rem] min-w-max flex-col gap-1">
            {rows.map((r) => (
              <div
                key={r.userId}
                className="grid h-5 items-center gap-1 lg:h-6"
                style={{ gridTemplateColumns: cellCols }}
              >
                {r.cells.map((c) => (
                  <div
                    key={c.date}
                    title={`${r.name} — ${fmtFull(c.date)}: ${describe(c)}`}
                    aria-label={`${r.name}, ${fmtFull(c.date)}: ${describe(c)}`}
                    className={cn(
                      // Height from the row, width from the track — an
                      // aspect-square would make a widened desktop cell as TALL
                      // as it is wide and burst the row.
                      "h-full w-full rounded-[3px]",
                      dayCellClass(
                        c.owed ? c.closed / c.owed : 0,
                        c.activity,
                        c.owed > 0,
                      ),
                    )}
                  />
                ))}
              </div>
            ))}
            <div
              className="grid gap-1 text-[10px] text-muted-foreground"
              style={{ gridTemplateColumns: cellCols }}
              aria-hidden
            >
              <span className="col-span-7">{days} days ago</span>
              <span className="col-span-7 text-right">today</span>
            </div>
          </div>
        </div>
      </div>

      {/* Colour always paired with a label (DESIGN_SYSTEM §5, colour-blind
          safety) — and the ramp is named by what it MEANS, not by its shade. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-muted ring-1 ring-progress-track ring-inset" />
          No rings
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-primary/45" />
          Some
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-primary" />
          All closed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] border border-dashed border-border" />
          Nothing due
        </span>
      </div>
    </div>
  );
}
