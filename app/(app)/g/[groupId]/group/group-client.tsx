"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants, Button, Dialog, ConfirmDialog } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/demo/page-header";
import { SectionHeading } from "@/components/demo/section-heading";
import { GroupGarden } from "@/components/app/group-garden";
import { PairGoal, type Pair } from "@/components/app/pair-goal";
import type { Garden } from "@/lib/retention";
import { MemberRow } from "@/components/demo/member-row";
import { Segmented } from "@/components/demo/segmented";
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
} from "@/components/demo/icons";
import { logForGroup, leaveGroup } from "./actions";

type Role = "owner" | "admin" | "member";
type Tab = "overview" | "standings" | "members";
const MEDALS = ["🥇", "🥈", "🥉"];

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
  todayISO,
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
  todayISO: string;
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
  /** This week's winnable pair goal (CET-22); null in a circle of one. */
  pair: Pair | null;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("overview");
  const [breakdownUserId, setBreakdownUserId] = React.useState<string | null>(
    null,
  );
  const [groupLogOpen, setGroupLogOpen] = React.useState(false);
  const [logging, setLogging] = React.useState<string | null>(null);
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
    setLogging(taskId);
    await logForGroup(groupId, taskId, todayISO, target);
    setLogging(null);
    router.refresh();
  }

  return (
    <div className="rise-in flex flex-col gap-5 px-4 pt-5 pb-6">
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

      {/* ---- Overview: the live collective progress ---- */}
      {tab === "overview" && (
        <>
          {/* The circle's garden (CET-17) — the emotional layer, leading the
              tab: it's the one thing here that isn't a number. */}
          <GroupGarden garden={garden} />

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
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
              {collectiveTotal.toLocaleString()} of{" "}
              {collectiveGoal.toLocaleString()} toward today&rsquo;s goal
            </p>
          </section>

          {/* M6 — the durable North Star (90-day collective consistency) */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Steadfast together · 90 days
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The circle&rsquo;s share of fully-completed days — the number
                  we grow.
                </p>
              </div>
              <span className="font-display text-3xl font-bold text-primary tabular-nums">
                {groupConsistency90}%
              </span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-brand)]"
                style={{ width: `${groupConsistency90}%` }}
              />
            </div>
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
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-brand)]",
                            met ? "bg-success" : "bg-primary",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {/* ---- Standings: the (for-fun) weekly ranking ---- */}
      {tab === "standings" && (
        <>
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
                  status={<span>{row.daysActive}/7 days active this week</span>}
                  trailing={
                    <div className="text-right">
                      <p className="font-display text-base font-bold text-foreground tabular-nums">
                        {row.total.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">counts</p>
                    </div>
                  }
                />
              </li>
            ))}
          </ol>
        </>
      )}

      {/* ---- Members: who's in the circle + today's contribution ---- */}
      {tab === "members" && (
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
              Tap a member to view or log their last {days} days, task by task.
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
                        <p className="text-xs text-muted-foreground">today</p>
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
              <SteadfastnessBoard board={steadfastness} bar={steadfastBar} />
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
                  You&apos;ll stop counting toward the circle&apos;s goals. The
                  dhikr you logged stays — rejoin and it counts again.
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
      )}

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
        </Dialog>
      )}
    </div>
  );
}
