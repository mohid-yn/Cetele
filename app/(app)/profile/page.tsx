import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { ProfileClient, type ReminderTask } from "./profile-client";

/**
 * Profile — the last screen off the mock (M8/M9). Identity + reminders (D30) +
 * push (D10) + appearance + account.
 *
 * Reminders are per TASK and span every circle the member belongs to (a reminder
 * is a personal setting, not a group one), so the tasks are read across all
 * their memberships under RLS.
 */
export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub as string | undefined;
  if (!me) redirect("/");

  const [{ data: profile }, { data: memberships }, { data: streak }] = await q(
    "profile.reads (profile+memberships+streak)",
    Promise.all([
      supabase.from("profiles").select("name").eq("id", me).maybeSingle(),
      supabase
        .from("memberships")
        .select("group_id, role, groups(name)")
        .eq("user_id", me),
      supabase
        .from("streaks")
        .select("current")
        .eq("user_id", me)
        .maybeSingle(),
    ]),
  );

  const groupIds = (memberships ?? []).map((m) => m.group_id);

  // Tasks across every circle I'm in, plus my reminder for each (RLS: reminders
  // are self-only, so this can only ever return mine).
  const [{ data: tasks }, { data: reminders }] = await q(
    "profile.reads (tasks+reminders)",
    Promise.all([
      supabase
        .from("tasks")
        .select("id, label, group_id")
        .in("group_id", groupIds.length ? groupIds : [ZERO_UUID])
        .order("sort_order"),
      supabase
        .from("reminders")
        .select("task_id, time_of_day, enabled")
        .eq("user_id", me),
    ]),
  );

  const byTask = new Map(
    (reminders ?? []).map((r) => [
      r.task_id,
      { time: (r.time_of_day as string).slice(0, 5), enabled: r.enabled },
    ]),
  );
  const groupNames = new Map(
    (memberships ?? []).map((m) => [m.group_id, m.groups?.name ?? "Circle"]),
  );

  const reminderTasks: ReminderTask[] = (tasks ?? []).map((t) => ({
    taskId: t.id,
    label: t.label,
    groupName: groupNames.get(t.group_id) ?? "Circle",
    // Default to a sensible morning time until the member picks one.
    time: byTask.get(t.id)?.time ?? "07:00",
    enabled: byTask.get(t.id)?.enabled ?? false,
  }));

  const primary = (memberships ?? [])[0];

  return (
    <ProfileClient
      name={profile?.name ?? "You"}
      role={primary?.role ?? null}
      groupName={primary ? (primary.groups?.name ?? null) : null}
      streak={streak?.current ?? 0}
      tasks={reminderTasks}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
    />
  );
}

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
