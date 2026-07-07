import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveGroup } from "@/lib/active-group";
import { localDateISO, isoDaysAgo } from "@/lib/local-date";
import type { GridRow } from "@/components/app/task-grid";
import { ProgressClient } from "./progress-client";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const DAYS = 14;

/**
 * Progress, server-first (M5 — personal reflection). Streak hero +
 * never-miss-twice (from `streaks`) and the editable last-14-days task grid
 * (self-correct via `set_count`, D29) — all off raw `logs` under RLS.
 *
 * The 30-day steadfastness band, the group-90 collective rollup, and the badge
 * grid are deferred to M6 (they read the `daily_completion` rollup, which only
 * retains what raw logs can't — beyond the 14-day window).
 */
export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string;

  const active = await resolveActiveGroup();
  if (!active) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">
            No progress yet
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Join or create a group to start tracking your rhythm.
          </p>
          <Link
            href="/groups"
            className={buttonVariants({ variant: "accent", className: "mt-4" })}
          >
            Go to groups
          </Link>
        </div>
      </div>
    );
  }

  const groupId = active.groupId;

  const [
    { data: profile },
    { data: tasks },
    { data: streak },
    { data: members },
  ] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", me).maybeSingle(),
    supabase
      .from("tasks")
      .select("id, label, target_count")
      .eq("group_id", groupId)
      .order("sort_order"),
    supabase
      .from("streaks")
      .select("current, longest, freezes_left")
      .eq("user_id", me)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("user_id, profiles(name)")
      .eq("group_id", groupId),
  ]);

  const tz = profile?.timezone ?? "UTC";
  const todayISO = localDateISO(tz);
  const taskList = tasks ?? [];
  const taskIds = taskList.map((t) => t.id);

  const { data: logs } = await supabase
    .from("logs")
    .select("task_id, date, count, logged_by")
    .eq("user_id", me)
    .in("task_id", taskIds.length ? taskIds : [ZERO_UUID])
    .gte("date", isoDaysAgo(todayISO, DAYS - 1));

  // `task|date` → { count, loggedBy } (my own record; unique per key).
  const index = new Map<string, { count: number; loggedBy: string | null }>();
  for (const l of logs ?? []) {
    index.set(`${l.task_id}|${l.date}`, {
      count: l.count,
      loggedBy: l.logged_by,
    });
  }
  const countOf = (t: string, d: string) => index.get(`${t}|${d}`)?.count ?? 0;

  const names: Record<string, string> = {};
  for (const m of members ?? [])
    names[m.user_id] = m.profiles?.name ?? "Member";

  const dates14 = Array.from({ length: DAYS }, (_, i) =>
    isoDaysAgo(todayISO, DAYS - 1 - i),
  );

  const rows: GridRow[] = taskList.map((t) => ({
    taskId: t.id,
    label: t.label,
    cells: dates14.map((date) => {
      const cell = index.get(`${t.id}|${date}`);
      const count = cell?.count ?? 0;
      const target = t.target_count;
      return {
        date,
        count,
        target,
        pct: target ? Math.min(1, count / target) : 0,
        full: count >= target,
        loggedBy: cell?.loggedBy ?? null,
      };
    }),
  }));

  const daysFull = taskList.length
    ? dates14.filter((d) =>
        taskList.every((t) => countOf(t.id, d) >= t.target_count),
      ).length
    : 0;

  return (
    <ProgressClient
      current={streak?.current ?? 0}
      longest={streak?.longest ?? 0}
      freezesLeft={streak?.freezes_left ?? 0}
      daysFull={daysFull}
      days={DAYS}
      rows={rows}
      viewerId={me}
      names={names}
      hasTasks={taskList.length > 0}
    />
  );
}
