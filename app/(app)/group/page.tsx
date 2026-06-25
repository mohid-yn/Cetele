"use client";

import * as React from "react";
import Link from "next/link";
import { Avatar, Badge, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { GroupSwitcher } from "@/components/demo/group-switcher";
import { LiveCounter } from "@/components/demo/live-counter";
import { CheckIcon } from "@/components/demo/icons";
import { isoDate } from "@/lib/mock/data";

export default function GroupPage() {
  const { state } = useMock();
  const group = sel.activeGroup(state);
  const tasks = sel.groupTasks(state, group.id);
  const members = sel.groupMembers(state, group.id);
  const today = isoDate(0);
  const canManage =
    state.session.viewRole === "group_admin" ||
    state.session.viewRole === "admin";

  // Per-task collective progress: everyone's counts today vs target × members.
  const taskTotals = tasks.map((t) => {
    const total = state.logs
      .filter((l) => l.taskId === t.id && l.date === today)
      .reduce((s, l) => s + l.count, 0);
    const goal = t.targetCount * members.length;
    return { task: t, total, goal };
  });

  // Today's contributions per member (drives a lively, real activity panel).
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

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <GroupSwitcher className="-ml-2 px-2 py-0.5 font-display text-2xl font-bold" />
          <p className="px-0.5 text-sm text-muted-foreground">
            {members.length} members
          </p>
        </div>
        <Badge variant="outline" className="font-mono">
          {group.inviteCode}
        </Badge>
      </header>

      <LiveCounter />

      {canManage && (
        <Link
          href="/group/manage"
          className={buttonVariants({
            variant: "outline",
            className: "w-full",
          })}
        >
          Manage group &amp; tasks
        </Link>
      )}

      {/* Collective progress per task */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Collective progress
        </h2>
        <ul className="flex flex-col gap-3">
          {taskTotals.map(({ task, total, goal }) => {
            const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
            const met = goal > 0 && total >= goal;
            return (
              <li key={task.id}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    {task.label}
                    {/* Green = completion (UI_PRACTICES §1); glyph+label too (§5). */}
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

      {/* Today's contributions */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Today&apos;s contributions
        </h2>
        <ul className="flex flex-col gap-1.5">
          {contributions.map((m) => (
            <li
              key={m.userId}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
            >
              <Avatar name={m.user.name} size="sm" />
              <div className="flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {m.user.name}
                  {m.role === "group_admin" && (
                    <Badge variant="primary" size="sm">
                      admin
                    </Badge>
                  )}
                </p>
              </div>
              <span className="font-display text-sm font-bold text-foreground tabular-nums">
                {m.today.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
