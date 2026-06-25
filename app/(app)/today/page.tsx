"use client";

import * as React from "react";
import Link from "next/link";
import { ProgressRing, Badge, Avatar } from "@/components/ui";
import { useMock, sel } from "@/lib/mock/store";
import { LiveCounter } from "@/components/demo/live-counter";
import { CheerCircle } from "@/components/demo/peer-reactions";
import { FreshStartBanner } from "@/components/demo/fresh-start";
import {
  FlameIcon,
  CheckIcon,
  ChevronRightIcon,
} from "@/components/demo/icons";

export default function TodayPage() {
  const { state } = useMock();
  const me = sel.currentUser(state);
  const group = sel.activeGroup(state);
  const tasks = sel.groupTasks(state, group.id);
  const streak = sel.streak(state, me.id);
  const members = sel.groupMembers(state, group.id);

  const firstName = me.name.split(" ")[0];

  // Abstraction pass (UI_PRACTICES §C / research 02 §C): one GLANCE headline
  // that turns the raw counts into meaning and leads with the *unfinished*.
  const closed = tasks.filter(
    (t) => sel.todayCount(state, me.id, t.id) >= t.targetCount,
  ).length;
  const left = tasks.length - closed;
  const glance =
    tasks.length === 0
      ? "No tasks yet"
      : left === 0
        ? "All rings closed today — mashaAllah 🎉"
        : closed === 0
          ? "A fresh page — start with one ring"
          : `${left} ring${left === 1 ? "" : "s"} to close — you're almost there`;

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-6">
      {/* Fresh-start re-engagement (CET-19) — shows on temporal landmarks */}
      <FreshStartBanner />

      {/* Greeting + streak */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Assalamu alaykum,</p>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {firstName}
          </h1>
          {/* GLANCE headline — meaning, not raw numbers */}
          <p className="mt-0.5 text-sm font-medium text-foreground">{glance}</p>
          <p className="text-xs text-muted-foreground">{group.name}</p>
        </div>
        <Badge variant="accent" size="md" className="gap-1 px-3 py-1.5 text-sm">
          <FlameIcon className="size-4" />
          {streak?.current ?? 0} day streak
        </Badge>
      </header>

      <LiveCounter />

      {/* Rings */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Your rings today
          </h2>
          <span className="text-xs text-muted-foreground">tap to count</span>
        </div>
        <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {tasks.map((t) => {
            const count = sel.todayCount(state, me.id, t.id);
            const done = count >= t.targetCount;
            return (
              <li key={t.id}>
                <Link
                  href={`/count/${t.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3 shadow-sm transition-[box-shadow,transform] duration-[var(--duration-base)] hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none"
                >
                  <ProgressRing
                    value={count}
                    max={t.targetCount}
                    size={60}
                    thickness={7}
                  >
                    {done ? (
                      <CheckIcon className="size-5 text-success" />
                    ) : (
                      <span className="text-xs font-bold text-foreground tabular-nums">
                        {Math.round((count / t.targetCount) * 100)}%
                      </span>
                    )}
                  </ProgressRing>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-semibold text-foreground">
                      {t.label}
                    </p>
                    {t.subtitle && (
                      <p
                        className="truncate text-sm text-muted-foreground"
                        dir="rtl"
                        lang="ar"
                      >
                        {t.subtitle}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {count.toLocaleString()} /{" "}
                      {t.targetCount.toLocaleString()}
                    </p>
                  </div>
                  <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Peer strip */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Your circle
        </h2>
        <div className="flex flex-wrap gap-3">
          {members.map((m) => (
            <div
              key={m.userId}
              className="flex w-14 flex-col items-center gap-1"
            >
              <Avatar name={m.user.name} size="md" />
              <span className="w-full truncate text-center text-xs text-muted-foreground">
                {m.user.name.split(" ")[0]}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* One-tap peer reactions (CET-18) */}
      <CheerCircle />
    </div>
  );
}
