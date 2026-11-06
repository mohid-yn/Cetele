import Link from "next/link";
import { Badge, Card, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { BranchesIcon, ChevronRightIcon } from "@/components/app/icons";
import { loadStewardTree, requireSteward } from "../steward";
import { NewBranchButton } from "./new-branch";

/**
 * Branches (D79): every place the viewer runs, as one indented list. A
 * branch with circles waiting to join says so, because approving them is the
 * one thing here that someone else is waiting on.
 */
export default async function BranchesPage() {
  const { supabase, isOrganiser } = await requireSteward();
  const tree = await loadStewardTree(supabase);
  const waiting = tree.reduce((n, b) => n + b.pending, 0);

  return (
    <Screen>
      <PageHeader
        eyebrow="Administration"
        title="Branches"
        subtitle="Places, nested. A circle joins one, and hears about events in it and every branch above it."
        action={
          isOrganiser ? (
            <NewBranchButton parentId={null} label="New organisation" />
          ) : undefined
        }
      />

      {waiting > 0 && (
        <p className="rounded-xl bg-accent-100 px-4 py-3 text-sm font-medium text-accent-800">
          {waiting === 1
            ? "1 circle is waiting to join a branch."
            : `${waiting} circles are waiting to join a branch.`}
        </p>
      )}

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
                      {b.circles === 1 ? "1 circle" : `${b.circles} circles`}
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
