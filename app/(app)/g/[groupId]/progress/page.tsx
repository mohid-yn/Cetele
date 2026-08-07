import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveGroup } from "@/lib/active-group";
import { localDateISO, isoDaysAgo, timestampDateISO } from "@/lib/local-date";
import { q } from "@/lib/db-log";
import { assignedOn, visibleOn, toAssignments } from "@/lib/assignments";
import { toConfigVersions, targetOn, frequencyOn } from "@/lib/task-config";
import { isDueOn } from "@/lib/goals";
import type { GridRow } from "@/components/app/task-grid";
import type { EarnedBadge } from "@/components/app/badges";
import { ProgressClient } from "./progress-client";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const DAYS = 14;
const BAND_WINDOW = 30;

/**
 * Progress, server-first (M5 — personal reflection). Streak hero +
 * never-miss-twice (from `streaks`) and the editable last-14-days task grid
 * (self-correct via `set_count`, D29) — all off raw `logs` under RLS.
 *
 * The 30-day steadfastness band, the group-90 collective rollup, and the badge
 * grid are deferred to M6 (they read the `daily_completion` rollup, which only
 * retains what raw logs can't — beyond the 14-day window).
 */
export default async function ProgressPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string;

  const active = await resolveGroup(groupId);
  if (!active) redirect("/groups");

  const [
    { data: profile },
    { data: tasks },
    { data: streak },
    { data: members },
    { data: group },
  ] = await q(
    "progress.reads (profile+tasks+streak+members+roadmap)",
    Promise.all([
      supabase.from("profiles").select("timezone").eq("id", me).maybeSingle(),
      supabase
        .from("tasks")
        // frequency + anchor: `daysFull` below is a SCORE and has to mirror
        // private.is_day_complete, which skips a task that had not come round.
        .select("id, label, target_count, frequency_days, created_at")
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
      // The programme this circle follows, if any (D55). Joined rather than
      // fetched separately, and it carries NO progress figure — the card is a
      // way in, not a second dashboard, so the roadmap's numbers stay on the
      // roadmap and cannot disagree with themselves across two screens.
      supabase
        .from("groups")
        .select("roadmaps(id, name, starts_on, ends_on)")
        .eq("id", groupId)
        .maybeSingle(),
    ]),
  );

  const tz = profile?.timezone ?? "UTC";
  const todayISO = localDateISO(tz);
  const taskList = tasks ?? [];
  const taskIds = taskList.map((t) => t.id);

  const [
    { data: logs },
    { data: dc30 },
    { data: assignmentRows },
    { data: versionRows },
  ] = await Promise.all([
    q(
      "progress.logs (my 14d)",
      supabase
        .from("logs")
        .select("task_id, date, count, logged_by")
        .eq("user_id", me)
        .in("task_id", taskIds.length ? taskIds : [ZERO_UUID])
        .gte("date", isoDaysAgo(todayISO, DAYS - 1)),
    ),
    // M6: the 30-day consistency band reads the rollup (raw logs only keep 14
    // days). Completed days only — today has no rollup row yet (D8: don't dip
    // the number for a day still in progress).
    q(
      "progress.daily_completion (30d band)",
      supabase
        .from("daily_completion")
        .select("completion_pct")
        .eq("user_id", me)
        .eq("group_id", groupId)
        .gte("date", isoDaysAgo(todayISO, BAND_WINDOW)),
    ),
    // Which of this circle's tasks were mine, and when (0023). All intervals —
    // the grid renders a fortnight, so a closed one is what keeps the days I
    // did carry a task on my record after being taken off it.
    q(
      "progress.assignments (all intervals)",
      supabase
        .from("task_assignments")
        .select("task_id, user_id, assigned_at, unassigned_at")
        .in("task_id", taskIds.length ? taskIds : [ZERO_UUID]),
    ),
    // What each task asked for, over time (0024). The grid renders a
    // fortnight and marks each cell against a target; using the LIVE one
    // would redraw the whole record every time an admin moved the number.
    q(
      "progress.task_config_versions (all intervals)",
      supabase
        .from("task_config_versions")
        .select(
          "task_id, target_count, frequency_days, effective_from, effective_to",
        )
        .in("task_id", taskIds.length ? taskIds : [ZERO_UUID]),
    ),
  ]);

  const assignments = toAssignments(assignmentRows);
  const versions = toConfigVersions(versionRows);

  // Band = % of the last 30 completed days that were fully done (all rings).
  // A full day rolls up to exactly 100; missing/partial days aren't counted.
  const bandFull = (dc30 ?? []).filter(
    (r) => Number(r.completion_pct) >= 100,
  ).length;
  const band = Math.round((bandFull / BAND_WINDOW) * 100);

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

  // My own list (0023) — a task I was never given is not part of my record, and
  // a task I was taken off still is, for the days I carried it.
  const myTasks = taskList.filter((t) =>
    dates14.some((d) => visibleOn(assignments, t.id, me, d, todayISO, tz)),
  );

  const rows: GridRow[] = myTasks.map((t) => ({
    taskId: t.id,
    label: t.label,
    cells: dates14.map((date) => {
      const cell = index.get(`${t.id}|${date}`);
      const count = cell?.count ?? 0;
      // The target THAT DAY asked for (0024), not the one it asks for now: a
      // cell is a record of a day, and an admin moving the number cannot
      // redraw a fortnight of them.
      const target = targetOn(versions, t.id, date, tz, t.target_count);
      // `visibleOn`, not `assignedOn`: a task assigned to me today must stay
      // editable across the fortnight so a past day can still be repaired
      // (D48). `daysFull` below judges strictly — that one is a score.
      const owed = visibleOn(assignments, t.id, me, date, todayISO, tz);
      return {
        date,
        count,
        target,
        owed,
        pct: target && owed ? Math.min(1, count / target) : 0,
        full: owed && count >= target,
        loggedBy: cell?.loggedBy ?? null,
      };
    }),
  }));

  // "N of the last 14 days complete" is a SCORE, so it mirrors
  // private.is_day_complete on all three of its bounds — mine that day (0023),
  // due that day (0021), against the target that day asked for (0024). The
  // member's own denser cycle is deliberately absent: it is an aim, and judging
  // someone on the extra occasions they volunteered for is the exact failure
  // D51 exists to prevent.
  const daysFull = taskList.length
    ? dates14.filter((d) => {
        const owedThatDay = taskList.filter(
          (t) =>
            assignedOn(assignments, t.id, me, d, tz) &&
            isDueOn(
              {
                frequencyDays: frequencyOn(
                  versions,
                  t.id,
                  d,
                  tz,
                  t.frequency_days,
                ),
                myFrequencyDays: null,
                // The anchor on my calendar too — `private.obligations` reads
                // `tasks.created_at` through `user_date`.
                createdOn: timestampDateISO(tz, t.created_at),
              },
              d,
            ),
        );
        // A day owing nothing is skipped, never counted as kept — the vacuous
        // truth `every()` would otherwise hand out (mirrors is_day_complete).
        return (
          owedThatDay.length > 0 &&
          owedThatDay.every(
            (t) =>
              countOf(t.id, d) >=
              targetOn(versions, t.id, d, tz, t.target_count),
          )
        );
      }).length
    : 0;

  // CET-20 — badges. sync_badges awards anything newly crossed BEFORE we read,
  // so hitting a threshold today shows up now rather than after tonight's sweep.
  // Awards are append-only (D43): this can grant a badge, never take one back.
  await q(
    "progress.sync_badges",
    supabase.rpc("sync_badges", { p_group: groupId }),
  );
  const [{ data: catalog }, { data: awards }] = await q(
    "progress.badges (catalog + my awards)",
    Promise.all([
      supabase
        .from("badges")
        // `glyph` is deliberately not read: the catalog's six values are emoji,
        // and the mark is now a drawn icon keyed on `id` (see badges.tsx).
        .select("id, label, description")
        .order("sort_order"),
      supabase
        .from("badge_awards")
        .select("badge_id, earned_on")
        .eq("user_id", me)
        .eq("group_id", groupId),
    ]),
  );
  const earnedOn = new Map(
    (awards ?? []).map((a) => [a.badge_id, a.earned_on as string]),
  );
  const badges: EarnedBadge[] = (catalog ?? []).map((b) => ({
    id: b.id,
    label: b.label,
    description: b.description,
    earnedOn: earnedOn.get(b.id) ?? null,
  }));

  return (
    <ProgressClient
      badges={badges}
      current={streak?.current ?? 0}
      longest={streak?.longest ?? 0}
      freezesLeft={streak?.freezes_left ?? 0}
      daysFull={daysFull}
      days={DAYS}
      band={band}
      bandFull={bandFull}
      bandWindow={BAND_WINDOW}
      rows={rows}
      viewerId={me}
      names={names}
      hasTasks={taskList.length > 0}
      groupId={groupId}
      roadmap={
        group?.roadmaps
          ? {
              name: group.roadmaps.name,
              startsOn: group.roadmaps.starts_on,
              endsOn: group.roadmaps.ends_on,
            }
          : null
      }
      todayISO={todayISO}
    />
  );
}
