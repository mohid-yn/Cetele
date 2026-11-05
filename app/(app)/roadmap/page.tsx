import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveGroup } from "@/lib/active-group";
import { groupHref } from "@/lib/group-href";
import { localDateISO } from "@/lib/local-date";
import { q } from "@/lib/db-log";
import type { Roadmap, RoadmapCategory } from "@/lib/roadmap";
import { RoadmapClient } from "./roadmap-client";

/**
 * The yearly roadmap — the administration's programme of external work
 * (playlists, books, sessions) with rewards at milestones (D55, migration 0025).
 *
 * THE MEMBER'S OWN SCREEN, not a circle's (D75). Progress is keyed on the member
 * and the item, so this lists every roadmap any of their circles follows, and
 * opening it leaves the selected circle alone. It used to live under
 * `/g/[groupId]`, which made the tab vanish whenever the selected circle was not
 * the one on the roadmap.
 *
 * Everything here is RLS-scoped rather than filtered in the query: a member who
 * is not in a circle following this programme reads no items and no rewards,
 * and `roadmap_progress` returns only rows the reader is entitled to. The
 * queries below say what they WANT; the database decides what they get.
 */
export default async function RoadmapPage({
  searchParams,
}: {
  /** `?r=<roadmapId>` — which programme, when they follow several. */
  searchParams: Promise<{ r?: string }>;
}) {
  const { r: wanted } = await searchParams;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string | undefined;
  if (!me) redirect("/");

  // The window is counted on the MEMBER's calendar (D34), so the zone is read
  // before any date is derived — never the server's.
  const [{ data: memberships }, { data: profile }] = await Promise.all([
    q(
      "roadmap.followed programmes (all my circles)",
      supabase
        .from("memberships")
        .select(
          "groups(group_roadmaps(roadmaps(id, name, starts_on, published)))",
        )
        .eq("user_id", me),
    ),
    q(
      "roadmap.profile (timezone)",
      supabase.from("profiles").select("timezone").eq("id", me).maybeSingle(),
    ),
  ]);

  const todayISO = localDateISO(profile?.timezone ?? "UTC");

  // Newest first, once each however many circles follow it. PUBLISHED is checked
  // here because an organiser's RLS also returns drafts, which no member sees.
  const byId = new Map<
    string,
    { id: string; name: string; starts_on: string }
  >();
  for (const m of memberships ?? []) {
    for (const row of m.groups?.group_roadmaps ?? []) {
      if (row.roadmaps?.published) byId.set(row.roadmaps.id, row.roadmaps);
    }
  }
  const followed = [...byId.values()].sort((a, b) =>
    b.starts_on.localeCompare(a.starts_on),
  );

  // Nothing to show means a typed URL or a kept link, since the tab is gone too.
  // The circle route explains why and offers an admin the control.
  if (followed.length === 0) {
    const active = await resolveActiveGroup();
    redirect(active ? groupHref(active.groupId, "/roadmap") : "/groups");
  }

  // `?r=` decides, and it is validated against what the circle actually
  // follows: an id the member is not entitled to must not select anything, and
  // an id from another circle would otherwise render that circle's programme
  // here. Falling back to the newest is what makes the bare URL work.
  const chosen = followed.find((x) => x.id === wanted) ?? followed[0];

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
        .eq("id", chosen.id)
        .maybeSingle(),
    ),
    q(
      "roadmap.items",
      supabase
        .from("roadmap_items")
        .select(
          "id, level, category, title, source, url, unit, target, compulsory, description, image_url",
        )
        .eq("roadmap_id", chosen.id)
        .order("level")
        .order("sort_order")
        .order("title"),
    ),
    q(
      "roadmap.rewards",
      supabase
        .from("roadmap_rewards")
        .select("id, threshold, label, description")
        .eq("roadmap_id", chosen.id)
        // Ascending by threshold — `nextReward` relies on that order.
        .order("threshold"),
    ),
    q(
      "roadmap.level requirements",
      supabase
        .from("roadmap_level_requirements")
        .select("level, category, min_total")
        .eq("roadmap_id", chosen.id),
    ),
  ]);

  // Who gets the strip of administrative links: the same question the hub and
  // the report ask of the database (0035, D69).
  const { data: canAdminister } = await q(
    "roadmap.may read the cohort (0035)",
    supabase.rpc("can_read_roadmap_cohort", { p_roadmap: chosen.id }),
  );

  // The roadmap row can vanish between the two reads if it is unpublished.
  if (!roadmap) redirect("/groups");

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
      description: i.description,
      imageUrl: i.image_url,
      done: doneByItem.get(i.id) ?? 0,
    })),
  };

  return (
    <RoadmapClient
      roadmap={model}
      todayISO={todayISO}
      programmes={followed.map((f) => ({ id: f.id, name: f.name }))}
      canAdminister={Boolean(canAdminister)}
    />
  );
}
