import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveGroup } from "@/lib/active-group";
import { localDateISO, isoDaysAgo, timestampDateISO } from "@/lib/local-date";
import { effectiveGoal } from "@/lib/goals";
import {
  assignedOn,
  collectiveGoal,
  currentAssignees,
  toAssignments,
} from "@/lib/assignments";
import { toConfigVersions } from "@/lib/task-config";
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
        .select("id, label, subtitle, target_count, frequency_days, created_at")
        .eq("group_id", active.groupId)
        .order("sort_order"),
      // last_active drives the CET-19 comeback landmark.
      supabase
        .from("streaks")
        .select("current, last_active")
        .eq("user_id", me)
        .maybeSingle(),
      // `timezone` too: every figure below that spans MEMBERS resolves each of
      // them on THEIR OWN day (§4 / D34), never on the viewer's.
      supabase
        .from("memberships")
        .select("user_id, profiles(name, timezone)")
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

  const [
    { data: myLogs },
    { data: todayLogs },
    { data: reactions },
    { data: myGoals },
    { data: assignmentRows },
    { data: versionRows },
  ] = await q(
    "today.logs (my 14d + circle today + reactions + my goals)",
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
      // The whole circle's today (collective line + circle list) — a RANGE, not
      // the viewer's single date. A member's "today" is their own (D34), so
      // when viewer and member straddle midnight the member's real
      // contribution lands on a date the viewer's calendar has not reached.
      // Pinning `.eq("date", todayISO)` dropped it: "the circle today" read 0
      // while that member's own Today showed the taps. Exactly the bug fixed on
      // the group hub on 2026-07-25 (§4) — this screen was left on the old
      // shape. One day either side covers every real offset (UTC-12…UTC+14);
      // each row is then matched against its own member's date below, so the
      // slack is inert.
      supabase
        .from("logs")
        .select("user_id, task_id, count, date")
        .gte("date", isoDaysAgo(todayISO, 1))
        .lte("date", isoDaysAgo(todayISO, -1))
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
      // My own raised bars for this circle's tasks (D51). RLS is own-row, so
      // this can only ever return mine — a peer's goal is not readable here,
      // which is also what keeps it out of the collective figures below.
      supabase
        .from("member_task_goals")
        .select("task_id, target_count, frequency_days")
        .eq("user_id", me)
        .in(
          "task_id",
          taskIds.length ? taskIds : ["00000000-0000-0000-0000-000000000000"],
        ),
      // Who each of this circle's tasks belongs to (0023). ALL intervals, not
      // just the open ones: the day-strip renders a fortnight, and a closed
      // interval is what says "this was mine last Tuesday". RLS scopes these to
      // circles I'm in; the whole circle's rows are read because the roster
      // below has to score each member against THEIR OWN list.
      supabase
        .from("task_assignments")
        .select("task_id, user_id, assigned_at, unassigned_at")
        .in(
          "task_id",
          taskIds.length ? taskIds : ["00000000-0000-0000-0000-000000000000"],
        ),
      // What each task has asked for over time (0024). ALL intervals, for the
      // same reason as the assignments above: the day-strip marks a fortnight
      // of past days done, and each one is measured against the target IT
      // asked for. Reading the live target would let an admin's raise un-tick
      // every day already kept, while the streak went on counting them.
      supabase
        .from("task_config_versions")
        .select(
          "task_id, target_count, frequency_days, effective_from, effective_to",
        )
        .in(
          "task_id",
          taskIds.length ? taskIds : ["00000000-0000-0000-0000-000000000000"],
        ),
    ]),
  );

  const assignments = toAssignments(assignmentRows);
  const versions = toConfigVersions(versionRows);

  // taskId → my raised bar, where I have one (D51)
  const goalByTask = new Map(
    (myGoals ?? []).map((g) => [g.task_id, g.target_count]),
  );
  // taskId → my own denser cycle, where I have one (0021)
  const freqByTask = new Map(
    (myGoals ?? []).map((g) => [g.task_id, g.frequency_days]),
  );

  // date → taskId → count (mine)
  const counts: Record<string, Record<string, number>> = {};
  for (const l of myLogs ?? []) {
    (counts[l.date] ??= {})[l.task_id] = l.count;
  }

  // Each member's own today (D34) — the day THEY are counting on, not the one
  // the viewer happens to be on.
  const memberTz = new Map(
    (members ?? []).map((m) => [m.user_id, m.profiles?.timezone ?? "UTC"]),
  );
  const tzOf = (u: string) => memberTz.get(u) ?? "UTC";
  const memberToday = new Map(
    (members ?? []).map((m) => [
      m.user_id,
      localDateISO(m.profiles?.timezone ?? "UTC"),
    ]),
  );
  const todayOf = (u: string) => memberToday.get(u) ?? todayISO;

  // circle: each member's closed-ring count on their own today. The range query
  // above returns three days, so every row is matched against its own member's
  // date — the two extra days exist only so a member ahead of or behind the
  // viewer is not silently missing.
  const byMember = new Map<string, Map<string, number>>();
  for (const l of todayLogs ?? []) {
    if (l.date !== todayOf(l.user_id)) continue;
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
      // Each member is scored against THEIR OWN list (0023) — a task they are
      // not assigned can neither be closed by them nor counted against them.
      // Scoring everyone against the circle's full list would show a member
      // permanently short by however many tasks they were never given.
      const theirs = (tasks ?? []).filter((t) =>
        assignedOn(
          assignments,
          t.id,
          m.user_id,
          todayOf(m.user_id),
          tzOf(m.user_id),
        ),
      );
      const closed = theirs.filter(
        (t) => (mine?.get(t.id) ?? 0) >= t.target_count,
      ).length;
      const total = theirs.length;
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
  //
  // The NUMERATOR is scoped to who carries each task, matching the denominator
  // below and the same figure on the group screen. Without it a member since
  // taken off a task keeps pushing the ring up against a goal that no longer
  // counts them — the two screens then report different percentages for the
  // same circle on the same day, which is worse than either being wrong.
  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const carriersOf = new Map(
    (tasks ?? []).map((t) => {
      const who = currentAssignees(assignments, t.id);
      return [t.id, who === null ? memberIds : new Set(who)];
    }),
  );
  const total = (todayLogs ?? [])
    .filter(
      (l) =>
        memberIds.has(l.user_id) &&
        l.date === todayOf(l.user_id) &&
        (carriersOf.get(l.task_id)?.has(l.user_id) ?? false),
    )
    .reduce((s, l) => s + l.count, 0);
  // The denominator is per TASK now (0023): a task two of eight members carry
  // asks for `target × 2`, not `target × 8`. Scaling it to the whole circle
  // would leave the ring structurally unable to reach 100% — the circle would
  // be shown a bar it cannot fill, which is exactly the "you are behind" read
  // D8 forbids.
  const goal = (tasks ?? []).reduce(
    (s, t) =>
      s +
      collectiveGoal(
        t.target_count,
        currentAssignees(assignments, t.id),
        members?.length ?? 0,
      ),
    0,
  );
  const collectivePct = goal ? Math.round((total / goal) * 100) : 0;

  // ---- The two day-one / comeback banners -----------------------------------
  // CET-21: still new here, and yet to log anything → endowed progress.
  const myCountToday = (tasks ?? []).reduce(
    (s, t) => s + (byMember.get(me)?.get(t.id) ?? 0),
    0,
  );
  const welcome = showWelcome({
    // On MY calendar (D34), not UTC: slicing the timestamp dates a member who
    // joined at 00:45 in Sydney to the previous day, and the welcome is gated on
    // "joined today".
    joinedOn: myMembership?.created_at
      ? timestampDateISO(tz, myMembership.created_at)
      : null,
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
        timeZone={tz}
        todayISO={todayISO}
        streak={streak?.current ?? 0}
        tasks={(tasks ?? []).map((t) => ({
          id: t.id,
          label: t.label,
          subtitle: t.subtitle,
          // Two numbers, deliberately kept apart (D51): `target` is the
          // circle's share — the only one the streak, the rollup, the circle
          // list and the collective above ever read — and `goal` is what this
          // member is aiming at.
          target: t.target_count,
          goal: effectiveGoal(t.target_count, goalByTask.get(t.id)),
          // The schedule (0021). The client resolves "due today?" and "how many
          // days until it comes round" from these, so the answer follows the
          // member's OWN midnight (D34) rather than the server's.
          frequencyDays: t.frequency_days,
          myFrequencyDays: freqByTask.get(t.id) ?? null,
          // On MY calendar, like `private.obligations` resolves it (0024) —
          // slicing the string takes the date in whatever offset PostgREST
          // happened to render, which is the UTC reduction this replaced.
          createdOn: timestampDateISO(tz, t.created_at),
        }))}
        me={me}
        assignments={assignments}
        versions={versions}
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
