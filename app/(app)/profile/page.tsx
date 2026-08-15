import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveGroup } from "@/lib/active-group";
import { q } from "@/lib/db-log";
import { localDateISO } from "@/lib/local-date";
import { assignedOn, toAssignments } from "@/lib/assignments";
import { suggestLinks, type LinkableTask } from "@/lib/task-links";
import type { LinkCluster, LinkedTask } from "@/components/app/task-links";
import { ProfileClient, type Reminder } from "./profile-client";

/**
 * Profile — the last screen off the mock (M8/M9). Identity + reminders (D30) +
 * push (D10) + linked tasks (D64) + appearance + account.
 *
 * THIS IS THE CROSS-CIRCLE SCREEN, and that is why both of the member's own
 * settings live here. A reminder belongs to the member, not to a task or a
 * circle (D62); a link is the member's claim that two circles are asking for one
 * act (D64), so it cannot belong to either of them. Neither has a home on a
 * `/g/[groupId]` screen without picking one circle to pretend it belongs to.
 */
export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub as string | undefined;
  if (!me) redirect("/");

  const [
    { data: profile },
    { data: memberships },
    { data: streak },
    { data: linkRows },
  ] = await q(
    "profile.reads (profile+memberships+streak+links)",
    Promise.all([
      // `timezone` too: the link suggestions below are drawn from the tasks
      // that are MINE TODAY, and "today" is the member's own day (D34).
      supabase
        .from("profiles")
        .select("name, timezone")
        .eq("id", me)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select("group_id, role, groups(name)")
        .eq("user_id", me),
      supabase
        .from("streaks")
        .select("current")
        .eq("user_id", me)
        .maybeSingle(),
      // My links (0034). Read in the FIRST batch, with the other own-row lookups,
      // because whether it is empty decides whether the second batch has to go
      // near `tasks` at all. RLS is own-row and a link is invisible to admins by
      // design, so this can only ever return mine — including rows pointing at
      // circles I have LEFT, which is 0019's dormancy rule: the row survives,
      // `private.linked_tasks` stops returning it, and the member keeps a control
      // to remove it.
      supabase
        .from("member_task_links")
        .select("task_id, cluster_id")
        .eq("user_id", me),
    ]),
  );

  // The circles I am in right now. A member in none still renders this screen,
  // so the sentinel keeps `in()` from being handed an empty list (the `taskIds`
  // pattern on Today).
  const myGroupIds = (memberships ?? []).map((m) => m.group_id);
  const groupFilter = myGroupIds.length
    ? myGroupIds
    : ["00000000-0000-0000-0000-000000000000"];

  /**
   * Is there anything to say about links at all?
   *
   * A link always spans two circles, so a member in one has nothing that can be
   * suggested — and if they have no links either, the two reads below can only
   * produce an empty section. Skipping them is not a micro-optimisation: EVERY
   * sign-out in the app goes through this screen, and the pair is the heaviest
   * thing on it (a task list and its assignment intervals, across every circle
   * the member belongs to). The single-circle member is the common case and now
   * pays nothing for a feature they cannot use.
   *
   * Links are checked as well as circle count, because a member who has LEFT a
   * circle can be down to one and still hold a cluster that has to render — the
   * dormant row and its Remove.
   */
  const anyLinkWork = myGroupIds.length > 1 || (linkRows ?? []).length > 0;

  // My own reminders (D62) — no longer one per task, so this reads the member's
  // list and nothing about any circle. RLS is self-only, so it can only ever
  // return mine.
  //
  // The device count is what lets the reminder rows tell the truth: a time with
  // no subscribed device anywhere is a setting that cannot fire. `head: true` so
  // this is a COUNT, not a fetch of every row — and RLS scopes it to me, so it
  // can only ever count my own devices.
  const [{ data: reminders }, { count: deviceCount }] = await q(
    "profile.reads (reminders+devices)",
    Promise.all([
      supabase
        .from("reminders")
        .select("id, label, time_of_day, enabled")
        // By clock time, which is the order the member experiences them in —
        // a list sorted by creation would scatter the morning through the day.
        .order("time_of_day")
        .eq("user_id", me),
      supabase
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", me),
    ]),
  );

  // The two reads the links section needs, and ONLY when it has something to
  // render (see `anyLinkWork`). A second round trip for the member who does have
  // links, and none at all for the one who does not — which is the trade this
  // screen wants, because the second case is nearly all of them.
  const [{ data: taskRows }, { data: assignmentRows }] = anyLinkWork
    ? await q(
        "profile.reads (link tasks+assignments)",
        Promise.all([
          // Every task in every circle I am STILL in. It answers two questions at
          // once: what a link's tasks are CALLED, and which pairs are worth
          // suggesting. A task missing from here is a task in a circle I have
          // left, and that absence is how a dormant link is detected — RLS will
          // not show me a task in a circle I am not in, so its label genuinely
          // cannot be drawn.
          //
          // The group filter is not redundant with RLS, which would return the
          // same rows on its own. Unfiltered, the policy is evaluated PER ROW
          // over the whole table — a `private.is_group_member` call for every
          // task in every circle in the database, growing with the product's
          // size rather than with mine. The `in` puts the index in front of it.
          supabase
            .from("tasks")
            .select("id, label, group_id, groups(name)")
            .in("group_id", groupFilter),
          // Who each of those tasks belongs to (0023). A task scoped to other
          // members (D54) is not mine to link: the fan-out would write counts
          // into a circle that is not asking me for them.
          //
          // Bounded through the embedded task rather than by a second round
          // trip: `task_assignments` has no group of its own, and `!inner` lets
          // the same group filter reach it.
          supabase
            .from("task_assignments")
            .select(
              "task_id, user_id, assigned_at, unassigned_at, tasks!inner()",
            )
            .in("tasks.group_id", groupFilter),
        ]),
      )
    : [{ data: null }, { data: null }];

  const myReminders: Reminder[] = (reminders ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    time: (r.time_of_day as string).slice(0, 5),
    enabled: r.enabled,
  }));

  // ---- Linked tasks (D64) ---------------------------------------------------
  const tz = profile?.timezone ?? "UTC";
  const todayISO = localDateISO(tz);
  const assignments = toAssignments(assignmentRows);

  // taskId → what it is called and where it lives, for every circle I am in.
  const known = new Map(
    (taskRows ?? []).map((t) => [
      t.id,
      {
        label: t.label,
        groupId: t.group_id,
        groupName: t.groups?.name ?? "a circle",
      },
    ]),
  );

  // taskId → the cluster it is already in. Both halves below read this: the
  // clusters are its inverse, and a suggestion is dropped when a pair is
  // already one act.
  const clusterByTask: Record<string, string> = {};
  for (const l of linkRows ?? []) clusterByTask[l.task_id] = l.cluster_id;

  const grouped = new Map<string, LinkedTask[]>();
  for (const l of linkRows ?? []) {
    const t = known.get(l.task_id);
    if (!grouped.has(l.cluster_id)) grouped.set(l.cluster_id, []);
    grouped.get(l.cluster_id)!.push({
      taskId: l.task_id,
      // Null, not a placeholder invented here: a task in a circle I have left is
      // not readable under `tasks_select_member`, so the name is a thing this
      // screen genuinely does not know. The row says so rather than guessing.
      label: t?.label ?? null,
      groupName: t?.groupName ?? null,
      dormant: !t,
    });
  }

  const clusters: LinkCluster[] = [...grouped.entries()]
    .map(([clusterId, tasks]) => ({
      clusterId,
      // Live tasks first, then dormant ones — a cluster reads as "these are one
      // act", and the circles I have left are a footnote to that, not the point.
      tasks: tasks.sort(
        (a, b) =>
          Number(a.dormant) - Number(b.dormant) ||
          (a.groupName ?? "").localeCompare(b.groupName ?? ""),
      ),
    }))
    // Alphabetical by the first name in the cluster, so the list does not
    // reshuffle between visits (D63's argument about a scannable list).
    .sort((a, b) =>
      (a.tasks[0]?.label ?? "").localeCompare(b.tasks[0]?.label ?? ""),
    );

  // Only tasks that are MINE today may be suggested — a task assigned to other
  // members is one nothing is asking me for, and linking it would fan my taps
  // into a circle's total under a name that is not on my list.
  const mine: LinkableTask[] = (taskRows ?? [])
    .filter((t) => assignedOn(assignments, t.id, me, todayISO, tz))
    .map((t) => ({
      taskId: t.id,
      label: t.label,
      groupId: t.group_id,
      groupName: t.groups?.name ?? "a circle",
    }));

  const suggestions = suggestLinks(mine, clusterByTask);

  // A member in one circle has nothing to link, and the section says so rather
  // than showing an empty list under a heading — a link only ever spans circles.
  const multiCircle = (memberships ?? []).length > 1;

  // The identity pill reflects the group you're actually in — the active /
  // last-visited group (D26 cookie), not an arbitrary first membership row.
  // Falls back to the first membership if there's no active group resolved.
  const active = await resolveActiveGroup();
  const primary =
    (active &&
      (memberships ?? []).find((m) => m.group_id === active.groupId)) ||
    (memberships ?? [])[0];

  return (
    <ProfileClient
      name={profile?.name ?? "You"}
      role={primary?.role ?? null}
      groupName={primary ? (primary.groups?.name ?? null) : null}
      streak={streak?.current ?? 0}
      reminders={myReminders}
      linkClusters={clusters}
      linkSuggestions={suggestions}
      multiCircle={multiCircle}
      deviceCount={deviceCount ?? 0}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
    />
  );
}
