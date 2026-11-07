import Link from "next/link";
import { Badge, buttonVariants, Card, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import {
  BranchesIcon,
  CalendarIcon,
  ChevronRightIcon,
  FlagIcon,
  PlusIcon,
} from "@/components/app/icons";
import { q } from "@/lib/db-log";
import { formatWhen } from "@/lib/events";
import { subtreeCircleCounts } from "@/lib/reach";
import { loadStewardTree, requireSteward } from "../steward";
import { NewBranchButton } from "./new-branch";

/**
 * The administration workspace's landing page (D79, D82).
 *
 *   1. COMING UP: the next camps the viewer runs, so the most time-bound thing
 *      in the workspace is the first thing in it.
 *   2. CREATE: camp, weekly halaqah, roadmap, one tap each.
 *   3. HOW REACH WORKS, in three lines, because the owner could not tell how a
 *      roadmap or an event finds its circles (2026-11-07).
 *   4. The tree. Open a branch to see everything reaching it.
 *
 * A branch with circles waiting to join says so, because approving them is the
 * one thing here that someone else is waiting on.
 */
export default async function BranchesPage() {
  const { supabase, isOrganiser } = await requireSteward();
  const [tree, { data: led }] = await Promise.all([
    loadStewardTree(supabase),
    q("branches.events_i_lead", supabase.rpc("events_i_lead")),
  ]);
  const waiting = tree.reduce((n, b) => n + b.pending, 0);
  const reach = subtreeCircleCounts(tree);
  const camps = (led ?? [])
    .filter((e) => e.kind === "camp" && e.status !== "cancelled")
    .slice(0, 3);

  return (
    <Screen>
      <PageHeader
        eyebrow="Administration"
        title="Branches"
        subtitle="Where camps, halaqahs and roadmaps reach circles."
        action={
          isOrganiser ? (
            <NewBranchButton parentId={null} label="New organisation" />
          ) : undefined
        }
      />

      <section>
        <SectionHeading>Coming up</SectionHeading>
        {camps.length > 0 ? (
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y divide-border">
              {camps.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/admin/events/${e.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-hover"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-800">
                      <CalendarIcon aria-hidden className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {e.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatWhen(e.starts_at, e.ends_at, e.timezone)} ·{" "}
                        {e.branch_name}
                      </span>
                    </span>
                    {e.status === "draft" ? (
                      <Badge variant="warning" size="sm">
                        Draft
                      </Badge>
                    ) : (
                      <Badge variant="success" size="sm">
                        {e.going} going
                      </Badge>
                    )}
                    <ChevronRightIcon
                      aria-hidden
                      className="size-5 shrink-0 text-muted-foreground"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">No camps coming up.</p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Link
            href="/admin/events/new"
            className={buttonVariants({ variant: "accent" })}
          >
            <PlusIcon aria-hidden className="size-4" /> New camp
          </Link>
          <Link
            href="/admin/events/series/new"
            className={buttonVariants({ variant: "tonal" })}
          >
            <PlusIcon aria-hidden className="size-4" /> Weekly halaqah
          </Link>
          {isOrganiser && (
            <Link
              href="/programme"
              className={buttonVariants({
                variant: "tonal",
                className: "col-span-2 sm:col-span-1",
              })}
            >
              <FlagIcon aria-hidden className="size-4" /> Roadmaps
            </Link>
          )}
        </div>
      </section>

      <section>
        <SectionHeading>How things reach circles</SectionHeading>
        <Card className="flex flex-col gap-3 p-4 text-sm">
          <p className="flex gap-3">
            <BranchesIcon
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-primary"
            />
            <span>
              <strong className="text-foreground">Branches are places.</strong>{" "}
              <span className="text-muted-foreground">
                Each circle joins one. Anything set on a branch reaches every
                circle in it and in the branches inside it.
              </span>
            </span>
          </p>
          <p className="flex gap-3">
            <CalendarIcon
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-primary"
            />
            <span>
              <strong className="text-foreground">
                Camps and weekly halaqahs
              </strong>{" "}
              <span className="text-muted-foreground">
                are posted to a branch. Members answer if they are coming;
                nothing is required.
              </span>
            </span>
          </p>
          <p className="flex gap-3">
            <FlagIcon
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-primary"
            />
            <span>
              <strong className="text-foreground">Roadmaps</strong>{" "}
              <span className="text-muted-foreground">
                are assigned to a branch, or to single circles. Members record
                their progress against them.
              </span>
            </span>
          </p>
        </Card>
      </section>

      {waiting > 0 && (
        <p className="rounded-xl bg-accent-100 px-4 py-3 text-sm font-medium text-accent-800">
          {waiting === 1
            ? "1 circle is waiting to join a branch."
            : `${waiting} circles are waiting to join a branch.`}
        </p>
      )}

      <SectionHeading className="-mb-2">
        {isOrganiser ? "All branches" : "Branches you run"}
      </SectionHeading>
      {tree.length > 0 ? (
        <Card className="overflow-hidden">
          <ul className="flex flex-col divide-y divide-border">
            {tree.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/branches/${b.id}`}
                  className="flex min-h-14 items-center gap-3 py-3 pr-4 hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  // One step of indent per level, capped so a deep tree still
                  // fits a phone.
                  style={{
                    paddingLeft: `calc(1rem + ${Math.min(b.depth, 5)} * 1.25rem)`,
                  }}
                >
                  <BranchesIcon
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {b.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {(reach.get(b.id) ?? 0) === 1
                        ? "Reaches 1 circle"
                        : `Reaches ${reach.get(b.id) ?? 0} circles`}
                      {b.direct && " · you run this"}
                    </span>
                  </span>
                  {b.pending > 0 && (
                    <Badge variant="accent" size="sm">
                      {b.pending} waiting
                    </Badge>
                  )}
                  <ChevronRightIcon
                    aria-hidden
                    className="size-5 shrink-0 text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {isOrganiser
            ? "No branches yet. Start with your organisation, then add the places inside it."
            : "You run no branches at the moment."}
        </Card>
      )}
    </Screen>
  );
}
