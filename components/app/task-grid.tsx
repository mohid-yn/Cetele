"use client";

/**
 * Task × day completion grid (real, M5). Rows are the group's tasks; each row
 * has one cell per day (oldest → today) coloured by how much of that task's
 * target was hit, with a ✓ on a fully-closed ring. Forgiveness-framed (D8): a
 * missed day is a calm neutral cell, never red.
 *
 * THE GRID REVIEWS A FORTNIGHT; THE EDITOR BELOW WORKS A DAY (D61)
 *
 * Selecting picks a DAY, not a single task's cell, and the editor lists every
 * task that day asked for — filled in, saved together, with one button that
 * closes the whole day.
 *
 * That split is the point. The old editor was per cell: an admin logging a
 * member's day at a halaqah had to find today's column in a horizontally
 * scrolling fortnight, tap one square, type, press Save, and repeat for every
 * task — four round trips through a review instrument to record one sitting.
 * The grid is the right shape for "how has this member been doing" and the wrong
 * shape for "write down what just happened", and it had been carrying both jobs.
 * So the fortnight stays exactly as it was and the day gets its own controls,
 * opened on TODAY because that is the day being written almost every time.
 *
 * Data arrives as props (the server did the `logs` range scan under RLS); this
 * leaf only picks a day and — when `editable` (D29 proxy-log by an admin, or a
 * member self-correcting) — writes via the `setCount` action. The RPC owns the
 * bounds/window/attribution; on success we `router.refresh()` so the grid
 * re-reads authoritative data.
 */

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { DURATION, easeBrand } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Button, Input } from "@/components/ui";
import { setCount } from "@/app/(app)/g/[groupId]/group/actions";
import { CheckIcon, ChevronRightIcon } from "@/components/app/icons";
import { InlineAlert } from "@/components/app/inline-alert";
import { usePropState } from "@/lib/use-prop-state";

export type GridCell = {
  date: string;
  count: number;
  /** What THIS member was asked for on THIS day (0024 + 0032) — never the live
   *  circle target, and never another member's share. */
  target: number;
  pct: number;
  full: boolean;
  loggedBy: string | null;
  /**
   * Was this task this member's on this day (0023)? A day it was not theirs is
   * not a day they fell short, and must not be drawn like one.
   */
  owed: boolean;
};
export type GridRow = { taskId: string; label: string; cells: GridCell[] };

/** Emerald intensity by share of the task's target hit that day (green = growth);
 *  no activity reads as a neutral cell, never red (D8).
 *
 *  The empty cell is OUTLINED, not darkened. `bg-muted` alone measured 1.2:1 on
 *  the card, so the grid's shape was invisible — but filling it with the
 *  --progress-track tone would make a missed day visually HEAVIER than a barely-
 *  touched one (`bg-primary/20`), inverting the ramp and reading as punishment,
 *  which D8 rules out. A hairline at track strength makes the slot unmistakable
 *  while its fill stays the lightest rung of the scale. */
function cellClass(pct: number, count: number, owed = true): string {
  // Not theirs that day (0023): no fill AND no outline. The empty-day hairline
  // means "a slot you could have filled", so wearing it here would say the
  // member missed something that was never asked of them — the same punishment
  // read the hairline itself exists to avoid, one step along. Absence is the
  // honest mark for an absent obligation.
  if (!owed) return "bg-transparent";
  if (count <= 0) return "bg-muted ring-1 ring-inset ring-progress-track";
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
  // The grid always renders under /g/[groupId]/… (group Members, own Progress).
  const groupId = String(useParams().groupId ?? "");

  // A local copy of the server's rows, so a saved count shows immediately
  // instead of after the refresh lands — and re-seeded whenever a genuine
  // refetch delivers new ones, which is what stops the optimistic value from
  // outliving the truth it was guessing at.
  const [liveRows, setLiveRows] = usePropState(rows);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Every date in the window, oldest → newest. Taken from the rows rather than
  // recomputed from `days`: the server builds them on the MEMBER's calendar
  // (D34), and a second derivation here could disagree with it by a day.
  const dates = React.useMemo(() => {
    const seen = new Set<string>();
    for (const r of liveRows) for (const c of r.cells) seen.add(c.date);
    return [...seen].sort();
  }, [liveRows]);
  const todayISO = dates[dates.length - 1];

  // Open on TODAY. Adjusted during render rather than in an effect — the
  // pattern `lib/use-prop-state.ts` documents and the one this repo lints for.
  // Keyed on the last date, so it re-seeds when the day actually rolls over and
  // NOT on every refresh, which would throw away a day the admin had picked.
  const [picked, setPicked] = React.useState<string | null>(null);
  const [seededFor, setSeededFor] = React.useState<string | undefined>();
  if (todayISO && seededFor !== todayISO) {
    setSeededFor(todayISO);
    setPicked(todayISO);
  }

  // The grid scrolls horizontally (cells are a real 44px tap target rather than
  // a ~15px square you can't thumb), so open it scrolled to TODAY — the
  // rightmost, most-logged day — instead of a fortnight ago.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  // 44px is the tap-target FLOOR, not the size. It used to be a fixed width, so
  // the grid stayed 668px wide however much room it had — 44% of the card at
  // 1920, i.e. the wider the monitor the more it wasted. `minmax(floor, 1fr)`
  // keeps the phone behaviour exactly (tracks bottom out at 44px, the row
  // scrolls) and lets a desktop spend the space it actually has.
  const cellCols = `repeat(${days}, minmax(2.75rem, 1fr))`;

  // What this day actually asked of them. A task they did not carry that day is
  // dropped rather than shown disabled: the editor is a list of things to write
  // down, and a row you cannot write to is noise in it. The grid above still
  // shows the absence, which is where that fact belongs.
  const dayRows = React.useMemo(() => {
    if (!picked) return [];
    return liveRows.flatMap((row) => {
      const cell = row.cells.find((c) => c.date === picked);
      return cell && cell.owed ? [{ row, cell }] : [];
    });
  }, [liveRows, picked]);

  // Drafts, re-seeded each time the day changes so an abandoned edit is
  // genuinely abandoned rather than waiting behind the next day. Adjusted during
  // render for the reason above; it cannot key on `dayRows`, which is a fresh
  // identity whenever the parent re-renders.
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [draftFor, setDraftFor] = React.useState<string | null>(null);
  if (picked !== draftFor) {
    setDraftFor(picked);
    setDraft(
      Object.fromEntries(
        dayRows.map(({ row, cell }) => [row.taskId, String(cell.count)]),
      ),
    );
    setError(null);
  }

  const dirty = dayRows.some(
    ({ row, cell }) =>
      (draft[row.taskId] ?? String(cell.count)) !== String(cell.count),
  );

  function pick(date: string) {
    setError(null);
    setPicked(date);
  }

  function step(delta: number) {
    if (!picked) return;
    const i = dates.indexOf(picked);
    const next = dates[i + delta];
    if (next) pick(next);
  }

  /** Write the given counts, then reconcile. Only rows that actually MOVED are
   *  sent — a save that re-writes every task would stamp the admin's name on
   *  days they never touched (`logs.logged_by`). */
  async function commit(next: Record<string, number>) {
    const changes = dayRows.filter(
      ({ row, cell }) =>
        next[row.taskId] !== undefined && next[row.taskId] !== cell.count,
    );
    if (changes.length === 0 || !picked) return;

    setSaving(true);
    setError(null);
    const failed: string[] = [];
    const applied: Record<string, number> = {};

    // try/finally, not a bare await: `saving` disables every control here, so a
    // throw would leave the editor stuck on "Saving…" with no way out — the
    // failure `goals-dialog.tsx` records as the worst one a modal can have.
    try {
      // Serialized on purpose: a handful of writes against one member's rows,
      // and a failure has to name the task it belongs to.
      for (const { row, cell } of changes) {
        const value = next[row.taskId];
        const res = await setCount(
          groupId,
          userId,
          row.taskId,
          cell.date,
          value,
        );
        // `res` is typed non-null, but the action redirects on a stale session
        // (lib/stale-session.ts), which resolves the call to nothing.
        if (!res || res.error) failed.push(row.label);
        else applied[row.taskId] = value;
      }
    } catch {
      for (const { row } of changes) {
        if (applied[row.taskId] === undefined && !failed.includes(row.label))
          failed.push(row.label);
      }
    } finally {
      setSaving(false);
    }

    // Reflect what LANDED, including on a partial failure — the rows that saved
    // are real and the grid must not keep showing the old numbers.
    if (Object.keys(applied).length > 0) {
      const selfEdit = userId === viewerId;
      setLiveRows((prev) =>
        prev.map((r) => {
          const value = applied[r.taskId];
          if (value === undefined) return r;
          return {
            ...r,
            cells: r.cells.map((c) =>
              c.date === picked
                ? {
                    ...c,
                    count: value,
                    pct: c.target ? Math.min(1, value / c.target) : 0,
                    full: value >= c.target,
                    loggedBy: value > 0 && !selfEdit ? viewerId : null,
                  }
                : c,
            ),
          };
        }),
      );
      setDraft((d) => ({
        ...d,
        ...Object.fromEntries(
          Object.entries(applied).map(([id, v]) => [id, String(v)]),
        ),
      }));
    }

    if (failed.length > 0) {
      setError(`Couldn't save ${failed.join(", ")} — try again in a moment.`);
      return;
    }
    router.refresh();
  }

  function save() {
    const next: Record<string, number> = {};
    for (const { row, cell } of dayRows) {
      const raw = (draft[row.taskId] ?? "").trim();
      next[row.taskId] =
        raw === "" ? cell.count : Math.max(0, Math.round(Number(raw) || 0));
    }
    void commit(next);
  }

  /** Close every ring this day asked for, in one action.
   *
   *  Tops up; never trims. `setCount` is an exact-set, so writing the target
   *  over a member who had counted PAST it would erase the extra — and extra
   *  dhikr is explicitly welcome (0008's sanity-cap comment). This is the same
   *  rule `logForGroup` learned the hard way for the whole circle, applied to
   *  one member's day. */
  function markDayDone() {
    const next: Record<string, number> = {};
    for (const { row, cell } of dayRows) {
      next[row.taskId] = Math.max(cell.count, cell.target);
    }
    void commit(next);
  }

  const dayComplete =
    dayRows.length > 0 &&
    dayRows.every(({ cell }) => cell.count >= cell.target);

  const pickedIndex = picked ? dates.indexOf(picked) : -1;

  return (
    <div className="flex flex-col gap-4">
      {/* A fixed label column that never scrolls, beside a cells region that does —
          so a long task name can never paint over the day squares (the old sticky
          column floated the label over the cells). The label rows carry the SAME
          height ladder as the cell rows (h-11 → lg:h-14 → 2xl:h-16) because that
          is the only thing keeping the two columns in step now that the cells
          grow with the viewport. */}
      <div className="flex gap-2">
        <div className="flex shrink-0 flex-col gap-1.5">
          {liveRows.map((row) => (
            <div
              key={row.taskId}
              className="flex h-11 max-w-[7.5rem] items-center pr-1 lg:h-14 2xl:h-16"
            >
              <span className="truncate text-xs font-medium text-foreground">
                {row.label}
              </span>
            </div>
          ))}
          {/* spacer aligned to the caption row on the right */}
          <div className="h-4" aria-hidden />
        </div>

        <div
          ref={scrollRef}
          className="-m-1 no-scrollbar min-w-0 flex-1 overflow-x-auto p-1"
        >
          {/* `min-w-max` keeps the phone contract (never squeeze a day below the
              44px floor — overflow and scroll instead) and `w-full` lets a
              desktop fill the card it sits in. The cap only bites on a genuine
              ultrawide, where a full-width row is its own readability problem —
              the same reasoning as the --container-page ladder. */}
          <div className="flex w-full max-w-[88rem] min-w-max flex-col gap-1.5">
            {liveRows.map((row) => (
              <div
                key={row.taskId}
                className="grid h-11 items-center gap-1 lg:h-14 2xl:h-16"
                style={{ gridTemplateColumns: cellCols }}
              >
                {row.cells.map((c) => {
                  const isPicked = picked === c.date;
                  return (
                    <button
                      key={c.date}
                      type="button"
                      // Every cell selects its DAY, including one the task was
                      // not theirs on: the day is still a day, and disabling the
                      // square would put holes in the column you are trying to
                      // click. What it was not owed shows in the fill, and the
                      // editor simply does not list it.
                      onClick={() => pick(c.date)}
                      title={
                        c.owed
                          ? `${fmtFull(c.date)} — ${c.count.toLocaleString()} / ${c.target.toLocaleString()}`
                          : `${fmtFull(c.date)} — not assigned`
                      }
                      aria-label={
                        c.owed
                          ? `${row.label}, ${fmtFull(c.date)}: ${c.count} of ${c.target}`
                          : `${row.label}, ${fmtFull(c.date)}: not assigned`
                      }
                      aria-pressed={isPicked}
                      className={cn(
                        // Height comes from the ROW, width from the track — an
                        // `aspect-square` here would make a widened desktop cell
                        // as TALL as it is wide and burst the row.
                        "grid h-full w-full place-items-center rounded-md transition-transform hover:scale-105",
                        cellClass(c.pct, c.count, c.owed),
                        // The whole COLUMN wears the selection now, so the ring
                        // reads as "this day" rather than "this square".
                        isPicked &&
                          "ring-2 ring-accent ring-offset-1 ring-offset-card",
                      )}
                    >
                      {c.full && (
                        <CheckIcon className="size-4 text-primary-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            {/* Older → today caption under the grid */}
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

      {/* The picked DAY (+ editor when editable). Only the CONTENTS crossfade
          when you move to another day — the box itself stays put, so changing
          day doesn't make the page jump under your thumb. */}
      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm">
        <AnimatePresence mode="wait" initial={false}>
          {picked ? (
            <motion.div
              key={picked}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={easeBrand(DURATION.fast)}
              className="flex flex-col gap-3"
            >
              {/* Day header — the date, how it stands, and a step either way. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-foreground">
                  {fmtFull(picked)}
                </span>
                {picked === todayISO && (
                  <span className="text-xs text-muted-foreground">today</span>
                )}
                {dayComplete && dayRows.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-success">
                    <CheckIcon className="size-3.5" />
                    complete
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Previous day"
                    disabled={saving || pickedIndex <= 0}
                    onClick={() => step(-1)}
                  >
                    {/* The mirror of the forward chevron. Rotated rather than
                        drawn again, so the two directions cannot drift apart. */}
                    <ChevronRightIcon className="size-4 rotate-180" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Next day"
                    disabled={saving || pickedIndex >= dates.length - 1}
                    onClick={() => step(1)}
                  >
                    <ChevronRightIcon className="size-4" />
                  </Button>
                </div>
              </div>

              {dayRows.length === 0 ? (
                <p className="text-muted-foreground">
                  Nothing was asked of them on this day.
                </p>
              ) : (
                <>
                  <ul className="flex flex-col divide-y divide-border border-y border-border">
                    {dayRows.map(({ row, cell }) => {
                      const inputId = `count-${row.taskId}`;
                      const loggedByName = cell.loggedBy
                        ? names[cell.loggedBy]
                        : undefined;
                      const met = cell.count >= cell.target;
                      return (
                        <li
                          key={row.taskId}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                        >
                          <label
                            htmlFor={editable ? inputId : undefined}
                            className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                          >
                            {row.label}
                            {loggedByName && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                · logged by {loggedByName}
                              </span>
                            )}
                          </label>
                          {editable ? (
                            <Input
                              id={inputId}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              disabled={saving}
                              value={draft[row.taskId] ?? ""}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  [row.taskId]: e.target.value,
                                }))
                              }
                              aria-label={`Count for ${row.label}`}
                              className="h-9 w-24 tabular-nums"
                            />
                          ) : (
                            <span className="font-display font-semibold text-foreground tabular-nums">
                              {cell.count.toLocaleString()}
                            </span>
                          )}
                          <span className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">
                            / {cell.target.toLocaleString()}
                            {met && (
                              <CheckIcon className="ml-1 inline size-3.5 text-success" />
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {editable && (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* One tap for the case this screen exists for: the admin
                          sat in a halaqah, the whole day is done. Fills and
                          SAVES — the old "Mark done" only filled the input, so
                          the common act still needed a second, findable tap. */}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={saving || dayComplete}
                        onClick={markDayDone}
                      >
                        {dayComplete ? "Day complete" : "Mark day done"}
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
                </>
              )}
              <InlineAlert>{error}</InlineAlert>
            </motion.div>
          ) : (
            <motion.p
              key="empty"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={easeBrand(DURATION.fast)}
              className="text-muted-foreground"
            >
              Tap any square to see that day
              {editable ? " — or to log it" : ""}.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Legend — colour always paired with a label (§5 colour-blind safety) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3.5 rounded-[3px] bg-muted ring-1 ring-progress-track ring-inset" />
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
