import Link from "next/link";
import { Badge, Card, buttonVariants } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import { FlagIcon, UsersIcon } from "@/components/app/icons";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { groupHref } from "@/lib/group-href";
import { NewGroupButton } from "./new-group";
import { JoinByCode } from "./join-by-code";
import { Organisers, type Organiser } from "./organisers";

/**
 * Groups home — the Drive-style "My Drive" for circles (D26). First screen
 * served from the real database (M1): your memberships, grouped by role.
 * Manage (M2) sets the active-group cookie and opens the real manage screen;
 * invite links live there (D34/D35 — per-invite codes, not a group code).
 */
/**
 * The roadmap hub, from the app's front door.
 *
 * KEPT even though an organiser now has a permanent Roadmap tab (D59). The tab
 * is the answer to "how do I get there from anywhere"; this card is the answer
 * to "what is on this screen" — /groups is where an organiser lands, and a
 * front door that lists only circles tells someone who is in none by role that
 * the app has nothing for them.
 *
 * It is NOT gated on a programme existing. Checking would cost a query on a
 * screen that runs for every member on every visit, and the hub already says so
 * honestly — an entry that leads to an empty state is better than one that
 * vanishes and leaves nowhere to go.
 */
function ProgrammeEntry() {
  return (
    <Card className="flex items-center gap-1 p-1.5">
      <Link
        href="/programme"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
      >
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <FlagIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Programme</p>
          <p className="text-xs text-muted-foreground">
            What the programmes ask for, and how far everyone has got
          </p>
        </div>
      </Link>
    </Card>
  );
}

export default async function GroupsHomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const me = data?.claims.sub;

  const [{ data: rows }, { data: viewer }] = await Promise.all([
    q(
      "groups.memberships (mine + counts)",
      supabase
        .from("memberships")
        .select("role, groups(id, name, memberships(count))")
        .eq("user_id", me ?? "")
        .order("role"),
    ),
    // A super admin is deliberately in NO circle (D27), so every route in the
    // app is gated against them by membership and this screen was their dead
    // end: the empty state told an administrator to start their first circle.
    // The flag is read here because /groups is a server component and the app
    // shell does no DB work (§4) — the same constraint that put the roadmap on
    // a Progress card instead of a fifth nav tab.
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

  // The administration's own roster (D56). Fetched only for an organiser — not
  // to hide it (the RPC returns an empty set to anyone else, which is the real
  // gate) but because there is no reason to make the round trip for the
  // overwhelming majority of visits, and this screen is the app's front door.
  const organisers: Organiser[] = isSuperAdmin
    ? (
        (await q("groups.organisers", supabase.rpc("list_super_admins")))
          .data ?? []
      ).map((o) => ({
        userId: o.user_id,
        name: o.name,
        email: o.email,
      }))
    : [];

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
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <span className="truncate">{g.name}</span>
              {row.role === "owner" && (
                <Badge variant="accent" size="sm">
                  owner
                </Badge>
              )}
              {row.role === "admin" && (
                <Badge variant="primary" size="sm">
                  co-admin
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {members} {members === 1 ? "member" : "members"}
            </p>
          </div>
        </Link>
        {canManage && (
          <Link
            href={groupHref(g.id, "/group/manage")}
            className={buttonVariants({
              variant: "outline",
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
        {isSuperAdmin && (
          <div className="mx-auto w-full max-w-sm">
            <SectionHeading>Administration</SectionHeading>
            <div className="flex flex-col gap-2">
              <ProgrammeEntry />
              <Organisers organisers={organisers} me={me ?? ""} />
            </div>
          </div>
        )}

        <div className="text-center">
          <h1 className="font-display text-2xl font-bold text-foreground">
            {/* An administrator has not FAILED to make a circle — being in none
                is the role. Telling them to start their first one was the app
                mistaking them for a new member. */}
            {isSuperAdmin ? "Your own circles" : "Start your first circle"}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-balance text-muted-foreground">
            Cetele is built around a circle — a small group that keeps a shared
            dhikr goal together. Create one and invite your people, or join one
            you&rsquo;ve been invited to.
          </p>
        </div>

        <Card className="mx-auto flex w-full max-w-sm flex-col gap-4 p-5">
          <div className="flex flex-col items-center gap-2">
            <NewGroupButton />
            <span className="text-xs text-muted-foreground">
              You&rsquo;ll be the owner — invite others afterwards.
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

      {isSuperAdmin && (
        <section>
          <SectionHeading>Administration</SectionHeading>
          <div className="flex flex-col gap-2">
            <ProgrammeEntry />
            <Organisers organisers={organisers} me={me ?? ""} />
          </div>
        </section>
      )}

      <section>
        <SectionHeading>My groups ({owned.length})</SectionHeading>
        {owned.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            You don&rsquo;t own any groups yet — create one, or you&rsquo;re a
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
