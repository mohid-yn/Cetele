"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { DURATION, easeBrand } from "@/lib/motion";
import {
  Avatar,
  Button,
  Eyebrow,
  Grid,
  ProgressBar,
  ProgressRing,
  Screen,
  buttonVariants,
  cardVariants,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import { StreakChip } from "@/components/app/streak-chip";
import { DayStrip, fmtLongDate } from "@/components/app/day-strip";
import {
  CheckIcon,
  ChevronRightIcon,
  TargetIcon,
} from "@/components/app/icons";
import { groupHref } from "@/lib/group-href";
import { useLocalToday } from "@/lib/use-local-today";
import { usePropState } from "@/lib/use-prop-state";
import { GoalsDialog } from "./goals-dialog";
import { isDueOn, daysUntilDue, dueLabel, frequencyLabel } from "@/lib/goals";
import type { Landmark } from "@/lib/retention";
import {
  PeerReactions,
  type ReactionTally,
} from "@/components/app/peer-reactions";
import { FreshStartBanner } from "@/components/app/fresh-start";
import { WelcomeCard } from "@/components/app/welcome-card";

/**
 * Client leaf for the server-first Today (M3 + the v2 retention layer). Layout
 * and copy mirror the mock screen; data arrives as props. Today now carries
 * three of the six v2 surfaces: the fresh-start banner (CET-19), the endowed-
 * progress welcome (CET-21), and one-tap peer reactions on a finished peer
 * (CET-18).
 */

export type TodayTask = {
  id: string;
  label: string;
  subtitle: string | null;
  /** The circle's share — what "done" means for the day, the streak and every
   *  rollup. Never replaced by the personal goal. */
  target: number;
  /** What I am aiming at (D51). Equal to `target` unless I raised it. */
  goal: number;
  /** The circle's cycle in days (0021). 1 = daily. */
  frequencyDays: number;
  /** My own denser cycle, if I set one. */
  myFrequencyDays: number | null;
  /** The day the cycle counts from (`tasks.created_at`). */
  createdOn: string;
};

export type CircleMember = {
  userId: string;
  name: string;
  closed: number;
  total: number;
  isMe: boolean;
  /** Every ring closed — the trigger for a reaction row. */
  done: boolean;
  tally: ReactionTally;
};

export function TodayClient({
  groupId,
  groupName,
  firstName,
  timeZone,
  todayISO: serverTodayISO,
  streak,
  tasks,
  counts,
  circle,
  collectivePct,
  cheersForMe,
  landmark,
  welcome,
}: {
  groupId: string;
  groupName: string;
  firstName: string;
  /** The member's day boundary (profiles.timezone, D34). */
  timeZone: string;
  todayISO: string;
  streak: number;
  tasks: TodayTask[];
  /** date → taskId → my count (last 14 days) */
  counts: Record<string, Record<string, number>>;
  circle: CircleMember[];
  collectivePct: number;
  /** Encouragements I've received today (CET-18). */
  cheersForMe: number;
  /** A fresh-start landmark to surface, if any (CET-19). */
  landmark: Landmark | null;
  /** Day-one endowed-progress welcome (CET-21). */
  welcome: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = React.useState(serverTodayISO);
  // Track the member's REAL local today across their midnight (a PWA is exactly
  // the app left open overnight): when the day flips, follow it if they were on
  // "today" and refresh so rings/circle re-read the new day's server data.
  const todayISO = useLocalToday(timeZone, serverTodayISO, (next, prev) => {
    setDate((d) => (d === prev ? next : d));
    router.refresh();
  });
  const isToday = date === todayISO;

  // My own bar per task (D51), held locally so a save from the goals dialog
  // re-renders the rings from the WRITE's own return rather than a refetch
  // (D45). Re-seeds whenever the server sends new tasks — usePropState compares
  // identity, and the memo gives a fresh object exactly when `tasks` changes.
  const [goalsOpen, setGoalsOpen] = React.useState(false);
  const goalSeed = React.useMemo(
    () => Object.fromEntries(tasks.map((t) => [t.id, t.goal])),
    [tasks],
  );
  const [goalById, setGoalById] =
    usePropState<Record<string, number>>(goalSeed);
  const goalOf = (t: TodayTask) => goalById[t.id] ?? t.goal;
  // Same shape for the member's own cycle (0021): reconciled from the write,
  // so a saved frequency re-renders the rings without a refetch (D45). The
  // server's effective value comes back, so a CLEAR returns the circle's own.
  const freqSeed = React.useMemo(
    () =>
      Object.fromEntries(
        tasks.map((t) => [t.id, t.myFrequencyDays ?? t.frequencyDays]),
      ),
    [tasks],
  );
  const [freqById, setFreqById] =
    usePropState<Record<string, number>>(freqSeed);

  const countOn = (taskId: string, d: string) => counts[d]?.[taskId] ?? 0;
  // The day-strip's done-marks mirror a SERVER fact — the day the streak and
  // the rollup counted — so they key on the circle's share, never on a
  // personal goal (D51). A member aiming higher must not see yesterday go
  // unmarked while their streak says they kept it.
  // Mirrors private.is_day_complete: only what was DUE that day counts, and a
  // day owing nothing is not a day kept (it is skipped, never ticked).
  const dayFull = (d: string) => {
    const owed = tasks.filter((t) =>
      isDueOn(
        {
          frequencyDays: t.frequencyDays,
          myFrequencyDays: t.myFrequencyDays,
          createdOn: t.createdOn,
        },
        d,
      ),
    );
    return owed.length > 0 && owed.every((t) => countOn(t.id, d) >= t.target);
  };

  const rings = tasks.map((t) => {
    const count = countOn(t.id, date);
    // `done` = my ring is closed (my goal). `shareDone` = I have done what the
    // circle asked, which is the threshold everything shared is measured at.
    // With no personal goal the two are the same number and nothing changes.
    const goal = goalOf(t);
    const sched = {
      frequencyDays: t.frequencyDays,
      myFrequencyDays: freqById[t.id] ?? t.myFrequencyDays,
      createdOn: t.createdOn,
    };
    // A task not due on the selected day is still SHOWN — hiding it would make
    // a circle whose tasks are all on cycles look empty and broken. It is
    // marked instead, with the one fact that answers "why isn't this counting":
    // how long until it comes round.
    //
    // A day BEFORE the task existed is offered NORMALLY, not marked as resting.
    // Two reasons, and the first is a bug the second only reads badly: the
    // day-strip exists to repair the past (D8/D48) and the engine credits a
    // COMPLETED log on such a day, so marking it resting removes the repair
    // affordance for every task in a brand-new circle. And the copy would be
    // incoherent anyway — "due tomorrow" printed against last Tuesday.
    const due = isDueOn(sched, date) || date < t.createdOn;
    return {
      task: t,
      count,
      goal,
      due,
      daysAway: due ? 0 : daysUntilDue(sched, date),
      done: count >= goal,
      shareDone: count >= t.target,
      stretched: goal > t.target,
    };
  });
  // Everything the headline and the CTA reason about is scoped to what is
  // actually DUE — a task that has not come round is not an unfinished ring,
  // and counting it as one would make an ordinary day read as a failing one.
  const dueRings = rings.filter((r) => r.due);
  const closed = dueRings.filter((r) => r.done).length;
  const left = dueRings.length - closed;
  const sharesLeft = dueRings.filter((r) => !r.shareDone).length;

  // Abstraction (GLANCE): one human headline that leads with the unfinished.
  // The middle case exists because the two thresholds can disagree: a member
  // who has done the circle's share but is still climbing their own goal must
  // be told they are done in the way that counts BEFORE being told what's
  // left, or a raised goal reads as a day they failed to finish.
  const glance =
    rings.length === 0
      ? "No tasks yet"
      : dueRings.length === 0
        ? `Nothing due${isToday ? " today" : ""} — rest is part of it`
        : left === 0
          ? `All rings closed${isToday ? " today" : ""} — mashaAllah 🎉`
          : sharesLeft === 0
            ? `Your circle's share is done — ${left} ring${left === 1 ? "" : "s"} left on your own goal`
            : closed === 0
              ? "A fresh page — start with one ring"
              : `${left} ring${left === 1 ? "" : "s"} to close — you're almost there`;

  // One primary action (goal-gradient): continue the ring closest to done.
  const next = dueRings
    .filter((r) => !r.done)
    .sort((a, b) => b.count / b.goal - a.count / a.goal)[0];

  // Where a banner's "Begin today" sends you: the nearest-to-done ring, else the
  // first task. Null when the circle has no tasks yet (nothing to begin).
  const beginTask = next?.task ?? dueRings[0]?.task ?? tasks[0];
  const beginHref = beginTask
    ? groupHref(groupId, `/count/${beginTask.id}`)
    : null;

  return (
    <Screen>
      <PageHeader
        title={
          <div>
            <p className="text-sm text-muted-foreground">Assalamu alaykum,</p>
            <h1 className="font-display text-2xl font-bold text-foreground">
              {firstName}
            </h1>
            {/* The date is the member's OWN today (useLocalToday, D34) — not the
                selected day, which the day-strip note below already names. */}
            <Eyebrow className="mt-0.5">{fmtLongDate(todayISO)}</Eyebrow>
          </div>
        }
        subtitle={<span className="font-medium text-foreground">{glance}</span>}
        action={<StreakChip current={streak} />}
      />

      {/* Day one (CET-21) or a fresh start (CET-19) — never both, and only on
          today: back-filling an old day is not a moment to re-onboard someone.
          These mount and unmount conditionally, so they ease rather than pop. */}
      <AnimatePresence initial={false}>
        {isToday && welcome && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={easeBrand(DURATION.base)}
          >
            <WelcomeCard
              groupName={groupName}
              collectivePct={collectivePct}
              beginHref={beginHref}
            />
          </motion.div>
        )}
        {isToday && !welcome && landmark && (
          <motion.div
            key="fresh-start"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={easeBrand(DURATION.base)}
          >
            <FreshStartBanner landmark={landmark} beginHref={beginHref} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Day picker — log for today, or back-fill a day that's gone by (D8). */}
      <div>
        <DayStrip
          value={date}
          onChange={setDate}
          today={todayISO}
          isDone={dayFull}
        />
        {!isToday && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Catching up on{" "}
            <span className="font-medium text-foreground">
              {fmtLongDate(date)}
            </span>{" "}
            ·{" "}
            <button
              type="button"
              onClick={() => setDate(todayISO)}
              className="font-medium text-primary underline"
            >
              back to today
            </button>
          </p>
        )}
      </div>

      {/* Primary action — one gold CTA, the nearest-to-done ring */}
      {next && (
        <Link
          href={`${groupHref(groupId, `/count/${next.task.id}`)}${isToday ? "" : `?date=${date}`}`}
          className={buttonVariants({ variant: "accent", className: "w-full" })}
        >
          Continue {next.task.label} ·{" "}
          {/* The ring this points at is measured against MY goal, so the CTA
              must be too — otherwise the one unfinished ring is advertised as
              "100/100", which reads as already done and makes the gold action
              look like a mistake. */}
          <span className="tabular-nums">
            {next.count}/{next.goal}
          </span>
        </Link>
      )}

      {/* Rings */}
      <section>
        {/* The goals entry point lives HERE, on the heading of the rings it
            governs, rather than in the count screen's correction tray where it
            shipped first: raising your bar is an aspiration, not a fix, and a
            muted control two screens deep was one the owner could not find
            while actively looking for it. `outline` and not `accent` — the gold
            CTA above is the one primary action per view — but a real bordered
            button, because "findable" is the whole point of moving it.
            Hidden with no tasks: there is nothing to aim at yet. */}
        <SectionHeading
          action={
            // `undefined`, not `&&`: SectionHeading renders its slot whenever
            // `action != null`, and `false` passes that test — a no-task circle
            // would get an empty action div.
            tasks.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                leadingIcon={<TargetIcon />}
                onClick={() => setGoalsOpen(true)}
              >
                My goals
              </Button>
            ) : undefined
          }
        >
          {isToday ? "Your rings today" : "Your rings"}
        </SectionHeading>
        <Grid as="ul" cols="cards" gap="md">
          {rings.map(
            ({
              task: t,
              count,
              goal,
              due,
              daysAway,
              done,
              shareDone,
              stretched,
            }) => {
              // NO card is singled out. One used to carry an emerald glow — the
              // ring nearest done — on a goal-gradient argument. Removed on the
              // owner's call, and the reason is the product, not the styling:
              // **the tasks in a cetele have no order.** Dressing one up as the
              // next one implies a sequence that does not exist, and the member
              // decides what to reach for. Every ring is offered equally; the
              // rings themselves already show where the progress is.
              return (
                <li key={t.id}>
                  {/* A resting task keeps its full card and stays tappable —
                    counting ahead is welcome, and the engine only claims a day
                    once you COMPLETE it, so nothing is risked by starting
                    early. It is marked by a dashed edge and a muted surface
                    (structure, not colour: the intensity ramp stays reserved
                    for progress) plus the one fact that answers "why is this
                    not counting" — when it next comes round. */}
                  <Link
                    href={`${groupHref(groupId, `/count/${t.id}`)}${isToday ? "" : `?date=${date}`}`}
                    className={cn(
                      cardVariants({ padding: "compact" }),
                      "flex items-center gap-4 transition-[box-shadow,transform] duration-[var(--duration-base)] hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-md motion-reduce:transform-none",
                      !due && "border-dashed bg-muted/40 shadow-none",
                    )}
                  >
                    <ProgressRing
                      value={due ? count : 0}
                      max={goal}
                      mark={due && stretched ? t.target : undefined}
                      size={72}
                      thickness={8}
                    >
                      {!due ? (
                        // Its own number, not a percentage: a resting ring has no
                        // progress to report and "0%" would read as a failure.
                        <span className="text-sm font-bold text-muted-foreground tabular-nums">
                          {daysAway}d
                        </span>
                      ) : done ? (
                        <CheckIcon className="size-6 text-success" />
                      ) : (
                        // Success-toned once the circle's share is in: the
                        // number is still short of MY goal, but the part that
                        // the circle and the streak are counting is finished,
                        // and a plain foreground percent would read as neither.
                        <span
                          className={cn(
                            "text-sm font-bold tabular-nums",
                            shareDone ? "text-success" : "text-foreground",
                          )}
                        >
                          {Math.round((count / goal) * 100)}%
                        </span>
                      )}
                    </ProgressRing>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-base font-semibold text-foreground">
                        {t.label}
                      </p>
                      {/* Not truncated: the bigger ring left ~192px here and
                        "Allahumma salli ala Muhammad" needs 203, so it clipped
                        to "…humma salli ala Muhammad" — and with dir="rtl" the
                        ellipsis lands at the START of the phrase. Clipping the
                        front off a salawat is not a tradeoff worth making for
                        one line of height; let it wrap. */}
                      {t.subtitle && (
                        <p
                          className="text-sm text-muted-foreground"
                          dir="rtl"
                          lang="ar"
                        >
                          {t.subtitle}
                        </p>
                      )}
                      {due ? (
                        <>
                          <ProgressBar
                            value={count}
                            max={goal}
                            tone={done || shareDone ? "success" : "primary"}
                            className="mt-2 h-1.5"
                          />
                          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                            {count.toLocaleString()} / {goal.toLocaleString()}
                            {stretched && (
                              <span className="ms-1.5 tabular-nums">
                                · circle&rsquo;s share{" "}
                                {t.target.toLocaleString()}
                              </span>
                            )}
                          </p>
                        </>
                      ) : (
                        // No bar at all. An empty progress bar on a task that was
                        // never asked for today reads as "you are behind"; the
                        // schedule is the fact here, not the absent progress.
                        <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                          {dueLabel(daysAway)}
                          <span className="ms-1.5 font-normal">
                            ·{" "}
                            {frequencyLabel(
                              t.myFrequencyDays ?? t.frequencyDays,
                            ).toLowerCase()}
                          </span>
                        </p>
                      )}
                    </div>
                    <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            },
          )}
          {rings.length === 0 && (
            <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No tasks yet — the group&rsquo;s admin sets the shared list under{" "}
              <Link
                href={groupHref(groupId, "/group/manage")}
                className="font-medium text-primary underline"
              >
                Manage
              </Link>
              .
            </li>
          )}
        </Grid>
        {isToday && tasks.length > 0 && (
          <p className="mt-2.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-success align-middle"
            />
            Your circle is{" "}
            <span className="font-medium text-foreground tabular-nums">
              {collectivePct}%
            </span>{" "}
            toward today&apos;s goal.
          </p>
        )}
      </section>

      {/* Your circle today — the accountability glance, now with the one-tap
          encouragement (CET-18) under anyone who has closed every ring. */}
      {circle.length > 1 && (
        <section>
          <SectionHeading
            action={
              cheersForMe > 0
                ? `you received ${cheersForMe} today 🤲`
                : undefined
            }
          >
            Your circle today
          </SectionHeading>
          <ul className="flex flex-col gap-1.5">
            {circle.map((m) => (
              <li
                key={m.userId}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm"
              >
                {/* Flat by design: these rows don't navigate, so they get no
                    hover lift (§B.5 — a lift implies a click that isn't there). */}
                <div className="flex items-center gap-3">
                  <Avatar size="sm" name={m.name} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {m.name}
                      {m.isMe && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </span>
                    <ProgressBar
                      value={m.closed}
                      max={m.total || 1}
                      tone={m.done ? "success" : "primary"}
                      className="mt-1.5 h-1.5"
                    />
                  </div>
                  {m.done ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-success">
                      <CheckIcon className="size-4" /> all rings closed
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {m.closed}/{m.total} rings
                    </span>
                  )}
                </div>
                {/* You cheer a peer who finished — never yourself (the RPC
                    refuses a self-reaction; don't offer the affordance). */}
                {m.done && !m.isMe && (
                  <div className="mt-2">
                    <PeerReactions
                      groupId={groupId}
                      toUserId={m.userId}
                      toName={m.name}
                      tally={m.tally}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Every goal in THIS circle, edited together (D51). Reconciles from each
          write's own return — the effective target after the raise-only rule
          has been applied server-side — so a value at or below the circle's
          share visibly snaps back to the circle's number instead of silently
          doing nothing. */}
      <GoalsDialog
        open={goalsOpen}
        onClose={() => setGoalsOpen(false)}
        groupId={groupId}
        groupName={groupName}
        tasks={tasks.map((t) => ({
          id: t.id,
          label: t.label,
          target: t.target,
          goal: goalOf(t),
          frequencyDays: t.frequencyDays,
          myFrequencyDays: freqById[t.id] ?? t.myFrequencyDays,
        }))}
        onSaved={(saved) => setGoalById((g) => ({ ...g, ...saved }))}
        onFrequencySaved={(saved) => setFreqById((f) => ({ ...f, ...saved }))}
      />
    </Screen>
  );
}
