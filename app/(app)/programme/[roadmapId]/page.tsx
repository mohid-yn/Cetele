import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { localDateISO } from "@/lib/local-date";
import { buttonVariants, Card, Screen } from "@/components/ui";
import {
  ArrowLeftIcon,
  CheckIcon,
  FlagIcon,
  UsersIcon,
} from "@/components/app/icons";
import { followsRoadmap } from "@/lib/my-roadmaps";
import { CatalogueView } from "./catalogue-view";
import { BUILDER_TABS, type BuilderTab } from "./builder-tabs";
import { ProgrammeBuilder } from "./programme-builder";
import {
  levelsOf,
  type LevelRequirement,
  type RoadmapCategory,
  type RoadmapItem,
} from "@/lib/roadmap";

/**
 * The programme itself, read-only — WHAT the work is, not who has done it.
 *
 * WHY IT EXISTS. The report next door answers "how far has everyone got", and
 * that was the only programme screen an organiser could reach: the member's
 * roadmap lives at `/roadmap` and is membership-gated, so a super
 * admin — who is deliberately in NO circle (D27) — could see the administration's
 * own programme measured but never read it. They could tell you Zayd had
 * finished level 2 and not what level 2 asks for.
 *
 * NOT group-scoped, for the same reason the report is not (D55): a programme is
 * one thing however many circles follow it. RLS decides who may read it —
 * `roadmap_items` / `_rewards` / `_level_requirements` are gated on following
 * the roadmap OR being a super admin (0025) — so this file adds no viewer check
 * at all and a member of a following circle can open it too.
 *
 * NO PROGRESS, deliberately. Every count here is the ITEM's target, never
 * anyone's `done`. The member's own screen is where progress is recorded, and a
 * second place to read it is a second place for it to disagree.
 */
export default async function ProgrammeCataloguePage({
  params,
  searchParams,
}: {
  params: Promise<{ roadmapId: string }>;
  searchParams: Promise<{ tab?: string; view?: string }>;
}) {
  const { roadmapId } = await params;
  const { tab, view } = await searchParams;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string | undefined;
  if (!me) redirect("/");

  const [{ data: roadmap }, { data: rows }, { data: reqs }, { data: rewards }] =
    await Promise.all([
      q(
        "catalogue.roadmap",
        supabase
          .from("roadmaps")
          .select("id, name, starts_on, ends_on, published")
          .eq("id", roadmapId)
          .maybeSingle(),
      ),
      q(
        "catalogue.items",
        supabase
          .from("roadmap_items")
          .select(
            "id, level, category, title, source, url, unit, target, compulsory, description, image_url, sort_order",
          )
          .eq("roadmap_id", roadmapId)
          .order("level")
          .order("sort_order")
          .order("title"),
      ),
      q(
        "catalogue.level requirements",
        supabase
          .from("roadmap_level_requirements")
          .select("level, category, min_total")
          .eq("roadmap_id", roadmapId),
      ),
      q(
        "catalogue.rewards",
        supabase
          .from("roadmap_rewards")
          .select("id, threshold, label, description")
          .eq("roadmap_id", roadmapId)
          .order("threshold"),
      ),
    ]);

  // RLS returning nothing and the id being wrong are the same answer here, and
  // that is correct: "there is no programme you may read at this address" tells
  // a stranger nothing about whether one exists.
  if (!roadmap) {
    return (
      <Screen>
        <BackLink />
        <Card padding="md">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <FlagIcon aria-hidden className="size-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              No roadmap here
            </p>
            <p className="max-w-xs text-sm text-balance text-muted-foreground">
              It may not exist, or it may not be open to you.
            </p>
          </div>
        </Card>
      </Screen>
    );
  }

  // `done` is required by the shared types and is meaningless on this screen —
  // it is pinned to 0 so nothing here can accidentally render as progress.
  const items: RoadmapItem[] = (rows ?? []).map((i) => ({
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
    done: 0,
  }));

  // Which items anyone has RECORDED against (0030). It decides what the
  // authoring controls will let an organiser touch: the fields completion is
  // computed from freeze per item, and an item nobody has worked on can still
  // be removed outright. Read straight from `roadmap_progress`, which RLS
  // already scopes — an organiser reads every row, so their answer is the same
  // one the RPC will give when the form is submitted.
  const { data: recordedRows } = await q(
    "catalogue.recorded items (authoring locks)",
    supabase
      .from("roadmap_progress")
      .select("item_id, done, roadmap_items!inner(roadmap_id)")
      .eq("roadmap_items.roadmap_id", roadmapId)
      .gt("done", 0),
  );
  const recorded = new Set((recordedRows ?? []).map((r) => r.item_id));
  const sortOrderOf = new Map((rows ?? []).map((i) => [i.id, i.sort_order]));

  const requirements: LevelRequirement[] = (reqs ?? []).map((r) => ({
    level: r.level,
    category: r.category as RoadmapCategory,
    minTotal: r.min_total,
  }));

  const levels = levelsOf(items);

  // WHO may edit. For rendering the controls only — `set_roadmap_item_content`
  // refuses a non-organiser regardless, so hiding the pencil is courtesy and
  // not the gate. Read off `profiles` because the `private` schema is not
  // exposed to PostgREST, exactly as the report does it.
  const { data: viewer } = await q(
    "catalogue.viewer (is_super_admin — controls only)",
    supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", me)
      .maybeSingle(),
  );
  const canEdit = viewer?.is_super_admin ?? false;

  // WHO MAY READ THE COHORT — an organiser, or whoever leads a circle that
  // follows this programme (0035, D69). Asked of the DATABASE rather than
  // assembled here: it is `can_read_roadmap_progress`' third arm, and a second
  // copy in TypeScript is the drift this whole area keeps refusing to grow.
  const { data: canReadCohort } = await q(
    "catalogue.may read the cohort (0035)",
    supabase.rpc("can_read_roadmap_cohort", { p_roadmap: roadmapId }),
  );

  // THE WAY TO THE VIEWER'S OWN RECORD. This screen never records progress.
  const { data: myCircles } = await q(
    "catalogue.my circles (log my progress)",
    supabase
      .from("memberships")
      .select("groups(group_roadmaps(roadmap_id))")
      .eq("user_id", me),
  );
  const myProgressHref =
    roadmap.published && followsRoadmap(myCircles ?? [], roadmapId)
      ? `/roadmap?r=${roadmapId}`
      : null;

  // Who may edit. Only decides which screen renders: every RPC behind the builder
  // refuses a non-organiser on its own.
  if (canEdit && view !== "member") {
    const [{ data: circles }, { data: reachMembers }, { data: profile }] =
      await Promise.all([
        q(
          "catalogue.circles (0037)",
          supabase.rpc("roadmap_circles", { p_roadmap: roadmapId }),
        ),
        q(
          "catalogue.reach (0038)",
          supabase.rpc("roadmap_reach", { p_roadmap: roadmapId }),
        ),
        q(
          "catalogue.profile (timezone)",
          supabase
            .from("profiles")
            .select("timezone")
            .eq("id", me)
            .maybeSingle(),
        ),
      ]);

    return (
      <ProgrammeBuilder
        roadmap={{
          id: roadmap.id,
          name: roadmap.name,
          startsOn: roadmap.starts_on,
          endsOn: roadmap.ends_on,
          published: roadmap.published,
        }}
        items={items}
        requirements={requirements}
        rewards={rewards ?? []}
        circles={(circles ?? []).map((c) => ({
          id: c.group_id,
          name: c.name,
          memberCount: c.member_count,
          following: c.following,
        }))}
        reachMembers={reachMembers ?? 0}
        recordedIds={[...recorded]}
        sortOrders={[...sortOrderOf]}
        canReadCohort={Boolean(canReadCohort)}
        myProgressHref={myProgressHref}
        todayISO={localDateISO(profile?.timezone ?? "UTC")}
        initialTab={
          BUILDER_TABS.includes(tab as BuilderTab)
            ? (tab as BuilderTab)
            : "items"
        }
      />
    );
  }

  return (
    <Screen>
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted px-4 py-2">
          <p className="text-sm font-medium text-foreground">
            Preview of what members see
          </p>
          <Link
            href={`/programme/${roadmapId}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back to editing
          </Link>
        </div>
      ) : (
        <BackLink />
      )}

      <div>
        <h1 className="font-display text-2xl font-bold wrap-anywhere text-foreground">
          {roadmap.name}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
          {levels.length} {levels.length === 1 ? "level" : "levels"},{" "}
          {items.length} {items.length === 1 ? "item" : "items"}
        </p>
      </div>

      {myProgressHref && (
        <Link
          href={myProgressHref}
          className={buttonVariants({
            variant: "tonal",
            size: "sm",
            className: "self-start",
          })}
        >
          <CheckIcon aria-hidden className="size-4" />
          Log my progress
        </Link>
      )}

      {/* For whoever leads a circle, and nobody else (D69). The cohort is an
          administrative reading, so the door to it is administrative too. */}
      {canReadCohort && !canEdit && (
        <Link
          href={`/programme/${roadmapId}/progress`}
          className={buttonVariants({
            variant: "tonal",
            size: "sm",
            className: "self-start",
          })}
        >
          <UsersIcon aria-hidden className="size-4" />
          Members&rsquo; progress
        </Link>
      )}

      <CatalogueView
        items={items}
        requirements={requirements}
        rewards={rewards ?? []}
      />
    </Screen>
  );
}

function BackLink() {
  return (
    <Link
      href="/programme"
      className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon aria-hidden className="size-4" /> Roadmaps
    </Link>
  );
}
