import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { localDateISO, isoDaysAgo } from "@/lib/local-date";
import { groupHref } from "@/lib/group-href";
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
  const { data: logs } = await supabase
    .from("logs")
    .select("date, count")
    .eq("user_id", me)
    .eq("task_id", task.id)
    .gte("date", isoDaysAgo(todayISO, 13));

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
      timeZone={timeZone}
      task={{
        id: task.id,
        label: task.label,
        subtitle: task.subtitle,
        target: task.target_count,
      }}
      todayISO={todayISO}
      initialDate={initialDate}
      initialCounts={counts}
    />
  );
}
