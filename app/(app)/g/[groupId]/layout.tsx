import { RememberActiveGroup } from "@/components/app/remember-active-group";
import { PublishGroupRoadmap } from "@/components/app/publish-group-roadmap";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";

/**
 * Wraps every group-scoped screen (`/g/[groupId]/…`). Records the active group
 * client-side (RememberActiveGroup) once a page here actually mounts — so a
 * prefetch of some other circle's route can't rewrite it (see the proxy note) —
 * and publishes whether this circle follows a programme, for the nav's
 * conditional Roadmap tab (Q7).
 *
 * WHY THE QUERY IS HERE AND NOWHERE HIGHER. The nav needs a per-group DB fact,
 * and the app shell (`app/(app)/layout.tsx`) deliberately does no auth and no DB
 * work: per-request auth there once took e2e from 15/15 to 7/15, because the
 * shell wraps EVERY request in the app. This layout is not the shell. It runs
 * only under `/g/`, it persists across the sub-tabs and re-runs only when the
 * groupId segment changes, and every page beneath it is already doing exactly
 * this kind of read. So the cost is one cheap select per circle visited, not one
 * per request app-wide — which is the distinction §4 is actually about.
 *
 * RLS scopes `groups` to its members, so a non-member gets no row and no tab;
 * the page underneath redirects them anyway.
 */
export default async function GroupScopedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  const supabase = await createClient();
  const { data: group } = await q(
    "groupLayout.roadmap_id (nav tab)",
    supabase
      .from("groups")
      .select("roadmap_id")
      .eq("id", groupId)
      .maybeSingle(),
  );

  return (
    <>
      <RememberActiveGroup groupId={groupId} />
      <PublishGroupRoadmap
        groupId={groupId}
        hasRoadmap={group?.roadmap_id != null}
      />
      {children}
    </>
  );
}
