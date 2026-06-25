"use client";

import * as React from "react";
import Link from "next/link";
import { ProgressRing, buttonVariants } from "@/components/ui";
import { useMock, sel } from "@/lib/mock/store";
import { PageHeader } from "@/components/demo/page-header";
import { SectionHeading } from "@/components/demo/section-heading";
import { StreakChip } from "@/components/demo/streak-chip";
import { CircleToday } from "@/components/demo/peer-reactions";
import { FreshStartBanner } from "@/components/demo/fresh-start";
import { CheckIcon, ChevronRightIcon } from "@/components/demo/icons";

export default function TodayPage() {
  const { state } = useMock();
  const me = sel.currentUser(state);
  const group = sel.activeGroup(state);
  const tasks = sel.groupTasks(state, group.id);
  const streak = sel.streak(state, me.id);

  const firstName = me.name.split(" ")[0];

  // Each ring's progress today (computed once, reused for the headline + CTA).
  const rings = tasks.map((t) => {
    const count = sel.todayCount(state, me.id, t.id);
    return { task: t, count, done: count >= t.targetCount };
  });
  const closed = rings.filter((r) => r.done).length;
  const left = rings.length - closed;

  // Abstraction (GLANCE): one human headline that leads with the unfinished.
  const glance =
    rings.length === 0
      ? "No tasks yet"
      : left === 0
        ? "All rings closed today — mashaAllah 🎉"
        : closed === 0
          ? "A fresh page — start with one ring"
          : `${left} ring${left === 1 ? "" : "s"} to close — you're almost there`;

  // One primary action (goal-gradient): continue the ring closest to done.
  const next = rings
    .filter((r) => !r.done)
    .sort(
      (a, b) => b.count / b.task.targetCount - a.count / a.task.targetCount,
    )[0];

  // Collective presence — a slim line, not a second counter (that lives on Group).
  const collective = sel.groupToday(state, group.id);
  const collectivePct = collective.goal
    ? Math.round((collective.total / collective.goal) * 100)
    : 0;

  return (
    <div className="rise-in flex flex-col gap-5 px-4 pt-5 pb-6">
      {/* Fresh-start re-engagement (CET-19) — shows on temporal landmarks */}
      <FreshStartBanner />

      <PageHeader
        title={
          <div>
            <p className="text-sm text-muted-foreground">Assalamu alaykum,</p>
            <h1 className="font-display text-2xl font-bold text-foreground">
              {firstName}
            </h1>
          </div>
        }
        subtitle={<span className="font-medium text-foreground">{glance}</span>}
        action={<StreakChip current={streak?.current ?? 0} />}
      />

      {/* Primary action — one gold CTA, the nearest-to-done ring */}
      {next && (
        <Link
          href={`/count/${next.task.id}`}
          className={buttonVariants({ variant: "accent", className: "w-full" })}
        >
          Continue {next.task.label} ·{" "}
          <span className="tabular-nums">
            {next.count}/{next.task.targetCount}
          </span>
        </Link>
      )}

      {/* Rings */}
      <section>
        <SectionHeading action="tap to count">Your rings today</SectionHeading>
        <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {rings.map(({ task: t, count, done }) => (
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
                    {count.toLocaleString()} / {t.targetCount.toLocaleString()}
                  </p>
                </div>
                <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-xs text-muted-foreground">
          Your circle is{" "}
          <span className="font-medium text-foreground tabular-nums">
            {collectivePct}%
          </span>{" "}
          toward today&apos;s goal — see the garden on{" "}
          <Link href="/group" className="font-medium text-primary underline">
            Group
          </Link>
          .
        </p>
      </section>

      {/* One-tap peer reactions (CET-18) — unified circle view */}
      <CircleToday />
    </div>
  );
}
