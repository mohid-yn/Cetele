"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useCelebration } from "@/components/app/celebration";
import { TapPad } from "@/components/app/tap-pad";
import { InlineAlert } from "@/components/app/inline-alert";
import { DayStrip, fmtLongDate } from "@/components/app/day-strip";
import { ArrowLeftIcon, MinusIcon } from "@/components/app/icons";
import { playComplete, playTen } from "@/lib/sound";
import { groupHref } from "@/lib/group-href";
import { useLocalToday } from "@/lib/use-local-today";
import { usePropState } from "@/lib/use-prop-state";
import { goalCap } from "@/lib/goals";
import { incrementCount, setTaskGoal } from "../../today/actions";
import { setCount } from "../../group/actions";

/**
 * The optimistic tap pad (M3) — optimistic in BOTH directions.
 *
 * Every user action (tap, +10, undo, exact edit) lands on screen at once and is
 * appended to a single serialized op queue; the server settles behind it. Two
 * op kinds share the queue: an `inc` (a positive delta → increment_count, the
 * one-directional count-integrity RPC) and a `set` (an absolute value →
 * set_count, the same exact-set the fortnight grid uses for D29 self-correct).
 *
 * The screen never renders a raw server number. The displayed count is always
 * `replay(confirmed, pendingOps)` — the last server-confirmed value with every
 * not-yet-acked op folded back on top — so nothing can dip: an earlier op's
 * reconcile can't erase a later op the user has already seen. That derived-value
 * rule is the whole reason a set can now be optimistic. Undo/edit used to hold
 * the pad through two sequential round-trips (settle-then-set) precisely because
 * an exact-set racing an in-flight increment is the count-dip family of bugs
 * this screen has paid for; the single FIFO queue makes that race impossible, so
 * the hold — and the pessimistic refetch after it — are gone.
 *
 * On success we reconcile from the action's own return (increment_count and
 * set_count both hand back the authoritative count — the D45 invariant: trust
 * the write, not a refetch). On a rejected op we drop it and replay the rest
 * over the last-confirmed baseline, which is server-consistent no matter what
 * else is queued.
 */

const FLUSH_MS = 600;

/** One queued write. `inc` is a batched positive delta; `set` an absolute value.
 *  `dispatched` guards tap-coalescing: once an op is handed to the runner, later
 *  taps start a fresh op instead of mutating one already in flight. */
type Op =
  | { kind: "inc"; date: string; delta: number; dispatched: boolean }
  | { kind: "set"; date: string; value: number; dispatched: boolean };

/** Fold a date's pending ops over its last-confirmed server value. */
function replay(base: number, ops: Op[]): number {
  return ops.reduce((x, o) => (o.kind === "inc" ? x + o.delta : o.value), base);
}

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
  /** `target` = the circle's share (what "done" means, and all the streak and
   *  rollup logic ever sees). `goal` = what I am aiming at — equal to `target`
   *  unless I raised it (D51). The ring runs to `goal`; the count cap, which is
   *  a server rule, stays on `target`. */
  task: {
    id: string;
    label: string;
    subtitle: string | null;
    target: number;
    goal: number;
  };
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
  const [editOpen, setEditOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [goalOpen, setGoalOpen] = React.useState(false);
  const [goalDraft, setGoalDraft] = React.useState("");
  const [savingGoal, setSavingGoal] = React.useState(false);
  // My bar for this task. Local so a raise applies at once (the ring is the
  // whole point of the control), re-seeded from the server when a refresh
  // brings a new value. Never below the circle's share — the RPC enforces that
  // and hands back the effective target, which is what we store.
  const [goal, setGoal] = usePropState(task.goal);
  const stretched = goal > task.target;
  // "This day's ring was ALREADY closed before the current tap" — the guard
  // that keeps the celebration rare. It must be seeded from the day's real
  // count, not from `false`: a ref that starts unclosed on every mount means
  // returning to a finished ring and tapping it re-fires the congratulations,
  // which is exactly how a reward stops meaning anything. Re-seeded whenever
  // the day being counted changes.
  const justCompleted = React.useRef((initialCounts[initialDate] ?? 0) >= goal);
  // The same guard for the circle's SHARE, which is a separate transition once
  // the two numbers differ: reaching it is the moment that feeds the day and
  // the streak, so it cannot go unmarked just because the ring keeps going.
  const shareMarked = React.useRef(
    (initialCounts[initialDate] ?? 0) >= task.target,
  );

  // The DISPLAYED count per date, mirrored in a ref so it can be read
  // synchronously — an action (undo = "what I see, minus one") has to know the
  // on-screen number the instant it fires, before React has re-rendered.
  // Always kept equal to replay(confirmed, pending ops); see `recompute`.
  const countsRef = React.useRef(initialCounts);
  const ringClosed = React.useCallback(
    (d: string) => (countsRef.current[d] ?? 0) >= goal,
    [goal],
  );
  const shareDone = React.useCallback(
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
      shareMarked.current = shareDone(now);
      return now;
    });
    router.refresh();
  });
  const isToday = date === todayISO;

  const count = counts[date] ?? 0;
  const remaining = Math.max(0, goal - count);

  // -- the serialized op queue ------------------------------------------------
  // The last server-CONFIRMED count per date (as of the most recently resolved
  // op) and the ops still awaiting the server, in order. The display is derived:
  // replay(confirmed, still-pending ops). Both are refs — the queue runner reads
  // and rewrites them synchronously as each op resolves.
  const confirmed = React.useRef<Record<string, number>>({ ...initialCounts });
  const queue = React.useRef<Op[]>([]);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = React.useRef<Promise<void>>(Promise.resolve());

  // Recompute a date's displayed count from its confirmed baseline + pending
  // ops. This is the ONLY writer of the displayed count, so the screen can never
  // show a bare server number that lags the user's own not-yet-acked actions.
  const recompute = React.useCallback(
    (d: string) => {
      const base = confirmed.current[d] ?? 0;
      const ops = queue.current.filter((o) => o.date === d);
      applyCounts((c) => ({ ...c, [d]: replay(base, ops) }));
    },
    [applyCounts],
  );

  // Run one op against the server, then reconcile. On success the return is the
  // authoritative count for that op's point in the sequence (D45: trust the
  // write) → it becomes the new confirmed baseline, and any ops queued AFTER it
  // replay over that. On rejection we drop the op and replay the rest over the
  // untouched baseline — server-consistent whatever else is queued.
  const runOp = React.useCallback(
    async (op: Op) => {
      let res: { count: number | null; error: string | null } | undefined;
      try {
        res =
          op.kind === "inc"
            ? await incrementCount(groupId, task.id, op.date, op.delta)
            : await setCount(groupId, userId, task.id, op.date, op.value);
      } catch {
        res = { count: null, error: "Couldn't save — try again" };
      }
      queue.current = queue.current.filter((o) => o !== op);
      // `res` is undefined when the action redirected (stale session) — the
      // navigation is already happening; leave state untouched.
      if (!res) return;
      if (res.error || res.count == null) {
        setError(res.error ?? "Couldn't save — try again");
        recompute(op.date); // drop this op's optimistic effect
        return;
      }
      confirmed.current[op.date] = res.count;
      recompute(op.date);
    },
    [groupId, userId, task.id, recompute],
  );

  // Hand every not-yet-dispatched op to the serialized runner, in order, so a
  // slow call can't be overtaken by the next. A `set` calls this immediately
  // (which also seals any taps still coalescing ahead of it); taps let it fire
  // on the debounce. Returns the tail of the chain for callers that must let a
  // write land before they navigate away.
  const dispatch = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // Ops are treated as immutable (React Compiler): re-flag by rebuilding the
    // array, and chain the NEW objects — runOp removes by identity, so those are
    // the ones that must sit in the queue.
    const toRun: Op[] = [];
    queue.current = queue.current.map((op) => {
      if (op.dispatched) return op;
      const dispatched = { ...op, dispatched: true };
      toRun.push(dispatched);
      return dispatched;
    });
    for (const op of toRun) {
      inflight.current = inflight.current.then(() => runOp(op));
    }
    return inflight.current;
  }, [runOp]);

  // Append a positive delta (a tap, +10, Mark done). Consecutive taps on the
  // same day coalesce into the tail op while it is still un-dispatched, so a
  // hundred taps become one increment_count — the debounce that has always kept
  // the RPC quiet. Once an op is in flight, the next tap starts a fresh one.
  const enqueueInc = React.useCallback(
    (delta: number) => {
      setError(null);
      const tail = queue.current[queue.current.length - 1];
      if (
        tail &&
        tail.kind === "inc" &&
        tail.date === date &&
        !tail.dispatched
      ) {
        // coalesce into the still-open tail — rebuilt, not mutated in place
        queue.current = [
          ...queue.current.slice(0, -1),
          { ...tail, delta: tail.delta + delta },
        ];
      } else {
        queue.current = [
          ...queue.current,
          { kind: "inc", date, delta, dispatched: false },
        ];
      }
      recompute(date);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void dispatch(), FLUSH_MS);
    },
    [date, recompute, dispatch],
  );

  // The day's two thresholds, in one place so the tap path and the correction
  // path can never disagree about what has been crossed.
  //
  // With no personal goal there is ONE moment and it behaves exactly as it
  // always has. Once a member raises their bar (D51) there are two, and both
  // are real transitions, not states — the invariant only forbids celebrating
  // a state:
  //
  //   the circle's SHARE — the number that actually feeds the day, the streak
  //     and the rollup. Marked quietly (confetti, no card): it must not go
  //     unmarked simply because this member is carrying on past it.
  //   my GOAL — the ring closing. The full celebration, where it has always
  //     been. Reaching it implies the share, so a single jump past both fires
  //     the loud one only.
  const syncMilestones = React.useCallback(
    (next: number) => {
      const closing = next >= goal && !justCompleted.current;
      if (next < task.target) shareMarked.current = false;
      else if (!shareMarked.current) {
        shareMarked.current = true;
        // Suppressed when the goal is closing in the same breath, and when
        // there is no stretch at all (the two thresholds are the same number).
        if (stretched && !closing) {
          if (sound) playComplete();
          celebrate({ confettiOnly: true });
        }
      }
      if (next < goal) justCompleted.current = false;
      else if (closing) {
        justCompleted.current = true;
        if (sound) playComplete();
        celebrate({ title: "Ring closed!" });
      }
    },
    [goal, task.target, stretched, sound, celebrate],
  );

  // Set the day to an exact number (undo a stray tap, or fix it outright).
  // Optimistic like a tap: the number changes at once and the set rides the same
  // FIFO queue behind any taps ahead of it — so it can neither clobber nor be
  // clobbered by an in-flight increment, which is the whole reason this used to
  // hold the pad. `compute` is fed the on-screen count (undo = that minus one).
  const commitSet = React.useCallback(
    (compute: (current: number) => number) => {
      const d = date;
      const current = countsRef.current[d] ?? 0;
      const value = Math.max(0, Math.round(compute(current)));
      if (value === current) return;
      setError(null);
      queue.current = [
        ...queue.current,
        { kind: "set", date: d, value, dispatched: false },
      ];
      recompute(d);
      // A correction that lands ON a threshold crosses it just as truly as a
      // tap did, and dropping back below one re-arms it — so closing the ring
      // again still feels like closing it.
      syncMilestones(value);
      void dispatch();
    },
    [date, recompute, dispatch, syncMilestones],
  );

  // best-effort dispatch when the screen unmounts mid-debounce
  React.useEffect(() => {
    const d = dispatch;
    return () => {
      void d();
    };
  }, [dispatch]);

  // ---------------------------------------------------------------------------

  // Manual taps count one at a time, uncapped (you may go past the goal).
  const handleTap = () => {
    enqueueInc(1);
    syncMilestones(countsRef.current[date] ?? 0);
  };

  // The convenience buttons snap *to* the goal — never past it.
  const addCapped = (n: number) => {
    const step = Math.min(n, remaining);
    if (step <= 0) return;
    enqueueInc(step);
    syncMilestones(countsRef.current[date] ?? 0);
  };

  // Raising the bar re-opens a ring that was closed at the old number, so the
  // guards must follow it — otherwise closing the NEW ring would pass unmarked
  // (the ref would still say "already celebrated"). Reconciled from the RPC's
  // own return (D45), which is the effective target: the group's own number
  // when the member drops back to the circle's share.
  //
  // AWAITED, unlike everything else on this screen. The tap loop is optimistic
  // because a tap is one of hundreds and a round-trip you can feel would ruin
  // it; a goal is a deliberate once-in-a-while decision, and firing it off
  // un-awaited loses a real race — leave for Today the instant the dialog
  // closes and the read can arrive BEFORE the write, so the rings come back
  // rendered against the old number with nothing on the way to correct them.
  // Holding the dialog for one round-trip is the honest version, and it is
  // also the only way a refusal can be shown where it can be read.
  const commitGoal = async (next: number | null): Promise<boolean> => {
    setError(null);
    setSavingGoal(true);
    try {
      const res = await setTaskGoal(groupId, task.id, next);
      if (!res) return false; // the action redirected (stale session)
      if (res.error || res.goal == null) {
        setError(res.error ?? "Couldn't save your goal — try again");
        return false;
      }
      setGoal(res.goal);
      const current = countsRef.current[date] ?? 0;
      justCompleted.current = current >= res.goal;
      shareMarked.current = current >= task.target;
      return true;
    } finally {
      setSavingGoal(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col px-5 pt-5 pb-8">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<ArrowLeftIcon />}
          onClick={() => router.push(groupHref(groupId, "/today"))}
        >
          Today
        </Button>
        {/* Desktop only. On a phone the tap sound is controlled by the hardware
            volume/mute — the natural gesture there — so an in-app toggle is
            redundant. It stays for desktop, where there's no per-tab hardware
            mute. Hidden below `lg`, the same phone/desktop line the nav uses
            (bottom-nav is `lg:hidden`; this is its inverse). Sound still
            defaults on; a phone user just mutes with the volume keys. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSound((s) => !s)}
          className="hidden lg:inline-flex"
        >
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
        isDone={(d) => (counts[d] ?? 0) >= goal}
        onChange={(d) => {
          // switching to a day that's already finished must not re-arm the
          // celebration for it
          justCompleted.current = ringClosed(d);
          shareMarked.current = shareDone(d);
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
      <InlineAlert className="mt-2 text-center">{error}</InlineAlert>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-2">
        <TapPad
          value={count}
          max={goal}
          // The circle's share, notched on the arc, but only when it is a
          // different number from the goal. A raised bar otherwise HIDES the
          // one threshold that feeds the streak: at 100 of 300 the ring looks
          // a third done while the day is, in fact, complete.
          mark={stretched ? task.target : undefined}
          sound={sound}
          onTap={handleTap}
        />
        {stretched && (
          <p className="-mt-2 text-center text-xs text-muted-foreground">
            Your goal. The circle asks{" "}
            <span className="font-medium text-foreground tabular-nums">
              {task.target.toLocaleString()}
            </span>
            {count >= task.target && (
              <span className="text-success"> — done, the rest is yours</span>
            )}
          </p>
        )}

        {/* Corrections read as ONE recessive tray, not two floating buttons:
            a soft pill on the muted tint, hairline-divided, muted label. Gold
            is spent on the primary action below and the ring owns the screen —
            an undo must be findable without competing with either. Segments are
            44px so they stay thumb-sized on a phone at any viewport. Undo is
            optimistic like a tap now — no hold, the number just drops. */}
        <div className="inline-flex items-center overflow-hidden rounded-full border border-border bg-card shadow-sm">
          {count > 0 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Undo one count"
                className="rounded-none text-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => commitSet((c) => c - 1)}
              >
                <MinusIcon />
              </Button>
              <span aria-hidden className="h-6 w-px bg-border" />
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-11 rounded-none px-5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              setDraft(String(count));
              setEditOpen(true);
            }}
          >
            Edit count
          </Button>
          <span aria-hidden className="h-6 w-px bg-border" />
          {/* Third segment of the same recessive tray, not a fourth control
              floating somewhere else: raising your bar is a correction to the
              screen's premise, and it belongs in the same language as fixing
              the number. Still muted — the ring and the gold action below own
              the screen. */}
          <Button
            variant="ghost"
            size="sm"
            className="h-11 rounded-none px-5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              setGoalDraft(String(goal));
              setGoalOpen(true);
            }}
          >
            {stretched ? "My goal" : "Set my goal"}
          </Button>
        </div>
      </div>

      {/* The action bar is PINNED to the foot of the scroll region. A 260px
          ring plus a 14-day strip cannot fit a 667px phone alongside it, and
          the one thing that must never fall below the fold is the primary
          action. Sticky costs nothing when the screen already fits. */}
      <div className="sticky bottom-0 -mx-5 mt-2 bg-background px-5 pt-2">
        {remaining === 0 ? (
          // Ring already closed — just a way back.
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              void dispatch().then(() =>
                router.push(groupHref(groupId, "/today")),
              );
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
                void dispatch();
              }}
            >
              Mark done
            </Button>
          </div>
        )}
      </div>

      {/* Exact entry — a number, not a slider: the targets here run into the
          hundreds, so a drag can't land on the value you actually counted. */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit count"
        description={`${task.label} · ${isToday ? "today" : fmtLongDate(date)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={draft.trim() === ""}
              onClick={() => {
                const value = Number(draft);
                if (!Number.isFinite(value)) return;
                // Validate the RPC's sanity cap here (mirrors set_count, D36a) so
                // an out-of-range number is refused synchronously — the write is
                // optimistic, so there is no round-trip to catch it after the
                // dialog closes. In-range: commit and close at once.
                const v = Math.max(0, Math.round(value));
                // The COUNT cap is a server rule keyed to the GROUP target
                // (D36a) — a personal goal doesn't move it, so this must not
                // read `goal` or the dialog would accept what set_count then
                // refuses, after the optimistic write is already on screen.
                const cap = goalCap(task.target);
                if (v > cap) {
                  setError(
                    `Enter a number between 0 and ${cap.toLocaleString()}.`,
                  );
                  return;
                }
                commitSet(() => v);
                setEditOpen(false);
              }}
            >
              Save
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
          Target {goal.toLocaleString()}. Setting a lower number never shortens
          a streak you already earned.
        </p>
        {/* A refusal (out of range, outside the 14-day window) has to be read
            here — the page-level alert is behind the backdrop. */}
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}
      </Dialog>

      {/* My own bar (D51). Deliberately framed as aiming HIGHER, never as
          changing what the circle asked: the floor is the group's target, and
          the way back down is a button rather than a number you have to guess. */}
      <Dialog
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        title="My goal"
        description={`${task.label} · every day`}
        footer={
          <>
            {stretched && (
              <Button
                variant="ghost"
                disabled={savingGoal}
                onClick={() => {
                  void commitGoal(null).then((ok) => ok && setGoalOpen(false));
                }}
              >
                Back to the circle&rsquo;s
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={savingGoal}
              onClick={() => setGoalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={goalDraft.trim() === "" || savingGoal}
              onClick={() => {
                const value = Number(goalDraft);
                if (!Number.isFinite(value)) return;
                const v = Math.max(0, Math.round(value));
                // Mirrors set_task_goal's cap so an impossible number is
                // refused here, before the dialog closes on it.
                if (v > goalCap(task.target)) {
                  setError(
                    `Choose a goal between ${task.target.toLocaleString()} and ${goalCap(
                      task.target,
                    ).toLocaleString()}.`,
                  );
                  return;
                }
                // Closed only once the write has landed — see commitGoal.
                void commitGoal(v).then((ok) => ok && setGoalOpen(false));
              }}
            >
              {savingGoal ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <Input
          type="number"
          inputMode="numeric"
          min={task.target}
          autoFocus
          value={goalDraft}
          onChange={(e) => setGoalDraft(e.target.value)}
          aria-label={`My daily goal for ${task.label}`}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Your circle&rsquo;s share is{" "}
          <span className="font-medium text-foreground tabular-nums">
            {task.target.toLocaleString()}
          </span>
          . You can aim higher — anything lower just puts you back on the
          circle&rsquo;s number.
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Your streak, your consistency and the circle&rsquo;s total all still
          count from {task.target.toLocaleString()}. Aiming higher can only ever
          add to them.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}
      </Dialog>
    </div>
  );
}
