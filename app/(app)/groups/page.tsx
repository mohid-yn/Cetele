import Link from "next/link";
import { Card, buttonVariants } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import {
  BranchesIcon,
  ChevronRightIcon,
  UsersIcon,
} from "@/components/app/icons";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { groupHref } from "@/lib/group-href";
import { NewGroupButton } from "./new-group";
import { JoinByCode } from "./join-by-code";

/**
 * Groups home — the Drive-style "My Drive" for circles (D26). First screen
 * served from the real database (M1): your memberships, grouped by role.
 * Manage (M2) sets the active-group cookie and opens the real manage screen;
 * invite links live there (D34/D35 — per-invite codes, not a group code).
 */
export default async function GroupsHomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const me = data?.claims.sub;

  const [{ data: rows }, { data: running }, { data: viewer }] =
    await Promise.all([
      q(
        "groups.memberships (mine + counts)",
        supabase
          .from("memberships")
          .select("role, groups(id, name, memberships(count))")
          .eq("user_id", me ?? "")
          .order("role"),
      ),
      // A super admin is deliberately in NO circle (D27), and the empty state
      // below must not tell them to start their first one. Their tools are in
      // the administration workspace, not on this screen (D74).
      // The places this person runs (D86), listed above their circles like the
      // switcher's "You run": the picker is where someone chooses a space.
      q("groups.places I run", supabase.rpc("my_steward_tree")),
      q(
        "groups.viewer (is_super_admin)",
        supabase
          .from("profiles")
          .select("is_super_admin")
          .eq("id", me ?? "")
          .maybeSingle(),
      ),
    ]);

  const isSuperAdmin = viewer?.is_super_admin ?? false;
  const tops = (running ?? []).filter((b) => b.depth === 0 && b.live);

  // An organiser runs every branch; the switcher calls that "All branches".
  const runs = isSuperAdmin
    ? [{ id: null as string | null, name: "All branches" }]
    : tops.map((b) => ({ id: b.id as string | null, name: b.name }));
  const youRun = runs.length > 0 && (
    <section className="w-full">
      <SectionHeading>You run</SectionHeading>
      <ul className="flex flex-col gap-2">
        {runs.map((b) => (
          <li key={b.id ?? "all"}>
            <Link
              href={b.id ? `/admin/branches/${b.id}` : "/admin/branches"}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-2 transition-colors hover:bg-surface-hover"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-100 text-primary-800">
                <BranchesIcon aria-hidden className="size-5" />
              </span>
              <span className="min-w-0 flex-1 font-semibold wrap-anywhere text-foreground">
                {b.name}
              </span>
              <ChevronRightIcon
                aria-hidden
                className="size-5 shrink-0 text-muted-foreground"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  const mine = (rows ?? []).filter((r) => r.groups != null);
  const owned = mine.filter((r) => r.role === "owner");
  const shared = mine.filter((r) => r.role === "admin");
  const memberOf = mine.filter((r) => r.role === "member");

  const GroupCard = ({ row }: { row: (typeof mine)[number] }) => {
    const g = row.groups!;
    const members = g.memberships?.[0]?.count ?? 0;
    const canManage = row.role === "owner" || row.role === "admin";
    return (
      <Card className="flex items-center gap-1 p-1.5">
        {/* Tap the card to open this circle (any role) — prefetched. */}
        <Link
          href={groupHref(g.id, "/today")}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <UsersIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold wrap-anywhere text-foreground">
              {g.name}
            </p>
            {/* The role lives on this line so it doesn't cut the circle's name
                short, and it isn't rose, which is kept for earned moments. */}
            <p className="text-xs text-muted-foreground">
              {row.role === "owner" && "Owner · "}
              {row.role === "admin" && "Admin · "}
              {members} {members === 1 ? "member" : "members"}
            </p>
          </div>
        </Link>
        {canManage && (
          <Link
            href={groupHref(g.id, "/group/manage")}
            className={buttonVariants({
              variant: "tonal",
              size: "sm",
              className: "mr-1.5",
            })}
          >
            Manage
          </Link>
        )}
      </Card>
    );
  };

  // A group-only app: with no circle at all, /groups is the front door — for a
  // brand-new member AND for anyone who just left/deleted their last circle. So
  // it welcomes rather than showing an empty list.
  const noGroups = mine.length === 0;

  if (noGroups) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-6 px-5 py-8">
        {youRun && <div className="mx-auto w-full max-w-sm">{youRun}</div>}
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold text-foreground">
            {/* An administrator has not FAILED to make a circle — being in none
                is the role. Telling them to start their first one was the app
                mistaking them for a new member. */}
            {isSuperAdmin ? "Your own circles" : "Start your first circle"}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-balance text-muted-foreground">
            Cetele is built around a circle, a small group that keeps a shared
            dhikr goal together. Create one and invite your people, or join one
            you&rsquo;ve been invited to.
          </p>
        </div>

        <Card className="mx-auto flex w-full max-w-sm flex-col gap-4 p-5">
          <div className="flex flex-col items-center gap-2">
            <NewGroupButton />
            <span className="text-xs text-muted-foreground">
              You&rsquo;ll be the owner. Invite others afterwards.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              Have an invite?
            </p>
            <JoinByCode />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-5 pt-6 pb-8 lg:px-8">
      <PageHeader
        title="Groups"
        subtitle="Circles you own or help run"
        action={<NewGroupButton />}
      />

      {youRun}

      <section>
        <SectionHeading>My groups ({owned.length})</SectionHeading>
        {owned.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            You don&rsquo;t own any groups yet. Create one, or you&rsquo;re a
            member of the circles below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {owned.map((r) => (
              <li key={r.groups!.id}>
                <GroupCard row={r} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {shared.length > 0 && (
        <section>
          <SectionHeading>Shared with me ({shared.length})</SectionHeading>
          <ul className="flex flex-col gap-2">
            {shared.map((r) => (
              <li key={r.groups!.id}>
                <GroupCard row={r} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {memberOf.length > 0 && (
        <section>
          <SectionHeading>Member of ({memberOf.length})</SectionHeading>
          <ul className="flex flex-col gap-2">
            {memberOf.map((r) => (
              <li key={r.groups!.id}>
                <GroupCard row={r} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
