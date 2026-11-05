import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { Badge, Card, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import {
  ChevronRightIcon,
  FlagIcon,
  LinkIcon,
  UsersIcon,
} from "@/components/app/icons";
import { localDateISO } from "@/lib/local-date";
import { readMcpConfig } from "@/lib/mcp-policy";
import { levelsOf, programmeWindow } from "@/lib/roadmap";
import { NewProgrammeButton } from "./new-programme";

/**
 * The roadmap hub: the administration's programmes, and the way in to both
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
 * NO VIEWER CHECK ON THE LIST, exactly as the two screens either side of it.
 * RLS on `roadmaps` returns the published programmes the reader is entitled to
 * — the ones their circles follow, or all of them for an organiser (0025) — so
 * what is listed here is the database's answer rather than a second copy of the
 * rule.
 *
 * THE COHORT BUTTON IS A DIFFERENT QUESTION, and since D69 it has a different
 * answer. This screen used to offer "Progress" on every row on the argument
 * that the report is RLS-scoped, so a plain member would simply see themselves
 * — true of the data and wrong about the screen, which is headed "Members'
 * progress" and would hand them a roster of one. Reading a cohort is an
 * administrative act, so each row's button is gated on
 * `can_read_roadmap_cohort` (0035), the same function the catalogue and the
 * report itself ask. The route refuses either way; this is what stops a member
 * being offered a door that is going to be shut in their face.
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
        .select(
          "id, name, starts_on, ends_on, published, roadmap_items(level), group_roadmaps(group_id)",
        )
        .order("starts_on", { ascending: false }),
    ),
    // WHICH READER this is, for the empty state and the footer — never as a
    // filter. Read off `profiles` because the private schema is not exposed to
    // PostgREST (0002), exactly as the report and the catalogue do it.
    q(
      "programmeHub.viewer (is_super_admin — copy only)",
      supabase
        .from("profiles")
        .select("is_super_admin, timezone")
        .eq("id", me)
        .maybeSingle(),
    ),
  ]);

  const isSuperAdmin = viewer?.is_super_admin ?? false;
  const todayISO = localDateISO(viewer?.timezone ?? "UTC");

  const programmes = (roadmaps ?? [])
    .map((r) => ({
      id: r.id,
      name: r.name,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      published: r.published,
      // `levelsOf` rather than a max: a programme with levels 1 and 3 has two
      // levels, and this is the same function the report and the member's own
      // screen count with.
      levels: levelsOf(r.roadmap_items ?? []).length,
      items: (r.roadmap_items ?? []).length,
      // RLS shows an organiser every row, so this count is only rendered for them.
      circles: (r.group_roadmaps ?? []).length,
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

  // WHICH of these the viewer may read the COHORT for — an organiser, or
  // whoever leads a circle following that programme (0035, D69). Asked of the
  // DATABASE, once per listed programme, rather than assembled here from
  // memberships: this is the same question the catalogue and the report ask,
  // and keeping the three readers on one definition is the whole reason it is a
  // function. `programmes` is an administration's programmes — single digits —
  // and the calls go out together, so this is one round of waiting, not N.
  const cohortReadable = new Set(
    (
      await Promise.all(
        programmes.map(async (p) => {
          const { data } = await q(
            "programmeHub.may read the cohort (0035)",
            supabase.rpc("can_read_roadmap_cohort", { p_roadmap: p.id }),
          );
          return data ? p.id : null;
        }),
      )
    ).filter((id) => id !== null),
  );

  const phaseOf = (p: (typeof programmes)[number]) =>
    !p.published
      ? "draft"
      : programmeWindow(p.startsOn, p.endsOn, todayISO).state === "closed"
        ? "closed"
        : "live";

  // Grouped by what an organiser would do next. A member never sees a draft, so
  // their list has at most two groups and usually one.
  const groups = [
    { key: "live", title: "Live" },
    { key: "draft", title: "Drafts" },
    { key: "closed", title: "Closed" },
  ]
    .map((g) => ({
      ...g,
      rows: programmes.filter((p) => phaseOf(p) === g.key),
    }))
    .filter((g) => g.rows.length > 0);

  const years = (p: (typeof programmes)[number]) =>
    p.startsOn.slice(0, 4) === p.endsOn.slice(0, 4)
      ? p.startsOn.slice(0, 4)
      : `${p.startsOn.slice(0, 4)}-${p.endsOn.slice(0, 4)}`;

  return (
    <Screen>
      <PageHeader
        eyebrow={isSuperAdmin ? "Administration" : undefined}
        title="Roadmaps"
        action={isSuperAdmin ? <NewProgrammeButton /> : undefined}
      />

      {programmes.length === 0 ? (
        <Card padding="md">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <FlagIcon aria-hidden className="size-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              No roadmap to show
            </p>
            <p className="max-w-xs text-sm text-balance text-muted-foreground">
              {isSuperAdmin
                ? "Create the first one. It stays private until you publish it."
                : "One appears here once your circle follows it. A circle's admins choose that in Manage."}
            </p>
          </div>
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            {/* One group needs no label, unless it's a label worth reading. */}
            {(groups.length > 1 || group.key !== "live") && (
              <SectionHeading>{group.title}</SectionHeading>
            )}
            <ul className="flex flex-col gap-2">
              {group.rows.map((p) => (
                <li key={p.id}>
                  <Card className="divide-y divide-border overflow-hidden">
                    <Link
                      href={`/programme/${p.id}`}
                      className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover active:bg-surface-active"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold wrap-anywhere text-foreground">
                          {p.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                          {p.levels} {p.levels === 1 ? "level" : "levels"},{" "}
                          {p.items} {p.items === 1 ? "item" : "items"},{" "}
                          {years(p)}
                        </span>
                      </span>
                      {isSuperAdmin && p.published && (
                        <Badge
                          variant={p.circles > 0 ? "primary" : "warning"}
                          size="sm"
                          className="shrink-0 tabular-nums"
                        >
                          {p.circles === 0
                            ? "No circles"
                            : `${p.circles} ${p.circles === 1 ? "circle" : "circles"}`}
                        </Badge>
                      )}
                      <ChevronRightIcon
                        aria-hidden
                        className="size-5 shrink-0 text-muted-foreground"
                      />
                    </Link>
                    {/* Only for whoever leads a circle following it (D69). */}
                    {cohortReadable.has(p.id) && (
                      <Link
                        href={`/programme/${p.id}/progress`}
                        aria-label={`Members' progress on ${p.name}`}
                        className="flex min-h-11 items-center gap-2 px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover active:bg-surface-active"
                      >
                        <UsersIcon aria-hidden className="size-4 shrink-0" />
                        <span className="flex-1">Members&rsquo; progress</span>
                        <ChevronRightIcon
                          aria-hidden
                          className="size-5 shrink-0 text-muted-foreground"
                        />
                      </Link>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {isSuperAdmin && readMcpConfig(process.env).enabled && (
        <Card className="overflow-hidden">
          <Link
            href="/programme/connect"
            className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover active:bg-surface-active"
          >
            <LinkIcon
              aria-hidden
              className="size-5 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1 font-semibold text-foreground">
              Build with Claude
            </span>
            <ChevronRightIcon
              aria-hidden
              className="size-5 shrink-0 text-muted-foreground"
            />
          </Link>
        </Card>
      )}
    </Screen>
  );
}
