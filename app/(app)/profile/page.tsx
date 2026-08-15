import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveGroup } from "@/lib/active-group";
import { q } from "@/lib/db-log";
import { ProfileClient, type Reminder } from "./profile-client";

/**
 * Profile — the last screen off the mock (M8/M9). Identity + reminders (D30) +
 * push (D10) + appearance + account.
 *
 * Reminders belong to the MEMBER, not to a task or a circle (D62) — a name they
 * wrote and a time they picked — so this screen reads their own list and needs
 * nothing about their memberships to render it.
 *
 * LINKED TASKS USED TO LIVE HERE and moved to "My goals" (D66): "is this the
 * same thing I already do for my other circle?" is a question about a TASK,
 * asked while looking at that task, not a setting to be hunted for on a
 * cross-circle settings page.
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

  const myReminders: Reminder[] = (reminders ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    time: (r.time_of_day as string).slice(0, 5),
    enabled: r.enabled,
  }));

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
      deviceCount={deviceCount ?? 0}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
    />
  );
}
