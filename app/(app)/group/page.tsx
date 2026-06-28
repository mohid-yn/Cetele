"use client";

import * as React from "react";
import Link from "next/link";
import { buttonVariants, Button, Dialog } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { PageHeader } from "@/components/demo/page-header";
import { SectionHeading } from "@/components/demo/section-heading";
import { GroupSwitcher } from "@/components/demo/group-switcher";
import { GroupGarden } from "@/components/demo/group-garden";
import { LiveCounter } from "@/components/demo/live-counter";
import { PairGoal } from "@/components/demo/pair-goal";
import { MemberRow } from "@/components/demo/member-row";
import { MemberBreakdownDialog } from "@/components/demo/member-breakdown";
import { SteadfastnessBoard } from "@/components/demo/steadfastness-board";
import { Segmented } from "@/components/demo/segmented";
import {
  CheckIcon,
  ChevronRightIcon,
  FlameIcon,
  GridIcon,
  SettingsIcon,
} from "@/components/demo/icons";
import { isoDate } from "@/lib/mock/data";

type Tab = "overview" | "standings" | "members";
const MEDALS = ["🥇", "🥈", "🥉"];

export default function GroupPage() {
  const { state, actions } = useMock();
  const group = sel.activeGroup(state);
  const tasks = sel.groupTasks(state, group.id);
  const members = sel.groupMembers(state, group.id);
  const meId = state.session.currentUserId;
  const today = isoDate(0);
  const canManage = sel.canManageGroup(state, meId, group.id);

  const [tab, setTab] = React.useState<Tab>("overview");
  // Admin oversight: which member's fortnight breakdown is open (null = none).
  const [breakdownUserId, setBreakdownUserId] = React.useState<string | null>(
    null,
  );
  // D29: the in-person halaqah "log for the group" quick-action dialog.
  const [groupLogOpen, setGroupLogOpen] = React.useState(false);

  // Per-task collective progress: everyone's counts today vs target × members.
  const taskTotals = tasks.map((t) => {
    const total = state.logs
      .filter((l) => l.taskId === t.id && l.date === today)
      .reduce((s, l) => s + l.count, 0);
    return { task: t, total, goal: t.targetCount * members.length };
  });

  // Today's contributions per member (the Members view).
  const taskIds = new Set(tasks.map((t) => t.id));
  const contributions = members
    .map((m) => ({
      ...m,
      today: state.logs
        .filter(
          (l) =>
            l.userId === m.userId && taskIds.has(l.taskId) && l.date === today,
        )
        .reduce((s, l) => s + l.count, 0),
    }))
    .sort((a, b) => b.today - a.today);

  const standings = sel.leaderboard(state, group.id);

  return (
    <div className="rise-in flex flex-col gap-5 px-4 pt-5 pb-6">
      <PageHeader
        title={
          <GroupSwitcher className="-ml-2 px-2 py-0.5 font-display text-2xl font-bold" />
        }
        subtitle={
          <span className="px-0.5">
            {members.length} members ·{" "}
            <span className="font-mono">{group.inviteCode}</span>
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
                href="/group/manage"
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

      {/* ---- Overview: the collective hero ---- */}
      {tab === "overview" && (
        <>
          <GroupGarden />
          <LiveCounter />

          <section>
            <SectionHeading>Collective progress</SectionHeading>
            <ul className="flex flex-col gap-3">
              {taskTotals.map(({ task, total, goal }) => {
                const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
                const met = goal > 0 && total >= goal;
                return (
                  <li key={task.id}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        {task.label}
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
          </section>
        </>
      )}

      {/* ---- Standings: winnable pair goal + the (for-fun) ranking ---- */}
      {tab === "standings" && (
        <>
          <PairGoal />
          <p className="text-xs text-muted-foreground">
            The ranking is for fun — the pair goal above is the one you win
            together.
          </p>
          <ol className="flex flex-col gap-2">
            {standings.map((row, i) => {
              const isMe = row.userId === meId;
              return (
                <li
                  key={row.userId}
                  className={cn(
                    "rounded-2xl border p-3 shadow-sm",
                    // Opacity-tint (not a fixed light step) so the "you" highlight
                    // stays readable in dark too — bg-accent-50 was white-on-white.
                    isMe
                      ? "border-accent-500/40 bg-accent-500/10"
                      : "border-border bg-card",
                  )}
                >
                  <MemberRow
                    name={row.user.name}
                    you={isMe}
                    leading={
                      <span className="w-7 shrink-0 text-center font-display text-lg font-bold text-muted-foreground tabular-nums">
                        {i < 3 ? MEDALS[i] : i + 1}
                      </span>
                    }
                    status={
                      <span className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-0.5">
                          <FlameIcon className="size-3.5 text-accent" />
                          {row.streak}d
                        </span>
                        <span>· {row.daysActive}/7 days active</span>
                      </span>
                    }
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
              );
            })}
          </ol>
        </>
      )}

      {/* ---- Members: who's in the circle + today's contribution ---- */}
      {tab === "members" && (
        <>
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
                      href="/group/manage"
                      className="font-medium text-primary"
                    >
                      Manage
                    </Link>
                  </div>
                ) : undefined
              }
            >
              {members.length} members
            </SectionHeading>
            {canManage && (
              <p className="mb-2 text-xs text-muted-foreground">
                Tap a member to view or log their last 14 days, task by task.
              </p>
            )}
            <ul className="flex flex-col gap-1.5">
              {contributions.map((m) => {
                const row = (
                  <MemberRow
                    name={m.user.name}
                    role={m.role}
                    you={m.userId === meId}
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
                        aria-label={`See ${m.user.name}'s last 14 days`}
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
                Invite with code{" "}
                <span className="font-mono font-semibold text-foreground">
                  {group.inviteCode}
                </span>{" "}
                — or add members from{" "}
                <Link href="/group/manage" className="font-medium text-primary">
                  Manage
                </Link>
                .
              </div>
            )}
          </section>
          {/* Steadfastness recognition — admin/owner-only, group-scoped (D31) */}
          {canManage && <SteadfastnessBoard groupId={group.id} />}
        </>
      )}

      {canManage && (
        <MemberBreakdownDialog
          key={breakdownUserId ?? "none"}
          userId={breakdownUserId}
          groupId={group.id}
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
              const done = taskTotals.find((x) => x.task.id === t.id);
              const allDone = done ? done.total >= done.goal : false;
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
                      target {t.targetCount.toLocaleString()} · ×
                      {members.length} members
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
                      onClick={() =>
                        actions.logForGroup(
                          group.id,
                          t.id,
                          today,
                          t.targetCount,
                        )
                      }
                    >
                      Mark all done
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
