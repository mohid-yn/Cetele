import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import {
  BranchesIcon,
  CalendarIcon,
  ChevronRightIcon,
} from "@/components/app/icons";
import { q } from "@/lib/db-log";
import { formatWhen } from "@/lib/events";
import { subtreeCircleCounts } from "@/lib/reach";
import { loadStewardTree, requireSteward } from "../steward";
import { NewBranchButton } from "./new-branch";
import { ArchivedList } from "./archived-list";

/**
 * The administration workspace's landing page (D82, D85): branches as FOLDERS.
 *
 *   1. COMING UP: the next camps the viewer runs, the most time-bound thing here.
 *   2. YOUR BRANCHES: only the top of the tree. Open one to see what happens
 *      there, post inside it, and open the branches inside it in turn. The tree
 *      is understood by moving through it, never drawn (owner, 2026-11-07:
 *      breadcrumbs and diagrams "make everything seem complicated").
 *
 * A steward who runs ONE branch never sees this screen: they land inside it.
 * Creating lives inside a branch, so there are no create buttons here.
 */
export default async function BranchesPage() {
  const { supabase, isOrganiser } = await requireSteward();
  const [tree, { data: led }] = await Promise.all([
    loadStewardTree(supabase),
    q("branches.events_i_lead", supabase.rpc("events_i_lead")),
  ]);
  // Archived branches (D87) leave the folders and wait in a quiet list below.
  const tops = tree.filter((b) => b.depth === 0 && b.live);
  const archivedTops = tree.filter((b) => b.depth === 0 && b.archived);
  if (!isOrganiser && tops.length === 1) {
    redirect(`/admin/branches/${tops[0].id}`);
  }

  const reach = subtreeCircleCounts(tree.filter((b) => b.live));
  const inside = (id: string) =>
    tree.filter((b) => b.parentId === id && b.live).length;
  // Requests anywhere under a top branch, so the folder says it needs a look.
  const waitingUnder = (id: string): number => {
    const own = tree.find((b) => b.id === id)?.pending ?? 0;
    return (
      own +
      tree
        .filter((b) => b.parentId === id)
        .reduce((n, c) => n + waitingUnder(c.id), 0)
    );
  };
  const camps = (led ?? [])
    .filter((e) => e.kind === "camp" && e.status !== "cancelled")
    .slice(0, 3);

  return (
    <Screen>
      <PageHeader
        eyebrow="Administration"
        title="Branches"
        action={
          isOrganiser ? (
            <NewBranchButton parentId={null} label="New organisation" />
          ) : undefined
        }
      />

      {camps.length > 0 && (
        <section>
          <SectionHeading>Coming up</SectionHeading>
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
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section>
        <SectionHeading>Your branches</SectionHeading>
        {tops.length > 0 ? (
          <>
            <Card className="overflow-hidden">
              <ul className="flex flex-col divide-y divide-border">
                {tops.map((b) => {
                  const kids = inside(b.id);
                  const circles = reach.get(b.id) ?? 0;
                  const waiting = waitingUnder(b.id);
                  return (
                    <li key={b.id}>
                      <Link
                        href={`/admin/branches/${b.id}`}
                        className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-100 text-primary-800">
                          <BranchesIcon aria-hidden className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-foreground">
                            {b.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {kids > 0 &&
                              `${kids} ${kids === 1 ? "branch" : "branches"} inside · `}
                            {circles} {circles === 1 ? "circle" : "circles"}
                          </span>
                        </span>
                        {waiting > 0 && (
                          <Badge variant="accent" size="sm">
                            {waiting} waiting
                          </Badge>
                        )}
                        <ChevronRightIcon
                          aria-hidden
                          className="size-5 shrink-0 text-muted-foreground"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <p className="mt-2 text-sm text-muted-foreground">
              Open a branch to post a camp or halaqah there. It reaches every
              circle inside.
            </p>
          </>
        ) : (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            {isOrganiser
              ? "No branches yet. Start with your organisation, then add the places inside it."
              : "You run no branches at the moment."}
          </Card>
        )}
      </section>
      <ArchivedList branches={archivedTops} />
    </Screen>
  );
}
