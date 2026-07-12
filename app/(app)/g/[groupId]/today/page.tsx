import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveGroup } from "@/lib/active-group";
import { localDateISO, isoDaysAgo } from "@/lib/local-date";
import { q } from "@/lib/db-log";
import { TodayClient } from "./today-client";
import { TimezoneSync } from "./timezone-sync";
import { TodayLive } from "./today-live";

/**
 * Today, server-first (M3 — the core loop's home). Fetches this group's tasks,
 * my last-14-days counts, my streak, and the circle's today under RLS; all
 * interactivity (day picking, links) lives in the client leaf. The group comes
 * from the `/g/[groupId]` route param (CET-25).
 */
export default async function TodayPage({
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
  ] = await q(
    "today.reads (profile+tasks+streak+members)",
    Promise.all([
      supabase
        .from("profiles")
        .select("name, timezone")
        .eq("id", me)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select("id, label, subtitle, target_count")
        .eq("group_id", active.groupId)
        .order("sort_order"),
      supabase
        .from("streaks")
        .select("current")
        .eq("user_id", me)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select("user_id, profiles(name)")
        .eq("group_id", active.groupId),
    ]),
  );

  const tz = profile?.timezone ?? "UTC";
  const todayISO = localDateISO(tz);
  const taskIds = (tasks ?? []).map((t) => t.id);

  const [{ data: myLogs }, { data: todayLogs }] = await q(
    "today.logs (my 14d + circle today)",
    Promise.all([
      // my last fortnight (rings for the selected day + DayStrip done-marks)
      supabase
        .from("logs")
        .select("task_id, date, count")
        .eq("user_id", me)
        .in(
          "task_id",
          taskIds.length ? taskIds : ["00000000-0000-0000-0000-000000000000"],
        )
        .gte("date", isoDaysAgo(todayISO, 13)),
      // the whole circle's today (collective line + circle list)
      supabase
        .from("logs")
        .select("user_id, task_id, count")
        .eq("date", todayISO)
        .in(
          "task_id",
          taskIds.length ? taskIds : ["00000000-0000-0000-0000-000000000000"],
        ),
    ]),
  );

  // date → taskId → count (mine)
  const counts: Record<string, Record<string, number>> = {};
  for (const l of myLogs ?? []) {
    (counts[l.date] ??= {})[l.task_id] = l.count;
  }

  // circle: each member's closed-ring count today
  const byMember = new Map<string, Map<string, number>>();
  for (const l of todayLogs ?? []) {
    if (!byMember.has(l.user_id)) byMember.set(l.user_id, new Map());
    byMember.get(l.user_id)!.set(l.task_id, l.count);
  }
  const circle = (members ?? [])
    .map((m) => {
      const mine = byMember.get(m.user_id);
      const closed = (tasks ?? []).filter(
        (t) => (mine?.get(t.id) ?? 0) >= t.target_count,
      ).length;
      return {
        name: m.profiles?.name ?? "Member",
        closed,
        total: (tasks ?? []).length,
        isMe: m.user_id === me,
      };
    })
    .sort((a, b) => Number(b.isMe) - Number(a.isMe) || b.closed - a.closed);

  // collective: everyone's counts today vs the group-wide goal
  const total = (todayLogs ?? []).reduce((s, l) => s + l.count, 0);
  const goal =
    (members?.length ?? 0) *
    (tasks ?? []).reduce((s, t) => s + t.target_count, 0);
  const collectivePct = goal ? Math.round((total / goal) * 100) : 0;

  return (
    <>
      <TimezoneSync groupId={active.groupId} current={tz} />
      <TodayLive
        groupId={active.groupId}
        taskIds={(tasks ?? []).map((t) => t.id)}
      />
      <TodayClient
        groupId={active.groupId}
        firstName={(profile?.name ?? "Friend").split(" ")[0]}
        todayISO={todayISO}
        streak={streak?.current ?? 0}
        tasks={(tasks ?? []).map((t) => ({
          id: t.id,
          label: t.label,
          subtitle: t.subtitle,
          target: t.target_count,
        }))}
        counts={counts}
        circle={circle}
        collectivePct={collectivePct}
      />
    </>
  );
}
