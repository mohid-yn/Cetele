import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { Card, ProgressBar, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import { ArrowLeftIcon, FlagIcon } from "@/components/app/icons";
import { CohortShape } from "@/components/app/roadmap-cohort";
import {
  levelDistribution,
  levelsComplete,
  levelsOf,
  type RoadmapCategory,
} from "@/lib/roadmap";

/**
 * Who has got how far on a programme (D55).
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
export default async function ProgrammeReportPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string | undefined;
  if (!me) redirect("/");

  const [
    { data: roadmaps },
    { data: rows },
    { data: reqs },
    { data: roster },
    { data: viewer },
  ] = await Promise.all([
    q(
      "programme.roadmaps",
      supabase
        .from("roadmaps")
        .select(
          "id, name, ends_on, roadmap_items(id, level, category, title, source, url, unit, target, compulsory)",
        )
        .order("starts_on", { ascending: false }),
    ),
    q(
      "programme.progress (RLS decides whose)",
      supabase
        .from("roadmap_progress")
        .select(
          "user_id, item_id, done, profiles(name), roadmap_items!inner(roadmap_id)",
        ),
    ),
    q(
      "programme.level requirements",
      supabase
        .from("roadmap_level_requirements")
        .select("roadmap_id, level, category, min_total"),
    ),
    // WHO IS ON THE PROGRAMME, including the people at zero. Built from
    // progress alone, this screen could not see them: a member who had
    // recorded nothing had no row, so "has not started" and "is not enrolled"
    // rendered identically — and the person an admin most needs to notice is
    // the one who has not begun. Absence cannot be read out of the table that
    // records presence, so it comes from membership instead, through an RPC
    // carrying the SAME three readers as the progress policy (0025).
    q("programme.roster", supabase.rpc("roadmap_roster")),
    // WHICH READER this is — for the footer only, never for filtering. The
    // rows above are already scoped by RLS, and re-deciding the audience in
    // app code is the second copy of the rule this file's header refuses to
    // grow. It is read off `profiles` rather than `private.is_super_admin()`
    // because the private schema is not exposed to PostgREST (0002), and the
    // self arm of `profiles_select_self_or_shared` covers your own row.
    q(
      "programme.viewer (is_super_admin — copy only)",
      supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", me)
        .maybeSingle(),
    ),
  ]);

  const isSuperAdmin = viewer?.is_super_admin ?? false;

  // Levels, not items — the unit the programme is built in and rewarded on, and
  // the same rule the member's own screen uses. `levelsComplete` mirrors
  // `private.levels_complete` (0025), so this screen and the database agree on
  // who has finished what. The agreement is a TESTED claim, not a hope: pgTAP
  // 014 asserts the cases against the SQL and `lib/roadmap.test.ts` asserts the
  // same cases against this mirror. (This comment used to credit pgTAP with
  // both halves. It only ever ran the SQL — nothing executed the TypeScript at
  // all, and the unit suite is what closed that.)
  type Person = { userId: string; name: string; levels: number };

  // Keyed (member, roadmap) — a person on two programmes is two rows on this
  // screen, and a person in two circles on ONE programme is still one (D55).
  const progressByUser = new Map<
    string,
    { name: string; roadmapId: string; done: Map<string, number> }
  >();

  // The roster goes in FIRST, so everyone enrolled has an entry before any
  // progress lands. Someone who has recorded nothing keeps an empty `done` map
  // and scores zero levels honestly, rather than vanishing.
  for (const p of roster ?? []) {
    progressByUser.set(`${p.user_id}:${p.roadmap_id}`, {
      name: p.name ?? "Unknown",
      roadmapId: p.roadmap_id,
      done: new Map<string, number>(),
    });
  }

  for (const r of rows ?? []) {
    const roadmapId = r.roadmap_items?.roadmap_id;
    if (!roadmapId) continue;
    const key = `${r.user_id}:${roadmapId}`;
    // A progress row with no roster entry is ordinary and must not be dropped:
    // it is how a member who has LEFT every circle on the programme still reads
    // their own record (nothing earned is ever revoked, §4).
    const entry = progressByUser.get(key) ?? {
      name: r.profiles?.name ?? "Unknown",
      roadmapId,
      done: new Map<string, number>(),
    };
    entry.done.set(r.item_id, r.done);
    progressByUser.set(key, entry);
  }

  const programmes = (roadmaps ?? [])
    .map((r) => {
      const catalogue = (r.roadmap_items ?? []).map((i) => ({
        id: i.id,
        level: i.level,
        category: i.category as RoadmapCategory,
        title: i.title,
        source: i.source,
        url: i.url,
        unit: i.unit,
        target: i.target,
        compulsory: i.compulsory,
        done: 0,
      }));
      const requirements = (reqs ?? [])
        .filter((x) => x.roadmap_id === r.id)
        .map((x) => ({
          level: x.level,
          category: x.category as RoadmapCategory,
          minTotal: x.min_total,
        }));
      const totalLevels = levelsOf(catalogue).length;

      const people: Person[] = [];
      for (const [key, entry] of progressByUser) {
        if (entry.roadmapId !== r.id) continue;
        const items = catalogue.map((i) => ({
          ...i,
          done: entry.done.get(i.id) ?? 0,
        }));
        people.push({
          userId: key,
          name: entry.name,
          levels: levelsComplete(items, requirements),
        });
      }

      return {
        id: r.id,
        name: r.name,
        total: totalLevels,
        // The cohort SHAPE, not just its members. A list of names answers "how
        // is Yusuf doing"; the administration's question is "how many have got
        // how far", because the contribution is paid per level (D55).
        distribution: levelDistribution(
          people.map((p) => p.levels),
          totalLevels,
        ),
        people: people.sort(
          // Furthest along first — this screen exists to answer "who has earned
          // the contribution", and that reading should not need scrolling.
          (a, b) => b.levels - a.levels || a.name.localeCompare(b.name),
        ),
      };
    })
    .filter((p) => p.people.length > 0);

  return (
    <Screen>
      {/* This route is reachable from /groups and, for an organiser, from
          nowhere else — and it is not a nav tab, so without this the only way
          out was the browser's own back. The bottom bar does carry Groups, but
          a screen you arrived at by tapping a card should say how to leave. */}
      <Link
        href="/groups"
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> Back
      </Link>

      <PageHeader
        title="Programme"
        subtitle="How far each person has got. Roadmap progress only — nothing from their circle."
      />

      {programmes.length === 0 ? (
        <Card padding="md">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <FlagIcon aria-hidden className="size-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              Nothing recorded yet
            </p>
            <p className="max-w-xs text-sm text-balance text-muted-foreground">
              People on a circle&rsquo;s programme show up here, whether or not
              they have started.
            </p>
          </div>
        </Card>
      ) : (
        programmes.map((p) => (
          <section key={p.id}>
            {/* "on the programme", not "recording" — the roster now includes
                the people who have not started, and calling them recorders
                would be the same wrong answer in a different place. */}
            {/* The NAME opens the programme itself. An organiser could see it
                measured and never read it: the member's roadmap is at
                /g/[groupId]/roadmap and is membership-gated, and an organiser
                is deliberately in no circle (D27) — so they could tell you
                Zayd had finished level 2 and not what level 2 asks for. */}
            <SectionHeading
              action={`${p.people.length} ${p.people.length === 1 ? "person" : "people"}`}
            >
              <Link
                href={`/programme/${p.id}`}
                className="underline decoration-border underline-offset-4 hover:decoration-foreground"
              >
                {p.name}
              </Link>
            </SectionHeading>
            <CohortShape distribution={p.distribution} total={p.total} />
            <Card padding="none">
              <ul className="divide-y divide-border">
                {p.people.map((person) => {
                  const pct = p.total
                    ? Math.round((person.levels / p.total) * 100)
                    : 0;
                  return (
                    <li key={person.userId} className="p-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {person.name}
                        </p>
                        <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {person.levels} of {p.total} levels
                        </p>
                      </div>
                      <ProgressBar value={pct} className="mt-2 h-1.5" />
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ))
      )}

      {/* Say which reader this is. The old line described exactly one of the
          three — "your own circles' members if you lead one" — and a super
          admin, who leads nothing and is looking at every circle at once, was
          reading a caption about somebody else's view of the same screen. */}
      <p className="px-1 text-center text-xs text-muted-foreground">
        {isSuperAdmin
          ? "You are an organiser, so this is everyone on every circle following a programme."
          : "You see the people whose progress you are entitled to — your own circles’ members if you lead one."}{" "}
        <Link href="/groups" className="underline">
          Back to your circles
        </Link>
      </p>
    </Screen>
  );
}
