import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { Badge, buttonVariants, Card, Screen } from "@/components/ui";
import { SectionHeading } from "@/components/app/section-heading";
import {
  ArrowLeftIcon,
  BookIcon,
  PlayIcon,
  FlagIcon,
  UsersIcon,
} from "@/components/app/icons";
import { RewardLadder } from "@/components/app/roadmap-rewards";
import { RoadmapCover } from "@/components/app/roadmap-cover";
import { ItemEditor } from "./item-editor";
import { ProgrammeAdmin } from "./programme-admin";
import { ItemFormButton } from "./item-form";
import { RewardsEditor } from "./rewards-editor";
import {
  CATEGORY_LABEL,
  categoriesAt,
  itemsAt,
  itemsIn,
  isSafeItemUrl,
  levelsOf,
  requirementFor,
  type LevelRequirement,
  type RoadmapCategory,
  type RoadmapItem,
} from "@/lib/roadmap";

/**
 * The programme itself, read-only — WHAT the work is, not who has done it.
 *
 * WHY IT EXISTS. The report next door answers "how far has everyone got", and
 * that was the only programme screen an organiser could reach: the member's
 * roadmap lives at `/g/[groupId]/roadmap` and is membership-gated, so a super
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
}: {
  params: Promise<{ roadmapId: string }>;
}) {
  const { roadmapId } = await params;

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
              No programme here
            </p>
            <p className="max-w-xs text-sm text-balance text-muted-foreground">
              Either it doesn&rsquo;t exist, or it isn&rsquo;t one you can read.
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

  return (
    <Screen>
      <BackLink />

      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          {roadmap.name}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {levels.length} {levels.length === 1 ? "level" : "levels"} ·{" "}
          {items.length} {items.length === 1 ? "item" : "items"} · what the
          programme asks for
        </p>
      </div>

      {/* The organiser's controls for the programme itself (D59): publish or
          withdraw it, rename it, move its window, delete it while nobody has
          worked on it. Above the reward ladder because publishing is the thing
          that decides whether any of what follows is visible at all. */}
      {canEdit && (
        <ProgrammeAdmin
          roadmapId={roadmapId}
          name={roadmap.name}
          startsOn={roadmap.starts_on}
          endsOn={roadmap.ends_on}
          published={roadmap.published}
          recorded={recorded.size > 0}
        />
      )}

      {/* The OTHER reading of this same programme, at the same id: this screen
          says what it asks for, that one says who has done it (D59). Offered to
          every reader rather than only an organiser — the report is RLS-scoped,
          so a circle's admin sees their members and a plain member sees
          themselves, which is exactly what each is entitled to. */}
      <Link
        href={`/programme/${roadmapId}/progress`}
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className: "self-start",
        })}
      >
        <UsersIcon aria-hidden className="size-4" />
        Members&rsquo; progress
      </Link>

      {canEdit && (
        <RewardsEditor
          roadmapId={roadmapId}
          rewards={(rewards ?? []).map((r) => ({
            id: r.id,
            threshold: r.threshold,
            label: r.label,
            description: r.description,
          }))}
          recorded={recorded.size > 0}
        />
      )}

      {/* The read-only ladder is for whoever is NOT editing. An organiser has
          the editor above, which lists the same label, level and promise —
          rendering both put two "Rewards" headings on the screen, one of them
          a control and one of them a picture of the same three rows. */}
      {!canEdit && rewards && rewards.length > 0 && (
        <section>
          <SectionHeading>Rewards</SectionHeading>
          <Card padding="md">
            {/* levelsDone={0}: this screen has no reader's progress on it and
                must not imply one. Every rung reads as still to earn, which is
                what the programme looks like described rather than measured. */}
            <RewardLadder
              rewards={rewards}
              levelsDone={0}
              totalLevels={levels.length}
            />
          </Card>
        </section>
      )}

      {levels.length === 0 ? (
        <Card padding="md">
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              This programme has no work on it yet.
            </p>
            {/* The first item has no level section to hang off, so the button
                lives here instead — without it a newly created programme is a
                dead end on the very screen that made it. */}
            {canEdit && (
              <ItemFormButton
                roadmapId={roadmapId}
                level={1}
                nextSortOrder={1}
              />
            )}
          </div>
        </Card>
      ) : (
        levels.map((level) => (
          <section key={level}>
            <SectionHeading
              action={
                canEdit ? (
                  <ItemFormButton
                    roadmapId={roadmapId}
                    level={level}
                    nextSortOrder={itemsAt(items, level).length + 1}
                  />
                ) : undefined
              }
            >
              Level {level}
            </SectionHeading>
            <div className="flex flex-col gap-3">
              {categoriesAt(items, level).map((category) => {
                const group = itemsIn(items, level, category);
                const req = requirementFor(requirements, level, category);
                return (
                  <Card key={category} padding="none">
                    <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        {CATEGORY_LABEL[category]}
                      </h3>
                      {/* A budgeted category is a MENU with a total, not a list
                          to finish — saying so here is the difference between
                          "watch all of these" and "choose 600 minutes of them". */}
                      <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {req
                          ? `choose ${req.minTotal} ${group[0]?.unit ?? ""}`
                          : `${group.length} to complete`}
                      </p>
                    </div>
                    <ul className="divide-y divide-border">
                      {group.map((i) => (
                        <li key={i.id} className="flex items-start gap-3 p-4">
                          <RoadmapCover
                            imageUrl={i.imageUrl}
                            className="w-12"
                            fallback={
                              <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                                {i.category === "listening" ? (
                                  <PlayIcon aria-hidden className="size-4" />
                                ) : (
                                  <BookIcon aria-hidden className="size-4" />
                                )}
                              </div>
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium wrap-anywhere text-foreground">
                              <span>{i.title}</span>
                              {i.compulsory && (
                                <Badge variant="primary" size="sm">
                                  Required
                                </Badge>
                              )}
                            </p>
                            {i.source && (
                              <p className="text-xs wrap-anywhere text-muted-foreground">
                                {i.source}
                              </p>
                            )}
                            {i.description && (
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed wrap-anywhere text-muted-foreground">
                                {i.description}
                              </p>
                            )}
                            {isSafeItemUrl(i.url) && (
                              <a
                                href={i.url!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-block text-xs wrap-anywhere text-primary underline underline-offset-2"
                              >
                                {i.url}
                              </a>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {/* A target of 1 in its own unit ("1 book") is
                                  noise; the title already says what it is. */}
                              {i.target === 1 ? "" : `${i.target} ${i.unit}`}
                            </p>
                            {canEdit && (
                              // Horizontal, and only TWO controls: three
                              // stacked buttons made every row 150px tall on a
                              // list of forty-six. Removal lives inside the
                              // shape dialog, where the item is already named.
                              <div className="flex shrink-0 items-center gap-1">
                                <ItemEditor
                                  item={{
                                    id: i.id,
                                    title: i.title,
                                    url: i.url,
                                    description: i.description,
                                    imageUrl: i.imageUrl,
                                  }}
                                />
                                <ItemFormButton
                                  roadmapId={roadmapId}
                                  item={{
                                    id: i.id,
                                    level: i.level,
                                    category: i.category,
                                    title: i.title,
                                    source: i.source,
                                    unit: i.unit,
                                    target: i.target,
                                    compulsory: i.compulsory,
                                    sortOrder: sortOrderOf.get(i.id) ?? 0,
                                    recorded: recorded.has(i.id),
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          </section>
        ))
      )}
    </Screen>
  );
}

function BackLink() {
  return (
    <Link
      href="/programme"
      className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" /> Back
    </Link>
  );
}
