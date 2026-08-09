import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { Card, ProgressBar, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { ArrowLeftIcon, FlagIcon } from "@/components/app/icons";
import { CohortShape } from "@/components/app/roadmap-cohort";
import {
  levelDistribution,
  levelsComplete,
  levelsOf,
  type RoadmapCategory,
} from "@/lib/roadmap";

/**
 * Who has got how far on ONE programme (D55, scoped per roadmap in D59).
 *
 * SCOPED, and that is the correction rather than a refinement. This screen used
 * to stack every programme the reader could see, one section each: a cohort
 * strip and a full roster per programme, on a single unbounded page. But an
 * administrator's question is never "how is everyone doing across everything" —
 * the levels differ, the rewards differ, the contribution is paid per programme
 * (D55), and two cohorts in one column invite a comparison that means nothing.
 * So the programme is chosen FIRST and this page answers for that one.
 *
 * Nested under `/programme/[roadmapId]` on purpose: the same id names the
 * catalogue next door, so "what does it ask for" and "who has done it" are two
 * readings of one thing rather than two screens that happen to mention it.
 *
 * ONE route for both readers, and that is the design rather than a shortcut:
 * `roadmap_progress`'s RLS policy already answers "whose progress may this
 * person see" — their own, their circle's members if they are its admin and it
 * follows the programme, everyone if they are a super admin. So this screen
 * asks for all of it and renders what comes back. There is no viewer check in
 * this file at all, which means there is no second copy of the rule to drift
 * from the first, and no way for an app-level filter to be more generous than
 * the database.
 *
 * It is also why the route is NOT group-scoped: progress is keyed on the member
 * (D55), a super admin need not be in any circle, and a member on one programme
 * through two circles is one person with one record, not two rows to reconcile.
 *
 * THE BOUNDARY (D26/D27 — no god view): this file reads roadmap tables and
 * profile NAMES. Nothing else. No `logs`, no `streaks`, no `daily_completion`,
 * no circle. A programme is work the administration set and rewards it hands
 * out; a circle's dhikr is none of its business. pgTAP 014 pins the negative.
 */
export default async function ProgrammeReportPage({
  params,
}: {
  params: Promise<{ roadmapId: string }>;
}) {
  const { roadmapId } = await params;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string | undefined;
  if (!me) redirect("/");

  const [
    { data: roadmap },
    { data: rows },
    { data: reqs },
    { data: roster },
    { data: viewer },
  ] = await Promise.all([
    q(
      "report.roadmap",
      supabase
        .from("roadmaps")
        .select(
          "id, name, roadmap_items(id, level, category, title, source, url, unit, target, compulsory, description, image_url)",
        )
        .eq("id", roadmapId)
        .maybeSingle(),
    ),
    q(
      "report.progress (RLS decides whose)",
      supabase
        .from("roadmap_progress")
        .select(
          "user_id, item_id, done, profiles(name), roadmap_items!inner(roadmap_id)",
        )
        // Filtered through the embedded resource — an `!inner` join, so a row
        // whose item belongs to another programme is dropped by the DATABASE
        // rather than by a `.filter()` here. The rows are still RLS-scoped
        // first; this only narrows what was already permitted.
        .eq("roadmap_items.roadmap_id", roadmapId),
    ),
    q(
      "report.level requirements",
      supabase
        .from("roadmap_level_requirements")
        .select("level, category, min_total")
        .eq("roadmap_id", roadmapId),
    ),
    // WHO IS ON THE PROGRAMME, including the people at zero. Built from
    // progress alone, this screen could not see them: a member who had
    // recorded nothing had no row, so "has not started" and "is not enrolled"
    // rendered identically — and the person an admin most needs to notice is
    // the one who has not begun. Absence cannot be read out of the table that
    // records presence, so it comes from membership instead, through an RPC
    // carrying the SAME three readers as the progress policy (0025). It answers
    // for every programme at once, so the narrowing to this one happens below.
    q("report.roster", supabase.rpc("roadmap_roster")),
    // WHICH READER this is — for the footer only, never for filtering. The
    // rows above are already scoped by RLS, and re-deciding the audience in
    // app code is the second copy of the rule this file's header refuses to
    // grow. It is read off `profiles` rather than `private.is_super_admin()`
    // because the private schema is not exposed to PostgREST (0002), and the
    // self arm of `profiles_select_self_or_shared` covers your own row.
    q(
      "report.viewer (is_super_admin — copy only)",
      supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", me)
        .maybeSingle(),
    ),
  ]);

  const isSuperAdmin = viewer?.is_super_admin ?? false;

  // RLS returning nothing and the id being wrong are the same answer here, and
  // that is correct: "there is no programme you may read at this address" tells
  // a stranger nothing about whether one exists. Same wording as the catalogue
  // next door, because it is the same situation.
  if (!roadmap) {
    return (
      <Screen>
        <BackLink roadmapId={roadmapId} />
        <EmptyCard
          title="No programme here"
          body="Either it doesn’t exist, or it isn’t one you can read."
        />
      </Screen>
    );
  }

  const catalogue = (roadmap.roadmap_items ?? []).map((i) => ({
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

  const requirements = (reqs ?? []).map((x) => ({
    level: x.level,
    category: x.category as RoadmapCategory,
    minTotal: x.min_total,
  }));

  const totalLevels = levelsOf(catalogue).length;

  // Keyed on the MEMBER alone now that the programme is fixed — a person in two
  // circles on this programme is still one row (D55).
  const byUser = new Map<string, { name: string; done: Map<string, number> }>();

  // The roster goes in FIRST, so everyone enrolled has an entry before any
  // progress lands. Someone who has recorded nothing keeps an empty `done` map
  // and scores zero levels honestly, rather than vanishing.
  for (const p of roster ?? []) {
    if (p.roadmap_id !== roadmapId) continue;
    byUser.set(p.user_id, {
      name: p.name ?? "Unknown",
      done: new Map<string, number>(),
    });
  }

  for (const r of rows ?? []) {
    // A progress row with no roster entry is ordinary and must not be dropped:
    // it is how a member who has LEFT every circle on the programme still reads
    // their own record (nothing earned is ever revoked, §4).
    const entry = byUser.get(r.user_id) ?? {
      name: r.profiles?.name ?? "Unknown",
      done: new Map<string, number>(),
    };
    entry.done.set(r.item_id, r.done);
    byUser.set(r.user_id, entry);
  }

  // Levels, not items — the unit the programme is built in and rewarded on, and
  // the same rule the member's own screen uses. `levelsComplete` mirrors
  // `private.levels_complete` (0025), so this screen and the database agree on
  // who has finished what. The agreement is a TESTED claim, not a hope: pgTAP
  // 014 asserts the cases against the SQL and `lib/roadmap.test.ts` asserts the
  // same cases against this mirror.
  const people = [...byUser.entries()]
    .map(([userId, entry]) => ({
      userId,
      name: entry.name,
      levels: levelsComplete(
        catalogue.map((i) => ({ ...i, done: entry.done.get(i.id) ?? 0 })),
        requirements,
      ),
    }))
    .sort(
      // Furthest along first — this screen exists to answer "who has earned the
      // contribution", and that reading should not need scrolling.
      (a, b) => b.levels - a.levels || a.name.localeCompare(b.name),
    );

  return (
    <Screen>
      <BackLink roadmapId={roadmapId} />

      <PageHeader
        title="Members' progress"
        subtitle={
          <span className="text-balance">
            <span className="font-semibold text-foreground">
              {roadmap.name}
            </span>{" "}
            · how far each person has got. Roadmap progress only — nothing from
            their circle.
          </span>
        }
        action={
          people.length > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {people.length} {people.length === 1 ? "person" : "people"}
            </span>
          ) : undefined
        }
      />

      {people.length === 0 ? (
        <EmptyCard
          title="Nothing recorded yet"
          body="People on a circle’s programme show up here, whether or not they have started."
        />
      ) : (
        <>
          {/* The cohort SHAPE, not just its members. A list of names answers
              "how is Yusuf doing"; the administration's question is "how many
              have got how far", because the contribution is paid per level. */}
          <CohortShape
            distribution={levelDistribution(
              people.map((p) => p.levels),
              totalLevels,
            )}
            total={totalLevels}
          />
          <Card padding="none">
            <ul className="divide-y divide-border">
              {people.map((person) => {
                const pct = totalLevels
                  ? Math.round((person.levels / totalLevels) * 100)
                  : 0;
                return (
                  <li key={person.userId} className="p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {person.name}
                      </p>
                      <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {person.levels} of {totalLevels} levels
                      </p>
                    </div>
                    <ProgressBar value={pct} className="mt-2 h-1.5" />
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}

      {/* Say which reader this is. The old line described exactly one of the
          three — "your own circles' members if you lead one" — and a super
          admin, who leads nothing and is looking at every circle at once, was
          reading a caption about somebody else's view of the same screen. */}
      <p className="px-1 text-center text-xs text-muted-foreground">
        {isSuperAdmin
          ? "You are an organiser, so this is everyone on every circle following this programme."
          : "You see the people whose progress you are entitled to — your own circles’ members if you lead one."}{" "}
        <Link href="/programme" className="underline">
          All programmes
        </Link>
      </p>
    </Screen>
  );
}

/** Up to the programme itself — the parent this route is nested under. */
function BackLink({ roadmapId }: { roadmapId: string }) {
  return (
    <Link
      href={`/programme/${roadmapId}`}
      className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" /> Back
    </Link>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card padding="md">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <FlagIcon aria-hidden className="size-6" />
        </div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="max-w-xs text-sm text-balance text-muted-foreground">
          {body}
        </p>
      </div>
    </Card>
  );
}
