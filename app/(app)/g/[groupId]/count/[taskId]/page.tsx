import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { localDateISO, isoDaysAgo } from "@/lib/local-date";
import { groupHref } from "@/lib/group-href";
import { effectiveGoal } from "@/lib/goals";
import { toConfigVersions } from "@/lib/task-config";
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
      .select("id, label, subtitle, target_count")
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
  const [{ data: logs }, { data: myGoal }, { data: versionRows }] =
    await Promise.all([
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
    ]);

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
        // `target` is the circle's share — what "done" means, and the only
        // number the streak and the rollup ever see. `goal` is what THIS
        // member is aiming at. They are equal unless the member raised it.
        target: task.target_count,
        goal: effectiveGoal(task.target_count, myGoal?.target_count),
      }}
      todayISO={todayISO}
      initialDate={initialDate}
      initialCounts={counts}
      versions={toConfigVersions(versionRows)}
    />
  );
}
