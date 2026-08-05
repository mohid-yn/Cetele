import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { Card, ProgressBar, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import { FlagIcon } from "@/components/app/icons";

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

  const [{ data: roadmaps }, { data: rows }] = await Promise.all([
    q(
      "programme.roadmaps",
      supabase
        .from("roadmaps")
        .select("id, name, ends_on, roadmap_items(id)")
        .order("starts_on", { ascending: false }),
    ),
    q(
      "programme.progress (RLS decides whose)",
      supabase
        .from("roadmap_progress")
        .select(
          "user_id, done, profiles(name), roadmap_items!inner(id, roadmap_id, target)",
        ),
    ),
  ]);

  // An item counts as complete at its own target — the same rule the member's
  // screen uses (`isItemComplete`), applied to somebody else's row.
  type Person = { name: string; complete: number };
  const byRoadmap = new Map<string, Map<string, Person>>();

  for (const r of rows ?? []) {
    const item = r.roadmap_items;
    if (!item) continue;
    const people = byRoadmap.get(item.roadmap_id) ?? new Map<string, Person>();
    const person = people.get(r.user_id) ?? {
      name: r.profiles?.name ?? "Unknown",
      complete: 0,
    };
    if (r.done >= item.target) person.complete += 1;
    people.set(r.user_id, person);
    byRoadmap.set(item.roadmap_id, people);
  }

  const programmes = (roadmaps ?? [])
    .map((r) => ({
      id: r.id,
      name: r.name,
      total: r.roadmap_items?.length ?? 0,
      people: [...(byRoadmap.get(r.id)?.values() ?? [])].sort(
        // Furthest along first — this screen exists to answer "who is ready for
        // the retreat place", and that reading should not need scrolling.
        (a, b) => b.complete - a.complete || a.name.localeCompare(b.name),
      ),
    }))
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
                {p.people.map((person, i) => {
                  const pct = p.total
                    ? Math.round((person.complete / p.total) * 100)
                    : 0;
                  return (
                    <li key={`${person.name}-${i}`} className="p-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {person.name}
                        </p>
                        <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {person.complete} of {p.total} items
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
