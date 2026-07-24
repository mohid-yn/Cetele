"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Avatar,
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
import { CheckIcon, ChevronRightIcon } from "@/components/app/icons";
import { groupHref } from "@/lib/group-href";
import { useLocalToday } from "@/lib/use-local-today";
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
  target: number;
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

  const countOn = (taskId: string, d: string) => counts[d]?.[taskId] ?? 0;
  const dayFull = (d: string) =>
    tasks.length > 0 && tasks.every((t) => countOn(t.id, d) >= t.target);

  const rings = tasks.map((t) => {
    const count = countOn(t.id, date);
    return { task: t, count, done: count >= t.target };
  });
  const closed = rings.filter((r) => r.done).length;
  const left = rings.length - closed;

  // Abstraction (GLANCE): one human headline that leads with the unfinished.
  const glance =
    rings.length === 0
      ? "No tasks yet"
      : left === 0
        ? `All rings closed${isToday ? " today" : ""} — mashaAllah 🎉`
        : closed === 0
          ? "A fresh page — start with one ring"
          : `${left} ring${left === 1 ? "" : "s"} to close — you're almost there`;

  // One primary action (goal-gradient): continue the ring closest to done.
  const next = rings
    .filter((r) => !r.done)
    .sort((a, b) => b.count / b.task.target - a.count / a.task.target)[0];

  // Where a banner's "Begin today" sends you: the nearest-to-done ring, else the
  // first task. Null when the circle has no tasks yet (nothing to begin).
  const beginTask = next?.task ?? tasks[0];
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
          today: back-filling an old day is not a moment to re-onboard someone. */}
      {isToday && welcome && (
        <WelcomeCard
          groupName={groupName}
          collectivePct={collectivePct}
          beginHref={beginHref}
        />
      )}
      {isToday && !welcome && landmark && (
        <FreshStartBanner landmark={landmark} beginHref={beginHref} />
      )}

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
          <span className="tabular-nums">
            {next.count}/{next.task.target}
          </span>
        </Link>
      )}

      {/* Rings */}
      <section>
        <SectionHeading action="tap to count">
          {isToday ? "Your rings today" : "Your rings"}
        </SectionHeading>
        <Grid as="ul" cols="cards" gap="md">
          {rings.map(({ task: t, count, done }) => {
            // The one to continue gets an emerald rim, so the eye lands on the
            // same ring the gold "Continue" CTA above points at.
            const promoted = !done && next?.task.id === t.id;
            return (
              <li key={t.id}>
                <Link
                  href={`${groupHref(groupId, `/count/${t.id}`)}${isToday ? "" : `?date=${date}`}`}
                  className={cn(
                    cardVariants({ padding: "compact" }),
                    "flex items-center gap-4 transition-[box-shadow,transform] duration-[var(--duration-base)] hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-md motion-reduce:transform-none",
                    promoted && "glow-primary",
                  )}
                >
                  <ProgressRing
                    value={count}
                    max={t.target}
                    size={72}
                    thickness={8}
                  >
                    {done ? (
                      <CheckIcon className="size-6 text-success" />
                    ) : (
                      <span className="text-sm font-bold text-foreground tabular-nums">
                        {Math.round((count / t.target) * 100)}%
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
                    <ProgressBar
                      value={count}
                      max={t.target}
                      tone={done ? "success" : "primary"}
                      className="mt-2 h-1.5"
                    />
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {count.toLocaleString()} / {t.target.toLocaleString()}
                    </p>
                  </div>
                  <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
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
    </Screen>
  );
}
