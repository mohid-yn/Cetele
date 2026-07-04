import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { localDateISO, isoDaysAgo } from "@/lib/local-date";
import { CountClient } from "./count-client";

/**
 * Count screen, server-first shell (M3). The task + my fortnight of counts
 * load under RLS; the tap pad itself is the optimistic client leaf.
 */
export default async function CountPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const [{ taskId }, { date: paramDate }] = await Promise.all([
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
      .maybeSingle(), // RLS: visible only to the task's group members
    supabase.from("profiles").select("timezone").eq("id", me).maybeSingle(),
  ]);

  if (!task) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center text-muted-foreground">
        <div>
          <p>That task no longer exists.</p>
          <Link
            href="/today"
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

  const todayISO = localDateISO(profile?.timezone ?? "UTC");
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
