import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { Card, Screen, buttonVariants } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import { ChevronRightIcon, FlagIcon, UsersIcon } from "@/components/app/icons";
import { levelsOf } from "@/lib/roadmap";

/**
 * The roadmap hub — the administration's programmes, and the way in to both
 * things you can do with one (D59).
 *
 * WHY IT EXISTS. The report used to live at this address, so an organiser's
 * only entry point landed them on a list of PEOPLE, and the programme itself —
 * the catalogue, and the item editor on it (D57) — was behind a section heading
 * that happened to be a link. Two jobs, one screen, and the one you reach for
 * to fix a wrong URL was the hidden one. This screen is the fork: the
 * programmes are the content, "Members' progress" is one tap away, and the
 * Roadmap tab in the nav lands here for an organiser (who is in no circle by
 * role, D27, and so has no group-scoped roadmap to land on instead).
 *
 * NO VIEWER CHECK, exactly as the two screens either side of it. RLS on
 * `roadmaps` returns the published programmes the reader is entitled to — the
 * ones their circles follow, or all of them for an organiser (0025) — so what
 * is listed here is the database's answer rather than a second copy of the rule.
 * A member of a following circle who types the URL gets their own programme and
 * a report containing only themselves, which is true and harmless.
 */
export default async function ProgrammeHubPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string | undefined;
  if (!me) redirect("/");

  const [{ data: roadmaps }, { data: viewer }] = await Promise.all([
    q(
      "programmeHub.roadmaps",
      supabase
        .from("roadmaps")
        // `level` alone — this screen counts the shape of a programme, it never
        // renders an item. Pulling titles and cover art here would be a page of
        // data for a line of text.
        .select("id, name, starts_on, ends_on, roadmap_items(level)")
        .order("starts_on", { ascending: false }),
    ),
    // WHICH READER this is, for the empty state and the footer — never as a
    // filter. Read off `profiles` because the private schema is not exposed to
    // PostgREST (0002), exactly as the report and the catalogue do it.
    q(
      "programmeHub.viewer (is_super_admin — copy only)",
      supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", me)
        .maybeSingle(),
    ),
  ]);

  const isSuperAdmin = viewer?.is_super_admin ?? false;

  const programmes = (roadmaps ?? [])
    .map((r) => ({
      id: r.id,
      name: r.name,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      // `levelsOf` rather than a max: a programme with levels 1 and 3 has two
      // levels, and this is the same function the report and the member's own
      // screen count with.
      levels: levelsOf(r.roadmap_items ?? []).length,
      items: (r.roadmap_items ?? []).length,
    }))
    // THE TWO POLICIES DISAGREE ON PURPOSE, and this is where that shows.
    // `roadmaps` is readable to anyone once PUBLISHED — that is how an admin
    // picks one to follow in Manage — while the items behind it are gated on
    // actually following it (0025), because the content and the rewards are the
    // administration's promises to circles it has enrolled. So a programme
    // nobody here follows comes back as a name with nothing in it, and listing
    // it would read as "0 levels · 0 items": a broken programme rather than
    // someone else's. An organiser reads every one, so for them an empty
    // programme really is empty and stays on the list.
    .filter((p) => isSuperAdmin || p.items > 0);

  return (
    <Screen>
      <PageHeader
        title="Roadmap"
        subtitle="The programmes the administration sets, and how everyone is getting on with them."
      />

      {/* The one primary action on this screen (accent = earned action, and
          exactly one per view). It is NOT gated on a programme existing:
          checking would cost a query, and the report answers "nothing recorded
          yet" honestly — an entry that vanishes leaves nowhere to go. */}
      <Link
        href="/programme/progress"
        className={buttonVariants({
          variant: "accent",
          // Full width on a phone, natural width above it — the same rule the
          // roadmap screen's strip follows, so a rose bar does not run the
          // whole way across a desktop column.
          className: "w-full justify-between sm:w-auto sm:self-start",
        })}
      >
        <span className="inline-flex items-center gap-2">
          <UsersIcon aria-hidden className="size-5" />
          Members&rsquo; progress
        </span>
        <ChevronRightIcon aria-hidden className="size-5" />
      </Link>

      <section>
        <SectionHeading>Programmes</SectionHeading>
        {programmes.length === 0 ? (
          <Card padding="md">
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <FlagIcon aria-hidden className="size-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                No programme to show
              </p>
              <p className="max-w-xs text-sm text-balance text-muted-foreground">
                {isSuperAdmin
                  ? "Nothing is published yet. A programme appears here as soon as one is."
                  : "A programme appears here once your circle follows one — an admin chooses it in Manage."}
              </p>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {programmes.map((p) => (
              // The circle-card pattern from /groups, deliberately: a row you
              // tap to open, with the same inset and the same hover. Two lists
              // of things-you-open should not be two different controls.
              <Card key={p.id} className="flex items-center gap-1 p-1.5">
                {/* The whole card opens the programme — where the work is
                    listed and, for an organiser, where each item is edited.
                    That is the trip this screen exists to shorten. */}
                <Link
                  href={`/programme/${p.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <FlagIcon aria-hidden className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">
                      {p.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.levels} {p.levels === 1 ? "level" : "levels"} ·{" "}
                      {p.items} {p.items === 1 ? "item" : "items"} ·{" "}
                      {p.startsOn.slice(0, 4)}
                      {p.endsOn.slice(0, 4) !== p.startsOn.slice(0, 4) &&
                        `–${p.endsOn.slice(0, 4)}`}
                    </p>
                  </div>
                  <ChevronRightIcon
                    aria-hidden
                    className="size-5 shrink-0 text-muted-foreground"
                  />
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      <p className="px-1 text-center text-xs text-muted-foreground">
        {isSuperAdmin
          ? "Opening a programme shows what it asks for at every level — and lets you edit an item’s link, description and cover."
          : "Opening a programme shows what it asks for at every level."}
      </p>
    </Screen>
  );
}
