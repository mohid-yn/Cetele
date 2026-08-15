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
import { toConfigVersions, targetOn } from "@/lib/task-config";
import { toShares, shareOn, effectiveTarget } from "@/lib/shares";
import {
  suggestFor,
  type LinkableTask,
  type LinkedSibling,
} from "@/lib/task-links";
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
    { data: myMemberships },
    { data: linkRows },
  ] = await q(
    "today.reads (group+profile+tasks+streak+members+membership+links)",
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
      // Every circle I am in — for the linked-task offers in "My goals" (D66),
      // which are cross-circle by definition. Own-row and indexed, so it costs
      // this batch nothing; whether it returns more than one decides whether
      // the heavier read below runs at all.
      supabase.from("memberships").select("group_id").eq("user_id", me),
      // My links (0034, D64). Own-row RLS and invisible to admins by design, so
      // this can only ever return mine — including rows pointing at circles I
      // have LEFT, which is how a dormant link is still offered a Remove.
      supabase
        .from("member_task_links")
        .select("task_id, cluster_id")
        .eq("user_id", me),
    ]),
  );

  const tz = profile?.timezone ?? "UTC";
  const todayISO = localDateISO(tz);
  const taskIds = (tasks ?? []).map((t) => t.id);

  // ---- What the linked-task offers need (D64/D66) ---------------------------
  // Both inputs come from the batch ABOVE, so these reads join the batch below
  // rather than forming a third round trip. That is not a micro-optimisation:
  // as a waterfall it made Today slower for exactly the members who have more
  // than one circle — the population this feature exists for, and the one that
  // grows — on the hottest screen in the app.
  const otherGroupIds = (myMemberships ?? [])
    .map((m) => m.group_id)
    .filter((id) => id !== active.groupId);
  // A link always spans two circles, so a member in this one alone has nothing
  // to be offered; and with no links either, these reads can only come back
  // empty. Most members are in one circle and now pay nothing for the feature.
  const anyLinkWork = otherGroupIds.length > 0 || (linkRows ?? []).length > 0;
  const otherGroupFilter = otherGroupIds.length
    ? otherGroupIds
    : ["00000000-0000-0000-0000-000000000000"];

  const [
    [
      { data: myLogs },
      { data: todayLogs },
      { data: reactions },
      { data: myGoals },
      { data: assignmentRows },
      { data: versionRows },
      { data: shareRows },
    ],
    [{ data: otherTaskRows }, { data: otherAssignmentRows }],
  ] = await Promise.all([
    q(
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
        // How much of each task is asked of each MEMBER (0032). The whole
        // circle's rows, like the assignments above and for the same reason: the
        // roster below scores every member, and the collective goal is the SUM of
        // what each carrier is asked for. ALL intervals, so the day-strip measures
        // a past day against the share in force that day.
        supabase
          .from("member_task_shares")
          .select(
            "task_id, user_id, target_count, effective_from, effective_to",
          )
          .in(
            "task_id",
            taskIds.length ? taskIds : ["00000000-0000-0000-0000-000000000000"],
          ),
      ]),
    ),
    anyLinkWork
      ? q(
          "today.reads (my other circles' tasks + assignments)",
          Promise.all([
            // What a linked sibling is CALLED, and which cross-circle task is
            // worth offering. Scoped to circles I am STILL in, so a link into
            // one I have left simply does not resolve — which is how a dormant
            // row is detected, and the same answer `private.linked_tasks` gives
            // the fan-out itself (0019's rule).
            supabase
              .from("tasks")
              .select("id, label, group_id, groups(name)")
              .in("group_id", otherGroupFilter),
            // Read SEPARATELY from this circle's assignments, and that is not a
            // duplicate: `assignmentRows` is filtered to THIS circle's task ids,
            // so a cross-circle candidate has no row in it at all and
            // `assignedOn` answers false for every one of them. Offers vanished
            // entirely until this was added. Bounded through the embedded task,
            // since `task_assignments` has no group of its own.
            supabase
              .from("task_assignments")
              .select(
                "task_id, user_id, assigned_at, unassigned_at, tasks!inner()",
              )
              .in("tasks.group_id", otherGroupFilter),
          ]),
        )
      : ([{ data: null }, { data: null }] as const),
  ]);

  const assignments = toAssignments(assignmentRows);
  const versions = toConfigVersions(versionRows);
  const shares = toShares(shareRows);

  // ---- Linked tasks, for the offers in "My goals" (D64/D66) -----------------
  // taskId → the cluster it is already in.
  const clusterByTask: Record<string, string> = {};
  for (const l of linkRows ?? []) clusterByTask[l.task_id] = l.cluster_id;

  const otherAssignments = toAssignments(otherAssignmentRows);

  // Candidates for an offer: only tasks that are MINE today. One assigned to
  // other members (D54) is not mine to link — the fan-out would write counts
  // into a circle that is not asking me for them.
  const linkCandidates: LinkableTask[] = (otherTaskRows ?? [])
    .filter((t) => assignedOn(otherAssignments, t.id, me, todayISO, tz))
    .map((t) => ({
      taskId: t.id,
      label: t.label,
      groupId: t.group_id,
      groupName: t.groups?.name ?? "another circle",
    }));

  // taskId → its name and circle, for naming a sibling already linked.
  const knownTask = new Map(
    (otherTaskRows ?? []).map((t) => [
      t.id,
      { label: t.label, groupName: t.groups?.name ?? "another circle" },
    ]),
  );

  /** The tasks already in this one's cluster — dormant ones included. */
  const siblingsOf = (taskId: string): LinkedSibling[] => {
    const cluster = clusterByTask[taskId];
    if (!cluster) return [];
    return (linkRows ?? [])
      .filter((l) => l.cluster_id === cluster && l.task_id !== taskId)
      .map((l) => {
        const known = knownTask.get(l.task_id);
        return {
          taskId: l.task_id,
          // Null rather than a placeholder invented here: a task in a circle I
          // have left is not readable under `tasks_select_member`, so its name
          // is something this screen genuinely does not know.
          label: known?.label ?? null,
          groupName: known?.groupName ?? null,
          dormant: !known,
        };
      });
  };

  /** What this member owes for this task on this day — the page's single
   *  expression of it, mirroring `private.effective_target`. */
  const targetFor = (
    userId: string,
    task: { id: string; target_count: number },
    date: string,
    zone: string,
  ) =>
    effectiveTarget(
      shareOn(shares, task.id, userId, date, zone),
      targetOn(versions, task.id, date, zone, task.target_count),
    );

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
      // Against THEIR share, not the circle's default (0032) — a member
      // carrying 500 has not closed the ring at 100, and one carrying the
      // circle's number is unaffected.
      const closed = theirs.filter(
        (t) =>
          (mine?.get(t.id) ?? 0) >=
          targetFor(m.user_id, t, todayOf(m.user_id), tzOf(m.user_id)),
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
      // The SUM of each carrier's own share (0032), not `target × carriers`:
      // once a circle splits a task unequally the product is simply the wrong
      // number, and the bar would either overfill or never close.
      collectiveGoal(currentAssignees(assignments, t.id), [...memberIds], (u) =>
        targetFor(u, t, todayOf(u), tzOf(u)),
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
          // `target` is what the circle asks of ME (0032) — my share if I
          // have one, else the circle's default. It is the only number the
          // streak, the rollup, the circle list and the collective read.
          target: targetFor(me, t, todayISO, tz),
          goal: effectiveGoal(
            targetFor(me, t, todayISO, tz),
            goalByTask.get(t.id),
          ),
          // The schedule (0021). The client resolves "due today?" and "how many
          // days until it comes round" from these, so the answer follows the
          // member's OWN midnight (D34) rather than the server's.
          frequencyDays: t.frequency_days,
          myFrequencyDays: freqByTask.get(t.id) ?? null,
          // On MY calendar, like `private.obligations` resolves it (0024) —
          // slicing the string takes the date in whatever offset PostgREST
          // happened to render, which is the UTC reduction this replaced.
          createdOn: timestampDateISO(tz, t.created_at),
          // Linked tasks (D64), as the goals dialog draws them (D66): what this
          // act already covers, and the one circle worth offering next.
          links: siblingsOf(t.id),
          // The unprompted hint on the row. The FULL menu goes down separately
          // as `linkCandidates` — the row suggests, the pane offers everything.
          linkSuggestion: suggestFor(
            {
              taskId: t.id,
              label: t.label,
              groupId: active.groupId,
              groupName: group?.name ?? "this circle",
            },
            linkCandidates,
            clusterByTask,
          ),
        }))}
        me={me}
        assignments={assignments}
        versions={versions}
        shares={shares}
        // Already computed above for the row hints, and already scoped to what
        // is MINE today — so the link pane's full menu costs this page nothing
        // beyond passing it down.
        linkCandidates={linkCandidates}
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
