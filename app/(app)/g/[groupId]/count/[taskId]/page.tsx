import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { localDateISO, isoDaysAgo } from "@/lib/local-date";
import { groupHref } from "@/lib/group-href";
import { effectiveGoal } from "@/lib/goals";
import { toConfigVersions, targetOn } from "@/lib/task-config";
import { toShares, shareOn, effectiveTarget } from "@/lib/shares";
import { CountClient } from "./count-client";

/**
 * Count screen, server-first shell (M3). The task + my fortnight of counts
 * load under RLS; the tap pad itself is the optimistic client leaf. The group
 * comes from the `/g/[groupId]` route param (CET-25).
 */
export default async function CountPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string; taskId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const [{ groupId, taskId }, { date: paramDate }] = await Promise.all([
    params,
    searchParams,
  ]);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string;

  const [{ data: task }, { data: profile }] = await Promise.all([
    supabase
      .from("tasks")
      // The embedded link is how this screen learns it is part of one act (0034,
      // D64) WITHOUT a query of its own. `member_task_links` is own-row under
      // RLS, so the embed can only ever return the viewer's — and for the member
      // who has no links, which is nearly all of them, the whole feature costs
      // this page nothing. A separate parallel read here measurably slowed the
      // hottest screen in the app.
      .select(
        "id, label, subtitle, target_count, member_task_links(cluster_id)",
      )
      .eq("id", taskId)
      // Pin the task to the group in the URL, so /g/<other>/count/<task> can't
      // render a task under a group it doesn't belong to. RLS already limits
      // tasks to their group's members, so this doubles as the membership
      // check — no extra round-trip (the sibling pages' resolveGroup call).
      .eq("group_id", groupId)
      .maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", me).maybeSingle(),
  ]);

  if (!task) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center text-muted-foreground">
        <div>
          <p>That task no longer exists.</p>
          <Link
            href={groupHref(groupId, "/today")}
            className={buttonVariants({
              variant: "outline",
              className: "mt-4",
            })}
          >
            Back to today
          </Link>
        </div>
      </div>
    );
  }

  const timeZone = profile?.timezone ?? "UTC";
  const todayISO = localDateISO(timeZone);
  const [
    { data: logs },
    { data: myGoal },
    { data: versionRows },
    { data: shareRows },
  ] = await Promise.all([
    supabase
      .from("logs")
      .select("date, count")
      .eq("user_id", me)
      .eq("task_id", task.id)
      .gte("date", isoDaysAgo(todayISO, 13)),
    // My own raised bar for this task, if I have set one (D51). RLS scopes
    // member_task_goals to own-rows, so the user filter is precision, not
    // safety — and no peer's goal can be read here even by mistake.
    supabase
      .from("member_task_goals")
      .select("target_count")
      .eq("user_id", me)
      .eq("task_id", task.id)
      .maybeSingle(),
    // What this task has asked for over time (0024). ALL intervals, not just
    // the live one: the day-strip below marks a fortnight of past days done,
    // and each has to be measured against the target IT asked for — otherwise
    // an admin raising the bar un-ticks every day already kept, while the
    // streak (correctly) still counts them.
    supabase
      .from("task_config_versions")
      .select(
        "task_id, target_count, frequency_days, effective_from, effective_to",
      )
      .eq("task_id", task.id),
    // And how much of it was asked of ME (0032) — the same argument one layer
    // in. A circle may split this task unequally, and the day-strip has to
    // mark each past day against the share in force on that day.
    supabase
      .from("member_task_shares")
      .select("task_id, user_id, target_count, effective_from, effective_to")
      .eq("task_id", task.id)
      .eq("user_id", me),
  ]);

  const versions = toConfigVersions(versionRows);
  const shares = toShares(shareRows);

  // Where else this tap lands (D64). The member said these tasks are one act, so
  // logging here writes the same raw count into each of them — and a screen that
  // moved numbers in a circle the member was not looking at without saying so is
  // exactly what D51/D61 rule out.
  //
  // `tasks!inner` does the dormancy filter for free: a sibling in a circle the
  // member has LEFT is not readable under `tasks_select_member`, the inner join
  // drops it, and that is the same answer `private.linked_tasks` gives the
  // fan-out itself (0019's rule). What is not named here is not written either.
  const myCluster = task.member_task_links[0]?.cluster_id;
  const { data: siblingRows } = myCluster
    ? await supabase
        .from("member_task_links")
        .select("task_id, tasks!inner(label, groups(name))")
        .eq("user_id", me)
        .eq("cluster_id", myCluster)
        .neq("task_id", task.id)
    : { data: null };

  const alsoCounts = (siblingRows ?? []).map((s) => ({
    label: s.tasks.label,
    groupName: s.tasks.groups?.name ?? "another circle",
  }));
  // What the circle asks of ME for this task today — my share if I have one,
  // else its default. `goal` then stacks my own private stretch on top.
  const myTarget = effectiveTarget(
    shareOn(shares, task.id, me, todayISO, timeZone),
    targetOn(versions, task.id, todayISO, timeZone, task.target_count),
  );

  const counts: Record<string, number> = {};
  for (const l of logs ?? []) counts[l.date] = l.count;

  // Honour a ?date from Today when it sits inside the back-fill window (D8).
  const initialDate =
    paramDate && paramDate <= todayISO && paramDate >= isoDaysAgo(todayISO, 13)
      ? paramDate
      : todayISO;

  return (
    <CountClient
      groupId={groupId}
      userId={me}
      timeZone={timeZone}
      task={{
        id: task.id,
        label: task.label,
        subtitle: task.subtitle,
        // `target` is MY share — what "done" means for me, and the only number
        // the streak and the rollup ever see (the circle's default unless an
        // admin raised me, D61). `goal` is what I am aiming at on top of it.
        // They are equal unless I raised it myself.
        target: myTarget,
        goal: effectiveGoal(myTarget, myGoal?.target_count),
      }}
      todayISO={todayISO}
      initialDate={initialDate}
      initialCounts={counts}
      versions={versions}
      shares={shares}
      alsoCounts={alsoCounts}
    />
  );
}
