"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { DURATION, EASE_BRAND } from "@/lib/motion";
import {
  Button,
  ConfirmDialog,
  Dialog,
  ProgressBar,
  Screen,
  Stack,
  buttonVariants,
  cardVariants,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import { GroupGarden } from "@/components/app/group-garden";
import { PairGoal, type Pair } from "@/components/app/pair-goal";
import type { Garden } from "@/lib/retention";
import { MemberRow } from "@/components/app/member-row";
import { Segmented } from "@/components/app/segmented";
import {
  MemberBreakdownDialog,
  type BreakdownMember,
} from "@/components/app/member-breakdown";
import { GroupSwitcher } from "@/components/app/group-switcher";
import { SteadfastnessBoard } from "@/components/app/steadfastness-board";
import { groupHref } from "@/lib/group-href";
import { useAction } from "@/lib/use-action";
import {
  CheckIcon,
  ChevronRightIcon,
  GridIcon,
  SettingsIcon,
} from "@/components/app/icons";
import { logForGroup, leaveGroup } from "./actions";

type Role = "owner" | "admin" | "member";
type Tab = "overview" | "standings" | "members";
const MEDALS = ["🥇", "🥈", "🥉"];

/** Crossfade for the in-place tab panels (no route change → the page transition
 *  doesn't cover this; a quick fade keeps switching Overview/Standings/Members
 *  from being a hard cut). */
const panel = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: DURATION.base, ease: EASE_BRAND },
} as const;

export type GroupTask = { id: string; label: string; target: number };
export type TaskTotal = {
  taskId: string;
  label: string;
  total: number;
  goal: number;
};
export type Contribution = {
  userId: string;
  name: string;
  role: Role;
  today: number;
  isMe: boolean;
};
export type Standing = {
  userId: string;
  name: string;
  isMe: boolean;
  daysActive: number;
  total: number;
};
export type Steadfast = {
  userId: string;
  name: string;
  isMe: boolean;
  pct: number;
  measuredDays: number;
  eligible: boolean;
  meetsBar: boolean;
};

export function GroupClient({
  groupId,
  groupName,
  memberCount,
  canManage,
  days,
  tasks,
  taskTotals,
  contributions,
  standings,
  breakdowns,
  groupConsistency90,
  steadfastness,
  steadfastBar,
  names,
  viewerId,
  garden,
  pair,
}: {
  groupId: string;
  groupName: string;
  memberCount: number;
  canManage: boolean;
  days: number;
  tasks: GroupTask[];
  taskTotals: TaskTotal[];
  contributions: Contribution[];
  standings: Standing[];
  /** Per-member fortnight breakdown, admin-only ({} otherwise). */
  breakdowns: Record<string, BreakdownMember>;
  /** The group's 90-day collective consistency (North Star, PRD §9). */
  groupConsistency90: number;
  /** Admin-only steadfastness board ([] for plain members). */
  steadfastness: Steadfast[];
  steadfastBar: number;
  names: Record<string, string>;
  viewerId: string;
  /** The collective living artefact (CET-17) — derived, stores nothing. */
  garden: Garden;
  /** This week's winnable pair goal (CET-22); null in a circle of one, or for
   *  the member sitting out this week in an odd-sized circle. */
  pair: Pair | null;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("overview");
  const [breakdownUserId, setBreakdownUserId] = React.useState<string | null>(
    null,
  );
  const [groupLogOpen, setGroupLogOpen] = React.useState(false);
  const [logging, setLogging] = React.useState<string | null>(null);
  const [logError, setLogError] = React.useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const leaveAct = useAction();

  // My own role in this circle — an owner can't leave (they must transfer or
  // delete first), so the Members tab shows them that instead of a Leave button.
  const myRole = contributions.find((c) => c.isMe)?.role;

  // Overall collective progress today (the live headline).
  const collectiveTotal = taskTotals.reduce((s, t) => s + t.total, 0);
  const collectiveGoal = taskTotals.reduce((s, t) => s + t.goal, 0);
  const collectivePct = collectiveGoal
    ? Math.min(100, Math.round((collectiveTotal / collectiveGoal) * 100))
    : 0;

  async function markGroupTaskDone(taskId: string, target: number) {
    setLogError(null);
    setLogging(taskId);
    // Each member's "today" is computed server-side from THEIR timezone (D34).
    const res = await logForGroup(groupId, taskId, target);
    setLogging(null);
    if (res?.error) {
      // A refused write must say so — silently reverting reads as data loss.
      setLogError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <Screen>
      <PageHeader
        title={
          <GroupSwitcher
            className="-ml-2 px-2 py-0.5 font-display text-2xl font-bold"
            initialName={groupName}
          />
        }
        subtitle={
          <span>
            {memberCount} member{memberCount === 1 ? "" : "s"}
          </span>
        }
        action={
          <div className="flex items-center gap-1.5">
            <Link
              href="/groups"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <GridIcon className="size-4" />
              Groups
            </Link>
            {canManage && (
              <Link
                href={groupHref(groupId, "/group/manage")}
                aria-label="Manage group"
                className={buttonVariants({ variant: "outline", size: "icon" })}
              >
                <SettingsIcon className="size-5" />
              </Link>
            )}
          </div>
        }
      />

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Overview" },
          { value: "standings", label: "Standings" },
          { value: "members", label: "Members" },
        ]}
      />

      {/* ---- Tab panels crossfade in place (AnimatePresence mode="wait") ---- */}
      <AnimatePresence mode="wait">
        {/* ---- Overview: the live collective progress ---- */}
        {tab === "overview" && (
          <motion.div key="overview" {...panel}>
            <Stack gap="2xl">
              {/* The circle's garden (CET-17) — the emotional layer, leading the
                tab: it's the one thing here that isn't a number. */}
              <GroupGarden garden={garden} />

              <section className={cardVariants({ padding: "md" })}>
                <p className="text-sm text-muted-foreground">
                  <span
                    aria-hidden
                    className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-success align-middle"
                  />
                  The circle today
                </p>
                <p className="mt-1 font-display text-4xl font-bold text-foreground tabular-nums">
                  {collectivePct}%
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                  {/* One expression, not text-around-expressions: JSX drops the
                    space at a line break, which rendered "100toward". */}
                  {`${collectiveTotal.toLocaleString()} of ${collectiveGoal.toLocaleString()} toward today\u2019s goal`}
                </p>
              </section>

              {/* M6 — the durable North Star (90-day collective consistency) */}
              <section className={cardVariants({ padding: "md" })}>
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Steadfast together · 90 days
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The circle&rsquo;s share of fully-completed days — the
                      number we grow.
                    </p>
                  </div>
                  <span className="font-display text-3xl font-bold text-primary tabular-nums">
                    {groupConsistency90}%
                  </span>
                </div>
                <ProgressBar value={groupConsistency90} className="mt-3" />
              </section>

              <section>
                <SectionHeading>Collective progress</SectionHeading>
                {taskTotals.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                    No tasks yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {taskTotals.map(({ taskId, label, total, goal }) => {
                      const pct =
                        goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
                      const met = goal > 0 && total >= goal;
                      return (
                        <li key={taskId}>
                          <div className="mb-1 flex items-baseline justify-between text-sm">
                            <span className="flex items-center gap-1.5 font-medium text-foreground">
                              {label}
                              {met && (
                                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-success">
                                  <CheckIcon className="size-3.5" />
                                  met
                                </span>
                              )}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {total.toLocaleString()} / {goal.toLocaleString()}
                            </span>
                          </div>
                          <ProgressBar
                            value={pct}
                            tone={met ? "success" : "primary"}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </Stack>
          </motion.div>
        )}

        {/* ---- Standings: the (for-fun) weekly ranking ---- */}
        {tab === "standings" && (
          <motion.div key="standings" {...panel}>
            <Stack gap="2xl">
              {/* The pair goal (CET-22) leads the ranking, deliberately: a whole-
              group leaderboard disheartens the bottom half, so the first thing
              you meet here is a goal you WIN TOGETHER rather than a rank. */}
              {pair && <PairGoal pair={pair} />}

              <p className="text-xs text-muted-foreground">
                The weekly ranking is for fun — showing up matters more than the
                number. Ranked by days active this week, then total count.
              </p>
              <ol className="flex flex-col gap-2">
                {standings.map((row, i) => (
                  <li
                    key={row.userId}
                    className={cn(
                      "rounded-2xl border p-3 shadow-sm",
                      row.isMe
                        ? "border-accent-500/40 bg-accent-500/10"
                        : "border-border bg-card",
                    )}
                  >
                    <MemberRow
                      name={row.name}
                      you={row.isMe}
                      leading={
                        <span className="w-7 shrink-0 text-center font-display text-lg font-bold text-muted-foreground tabular-nums">
                          {i < 3 ? MEDALS[i] : i + 1}
                        </span>
                      }
                      status={
                        <span>{row.daysActive}/7 days active this week</span>
                      }
                      trailing={
                        <div className="text-right">
                          <p className="font-display text-base font-bold text-foreground tabular-nums">
                            {row.total.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            counts
                          </p>
                        </div>
                      }
                    />
                  </li>
                ))}
              </ol>
            </Stack>
          </motion.div>
        )}

        {/* ---- Members: who's in the circle + today's contribution ---- */}
        {tab === "members" && (
          <motion.div key="members" {...panel}>
            <section>
              <SectionHeading
                action={
                  canManage ? (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setGroupLogOpen(true)}
                        className="font-medium text-primary"
                      >
                        Log for group
                      </button>
                      <Link
                        href={groupHref(groupId, "/group/manage")}
                        className="font-medium text-primary"
                      >
                        Manage
                      </Link>
                    </div>
                  ) : undefined
                }
              >
                {memberCount} member{memberCount === 1 ? "" : "s"}
              </SectionHeading>
              {canManage && (
                <p className="mb-2 text-xs text-muted-foreground">
                  Tap a member to view or log their last {days} days, task by
                  task.
                </p>
              )}
              <ul className="flex flex-col gap-1.5">
                {contributions.map((m) => {
                  const row = (
                    <MemberRow
                      name={m.name}
                      role={m.role}
                      you={m.isMe}
                      trailing={
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="font-display text-sm font-bold text-foreground tabular-nums">
                              {m.today.toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              today
                            </p>
                          </div>
                          {canManage && (
                            <ChevronRightIcon className="size-4 text-muted-foreground" />
                          )}
                        </div>
                      }
                    />
                  );
                  return (
                    <li key={m.userId}>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => setBreakdownUserId(m.userId)}
                          aria-label={`See ${m.name}'s last ${days} days`}
                          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50"
                        >
                          {row}
                        </button>
                      ) : (
                        <div className="rounded-xl border border-border bg-card px-3 py-2">
                          {row}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {canManage && (
                <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  Add members from{" "}
                  <Link
                    href={groupHref(groupId, "/group/manage")}
                    className="font-medium text-primary"
                  >
                    Manage
                  </Link>{" "}
                  — share an invite link or code.
                </div>
              )}

              {/* M6 · D31 — admin-only steadfastness recognition board */}
              {canManage && steadfastness.length > 0 && (
                <div className="mt-6">
                  <SteadfastnessBoard
                    board={steadfastness}
                    bar={steadfastBar}
                  />
                </div>
              )}

              {/* Leave the circle. Lives here, not in Manage — a plain member can't
              open Manage, and leaving is the one group action every role has.
              The owner can't leave (RLS): they must hand the circle over or
              close it, so nobody walks out and strands it. */}
              <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3">
                {myRole === "owner" ? (
                  <p className="text-sm text-muted-foreground">
                    You own this circle. To leave, transfer ownership to someone
                    else — or delete the circle — from{" "}
                    <Link
                      href={groupHref(groupId, "/group/manage")}
                      className="font-medium text-primary"
                    >
                      Manage
                    </Link>
                    .
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setLeaveOpen(true)}
                      disabled={leaveAct.pending}
                      className="text-sm font-medium text-danger disabled:opacity-60"
                    >
                      {leaveAct.pending ? "Leaving…" : "Leave this circle"}
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      You&apos;ll stop counting toward the circle&apos;s goals.
                      The dhikr you logged stays — rejoin and it counts again.
                    </p>
                    {leaveAct.error && (
                      <p role="alert" className="mt-2 text-xs text-danger">
                        {leaveAct.error}
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => leaveAct.run(() => leaveGroup(groupId))}
        title="Leave this circle?"
        description="You'll no longer see it or count toward its goals. The dhikr you logged stays with the circle, and rejoining brings it back."
        confirmLabel="Leave"
      />

      {canManage && (
        <MemberBreakdownDialog
          key={breakdownUserId ?? "none"}
          member={breakdownUserId ? breakdowns[breakdownUserId] : null}
          days={days}
          viewerId={viewerId}
          names={names}
          editable
          open={breakdownUserId !== null}
          onClose={() => setBreakdownUserId(null)}
        />
      )}

      {/* D29: log a task for the whole circle today (in-person halaqah tally) */}
      {canManage && (
        <Dialog
          open={groupLogOpen}
          onClose={() => setGroupLogOpen(false)}
          title="Log for the group"
          description="Mark a task done for everyone today — for an in-person session. Each entry is recorded as logged by you."
          className="max-w-md"
        >
          <ul className="flex flex-col gap-2">
            {tasks.map((t) => {
              const tot = taskTotals.find((x) => x.taskId === t.id);
              const allDone = tot ? tot.total >= tot.goal : false;
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {t.label}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      target {t.target.toLocaleString()} · ×{memberCount}{" "}
                      members
                    </p>
                  </div>
                  {allDone ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                      <CheckIcon className="size-4" />
                      all done
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={logging === t.id}
                      onClick={() => markGroupTaskDone(t.id, t.target)}
                    >
                      {logging === t.id ? "Logging…" : "Mark all done"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {logError && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {logError}
            </p>
          )}
        </Dialog>
      )}
    </Screen>
  );
}
