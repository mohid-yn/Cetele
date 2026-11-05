import { redirect } from "next/navigation";
import { resolveGroup } from "@/lib/active-group";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { NoRoadmap } from "./no-roadmap";

/**
 * A kept link to a circle's roadmap. The screen itself is personal now, at
 * `/roadmap` (D75), because progress belongs to the member and not the circle.
 * This forwards to it, carrying a roadmap this circle follows, and explains
 * itself for a circle that follows none.
 */
export default async function GroupRoadmapRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  const { groupId } = await params;
  const { r: wanted } = await searchParams;

  const active = await resolveGroup(groupId);
  if (!active) redirect("/groups");

  const supabase = await createClient();
  const { data } = await q(
    "groupRoadmap.followed programmes",
    supabase
      .from("group_roadmaps")
      .select("roadmap_id, roadmaps(starts_on, published)")
      .eq("group_id", groupId),
  );

  const followed = (data ?? [])
    .filter((row) => row.roadmaps?.published)
    .sort((a, b) => b.roadmaps!.starts_on.localeCompare(a.roadmaps!.starts_on));

  if (followed.length === 0) {
    return <NoRoadmap groupId={groupId} canFollow={active.role !== "member"} />;
  }

  const chosen =
    followed.find((row) => row.roadmap_id === wanted) ?? followed[0];
  redirect(`/roadmap?r=${chosen.roadmap_id}`);
}
