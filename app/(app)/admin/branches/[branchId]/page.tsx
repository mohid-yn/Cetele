import Link from "next/link";
import { redirect } from "next/navigation";
import { Screen } from "@/components/ui";
import { ArrowLeftIcon, PlusIcon, SettingsIcon } from "@/components/app/icons";
import { q } from "@/lib/db-log";
import { subtreeCircleCounts } from "@/lib/reach";
import { cn } from "@/lib/utils";
import { loadStewardTree, requireSteward } from "../../steward";
import { BranchDetail } from "./branch-detail";
import { HappeningHere, type ReachItem } from "./happening-here";

/**
 * One branch, as a FOLDER (D79, D85). Everything happening in this place is
 * on this page, and anything started from here goes here: the two create
 * buttons carry the branch, so no form ever asks "which branch?". The only way
 * up is a one-level back link; the branches inside are folders you open.
 *
 * A steward learns each circle's NAME and SIZE and nothing else (D27).
 */
export default async function BranchPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const { supabase, isOrganiser } = await requireSteward();
  const tree = await loadStewardTree(supabase);
  const branch = tree.find((b) => b.id === branchId);
  if (!branch) redirect("/admin/branches");

  const [{ data: circleRows }, { data: reachRows }, { data: roadmapRows }] =
    await Promise.all([
      q(
        "branch.circles",
        supabase.rpc("branch_circles", { p_branch: branchId }),
      ),
      q(
        "branch.reach (0046)",
        supabase.rpc("branch_reach", { p_branch: branchId }),
      ),
      // The organiser's "add a roadmap" sheet lists every roadmap.
      isOrganiser
        ? q(
            "branch.roadmaps",
            supabase
              .from("roadmaps")
              .select("id, name, published")
              .order("starts_on", { ascending: false }),
          )
        : Promise.resolve({
            data: [] as { id: string; name: string; published: boolean }[],
          }),
    ]);

  const parent = tree.find((b) => b.id === branch.parentId);
  // A steward of exactly one branch landed here from Admin; "back" would only
  // bounce them straight back in.
  const tops = tree.filter((b) => b.depth === 0);
  const showBack = parent || isOrganiser || tops.length > 1;
  const children = tree.filter((b) => b.parentId === branchId);
  const circles = subtreeCircleCounts(tree).get(branchId) ?? 0;

  const reach: ReachItem[] = (reachRows ?? []).map((r) => ({
    kind: r.kind as ReachItem["kind"],
    id: r.id,
    title: r.title,
    status: r.status,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    timezone: r.timezone,
    weekday: r.weekday,
    startTime: r.start_time,
    fromBranchName: r.from_branch_name,
    inherited: r.inherited,
  }));
  const assignedHere = new Set(
    reach.filter((r) => r.kind === "roadmap" && !r.inherited).map((r) => r.id),
  );
  const reaches = `reaches ${circles} ${circles === 1 ? "circle" : "circles"}`;

  return (
    <Screen>
      {showBack ? (
        <Link
          href={parent ? `/admin/branches/${parent.id}` : "/admin/branches"}
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {parent ? parent.name : "Branches"}
        </Link>
      ) : (
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          You run
        </p>
      )}

      <div className="-mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold wrap-anywhere text-foreground">
            {branch.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {circles} {circles === 1 ? "circle" : "circles"}
            {children.length > 0 &&
              ` · ${children.length} ${children.length === 1 ? "branch" : "branches"} inside`}
          </p>
        </div>
        <Link
          href={`/admin/branches/${branchId}/settings`}
          aria-label={`${branch.name} settings`}
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground hover:text-foreground"
        >
          <SettingsIcon aria-hidden className="size-5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CreateTile
          href={`/admin/events/new?branch=${branchId}`}
          label="New camp"
          hint={reaches}
          tone="accent"
        />
        <CreateTile
          href={`/admin/events/series/new?branch=${branchId}`}
          label="Weekly halaqah"
          hint={reaches}
          tone="primary"
        />
      </div>

      <BranchDetail
        branch={{ id: branch.id, name: branch.name, parentId: branch.parentId }}
        subBranches={children.map((c) => ({
          id: c.id,
          name: c.name,
          circles: subtreeCircleCounts(tree).get(c.id) ?? 0,
          pending: c.pending,
        }))}
        circles={(circleRows ?? []).map((c) => ({
          groupId: c.group_id,
          name: c.name,
          members: c.members,
          pending: c.pending,
        }))}
        happening={
          <HappeningHere
            branchId={branch.id}
            branchName={branch.name}
            circles={circles}
            items={reach}
            isOrganiser={isOrganiser}
            roadmaps={(roadmapRows ?? []).map((r) => ({
              id: r.id,
              name: r.name,
              published: r.published,
              here: assignedHere.has(r.id),
            }))}
          />
        }
      />
    </Screen>
  );
}

function CreateTile({
  href,
  label,
  hint,
  tone,
}: {
  href: string;
  label: string;
  hint: string;
  tone: "accent" | "primary";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-16 flex-col justify-center gap-0.5 rounded-2xl px-4 py-3 transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        tone === "accent"
          ? "bg-accent text-accent-foreground hover:bg-accent-hover"
          : "bg-primary-100 text-primary-800 hover:bg-primary-200",
      )}
    >
      <span className="flex items-center gap-1 text-sm font-bold">
        <PlusIcon aria-hidden className="size-4" />
        {label}
      </span>
      <span className="text-xs font-medium">{hint}</span>
    </Link>
  );
}
