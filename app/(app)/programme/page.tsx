import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { Card, ProgressBar, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import { FlagIcon } from "@/components/app/icons";
import { levelsComplete, levelsOf, type RoadmapCategory } from "@/lib/roadmap";

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

  const [{ data: roadmaps }, { data: rows }, { data: reqs }] =
    await Promise.all([
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
    ]);

  // Levels, not items — the unit the programme is built in and rewarded on, and
  // the same rule the member's own screen uses. `levelsComplete` mirrors
  // `private.levels_complete` (0025), so this screen and the database agree on
  // who has finished what; pgTAP 014 pins the mirror against the SQL.
  type Person = { userId: string; name: string; levels: number };

  const progressByUser = new Map<
    string,
    { name: string; roadmapId: string; done: Map<string, number> }
  >();

  for (const r of rows ?? []) {
    const roadmapId = r.roadmap_items?.roadmap_id;
    if (!roadmapId) continue;
    const key = `${r.user_id}:${roadmapId}`;
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
              Once people on a programme start recording, they show up here.
            </p>
          </div>
        </Card>
      ) : (
        programmes.map((p) => (
          <section key={p.id}>
            <SectionHeading action={`${p.people.length} recording`}>
              {p.name}
            </SectionHeading>
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

      <p className="px-1 text-center text-xs text-muted-foreground">
        You see the people whose progress you are entitled to — your own
        circles&rsquo; members if you lead one.{" "}
        <Link href="/groups" className="underline">
          Back to your circles
        </Link>
      </p>
    </Screen>
  );
}
