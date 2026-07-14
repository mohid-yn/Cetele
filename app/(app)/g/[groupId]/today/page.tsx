import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveGroup } from "@/lib/active-group";
import { localDateISO, isoDaysAgo } from "@/lib/local-date";
import { q } from "@/lib/db-log";
import {
  REACTIONS,
  detectLandmark,
  showWelcome,
  type Landmark,
  type ReactionKind,
} from "@/lib/retention";
import type { ReactionTally } from "@/components/app/peer-reactions";
import { TodayClient, type CircleMember } from "./today-client";
import { TodayLive } from "./today-live";
import { TimezoneSync } from "@/components/app/timezone-sync";

/** An empty tally — every kind at zero, nothing of mine. */
const emptyTally = (): ReactionTally =>
  Object.fromEntries(
    REACTIONS.map((r) => [r.kind, { count: 0, mine: false }]),
  ) as ReactionTally;

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
    { data: group },
    { data: profile },
    { data: tasks },
    { data: streak },
    { data: members },
    { data: myMembership },
  ] = await q(
    "today.reads (group+profile+tasks+streak+members+membership)",
    Promise.all([
      supabase
        .from("groups")
        .select("name")
        .eq("id", active.groupId)
        .maybeSingle(),
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
      // last_active drives the CET-19 comeback landmark.
      supabase
        .from("streaks")
        .select("current, last_active")
        .eq("user_id", me)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select("user_id, profiles(name)")
        .eq("group_id", active.groupId),
      // created_at → am I still new? (CET-21 endowed progress)
      supabase
        .from("memberships")
        .select("created_at")
        .eq("group_id", active.groupId)
        .eq("user_id", me)
        .maybeSingle(),
    ]),
  );

  const tz = profile?.timezone ?? "UTC";
  const todayISO = localDateISO(tz);
  const taskIds = (tasks ?? []).map((t) => t.id);

  const [{ data: myLogs }, { data: todayLogs }, { data: reactions }] = await q(
    "today.logs (my 14d + circle today + reactions)",
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
      // today's encouragements in this circle (CET-18) — RLS already scopes
      // these to circles I'm in, so the group filter is for precision, not safety.
      supabase
        .from("reactions")
        .select("from_user_id, to_user_id, kind")
        .eq("group_id", active.groupId)
        .eq("date", todayISO),
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
  // reactions → toUserId → kind tally (count, and whether I sent one)
  const tallies = new Map<string, ReactionTally>();
  for (const r of reactions ?? []) {
    if (!tallies.has(r.to_user_id)) tallies.set(r.to_user_id, emptyTally());
    const slot = tallies.get(r.to_user_id)![r.kind as ReactionKind];
    if (!slot) continue; // an unknown kind (a future glyph) — ignore, don't crash
    slot.count += 1;
    if (r.from_user_id === me) slot.mine = true;
  }

  const circle: CircleMember[] = (members ?? [])
    .map((m) => {
      const mine = byMember.get(m.user_id);
      const closed = (tasks ?? []).filter(
        (t) => (mine?.get(t.id) ?? 0) >= t.target_count,
      ).length;
      const total = (tasks ?? []).length;
      return {
        userId: m.user_id,
        name: m.profiles?.name ?? "Member",
        closed,
        total,
        isMe: m.user_id === me,
        // A finished peer is the one you can cheer (CET-18).
        done: total > 0 && closed >= total,
        tally: tallies.get(m.user_id) ?? emptyTally(),
      };
    })
    .sort((a, b) => Number(b.isMe) - Number(a.isMe) || b.closed - a.closed);

  // Encouragement I've received today — the glance that makes it feel social.
  const cheersForMe = Object.values(tallies.get(me) ?? emptyTally()).reduce(
    (s, k) => s + k.count,
    0,
  );

  // collective: everyone's counts today vs the group-wide goal. Counted over the
  // CURRENT members only (D41) — `logs` outlive a membership, so summing the raw
  // rows would keep counting someone who has left (the goal already scales to
  // the live member count, so an ex-member would push the ring past 100%).
  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const total = (todayLogs ?? [])
    .filter((l) => memberIds.has(l.user_id))
    .reduce((s, l) => s + l.count, 0);
  const goal =
    (members?.length ?? 0) *
    (tasks ?? []).reduce((s, t) => s + t.target_count, 0);
  const collectivePct = goal ? Math.round((total / goal) * 100) : 0;

  // ---- The two day-one / comeback banners -----------------------------------
  // CET-21: still new here, and yet to log anything → endowed progress.
  const myCountToday = (tasks ?? []).reduce(
    (s, t) => s + (byMember.get(me)?.get(t.id) ?? 0),
    0,
  );
  const welcome = showWelcome({
    joinedOn: myMembership?.created_at?.slice(0, 10) ?? null,
    todayISO,
    myCountToday,
  });

  // CET-19: a temporal landmark (or a comeback after a lapse), unless this
  // occurrence has already been dismissed. Skipped entirely for a new member —
  // they get the welcome above, and two banners would be a wall, not a nudge.
  let landmark: Landmark | null = welcome
    ? null
    : detectLandmark(todayISO, streak?.last_active ?? null);
  if (landmark) {
    const { data: dismissed } = await q(
      "today.banner_dismissals",
      supabase
        .from("banner_dismissals")
        .select("key")
        .eq("user_id", me)
        .eq("key", landmark.key)
        .maybeSingle(),
    );
    if (dismissed) landmark = null;
  }

  return (
    <>
      {/* D44 fallback: the zone normally lands at the auth callback, before any
          render. This catches a traveller or a pre-cookie account. It rides the
          `timezone` this page already fetched — no extra query, and NOT in the
          layout, where per-request auth work destabilised every screen. */}
      <TimezoneSync current={tz} />
      <TodayLive
        groupId={active.groupId}
        taskIds={(tasks ?? []).map((t) => t.id)}
      />
      <TodayClient
        groupId={active.groupId}
        groupName={group?.name ?? "your circle"}
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
        cheersForMe={cheersForMe}
        landmark={landmark}
        welcome={welcome}
      />
    </>
  );
}
