import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveGroup } from "@/lib/active-group";
import { localDateISO } from "@/lib/local-date";
import { q } from "@/lib/db-log";
import type { Roadmap, RoadmapCategory } from "@/lib/roadmap";
import { RoadmapClient } from "./roadmap-client";
import { NoRoadmap } from "./no-roadmap";

/**
 * The yearly roadmap — the administration's programme of external work
 * (playlists, books, sessions) with rewards at milestones (D55, migration 0025).
 *
 * Everything here is RLS-scoped rather than filtered in the query: a member who
 * is not in a circle following this programme reads no items and no rewards,
 * and `roadmap_progress` returns only rows the reader is entitled to. The
 * queries below say what they WANT; the database decides what they get.
 */
export default async function RoadmapPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  const active = await resolveGroup(groupId);
  if (!active) redirect("/groups");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string;

  // The window is counted on the MEMBER's calendar (D34), so the zone is read
  // before any date is derived — never the server's.
  const [{ data: group }, { data: profile }] = await Promise.all([
    q(
      "roadmap.group (roadmap_id)",
      supabase
        .from("groups")
        .select("roadmap_id")
        .eq("id", groupId)
        .maybeSingle(),
    ),
    q(
      "roadmap.profile (timezone)",
      supabase.from("profiles").select("timezone").eq("id", me).maybeSingle(),
    ),
  ]);

  const todayISO = localDateISO(profile?.timezone ?? "UTC");

  // A circle follows a programme by its owner's choice, and most circles follow
  // none (D55). The nav tab is conditional, so arriving here at all means a URL
  // was typed or a link was kept — answer it honestly rather than redirecting,
  // and tell an admin where the control is.
  if (!group?.roadmap_id) {
    return <NoRoadmap groupId={groupId} canFollow={active.role !== "member"} />;
  }

  const [
    { data: roadmap },
    { data: items },
    { data: rewards },
    { data: reqs },
  ] = await Promise.all([
    q(
      "roadmap.roadmap",
      supabase
        .from("roadmaps")
        .select("id, name, starts_on, ends_on")
        .eq("id", group.roadmap_id)
        .maybeSingle(),
    ),
    q(
      "roadmap.items",
      supabase
        .from("roadmap_items")
        .select(
          "id, level, category, title, source, url, unit, target, compulsory",
        )
        .eq("roadmap_id", group.roadmap_id)
        .order("level")
        .order("sort_order")
        .order("title"),
    ),
    q(
      "roadmap.rewards",
      supabase
        .from("roadmap_rewards")
        .select("id, threshold, label, description")
        .eq("roadmap_id", group.roadmap_id)
        // Ascending by threshold — `nextReward` relies on that order.
        .order("threshold"),
    ),
    q(
      "roadmap.level requirements",
      supabase
        .from("roadmap_level_requirements")
        .select("level, category, min_total")
        .eq("roadmap_id", group.roadmap_id),
    ),
  ]);

  // The roadmap row can be missing where the items are not: `roadmaps` is
  // readable only while PUBLISHED, and nothing un-follows a circle when a
  // programme is unpublished. Treat it as "not following" rather than crashing.
  if (!roadmap) {
    return <NoRoadmap groupId={groupId} canFollow={active.role !== "member"} />;
  }

  // Progress is keyed on (member, item) and never on a group (D55), so this
  // reads MY rows for these items — the same record a second circle following
  // the same programme would show.
  const { data: progress } = await q(
    "roadmap.progress (mine)",
    supabase.from("roadmap_progress").select("item_id, done").eq("user_id", me),
  );

  const doneByItem = new Map((progress ?? []).map((p) => [p.item_id, p.done]));

  const model: Roadmap = {
    id: roadmap.id,
    name: roadmap.name,
    startsOn: roadmap.starts_on,
    endsOn: roadmap.ends_on,
    rewards: (rewards ?? []).map((r) => ({
      id: r.id,
      threshold: r.threshold,
      label: r.label,
      description: r.description,
    })),
    requirements: (reqs ?? []).map((r) => ({
      level: r.level,
      category: r.category as RoadmapCategory,
      minTotal: r.min_total,
    })),
    items: (items ?? []).map((i) => ({
      id: i.id,
      level: i.level,
      category: i.category as RoadmapCategory,
      title: i.title,
      source: i.source,
      url: i.url,
      unit: i.unit,
      target: i.target,
      compulsory: i.compulsory,
      done: doneByItem.get(i.id) ?? 0,
    })),
  };

  return <RoadmapClient roadmap={model} todayISO={todayISO} />;
}
