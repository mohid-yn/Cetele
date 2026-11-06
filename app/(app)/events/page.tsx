import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { EventCard } from "@/components/app/event-card";
import { CalendarIcon } from "@/components/app/icons";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { toUpcoming } from "@/lib/events";

/**
 * Events (D80): every camp and halaqah that reaches the member, from every
 * branch any of their circles is in. The member's own screen, like /roadmap
 * (D75): which circle is selected does not change it.
 *
 * One read (`my_upcoming_events`) carries the list, the member's answers and
 * the counts.
 */
export default async function EventsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string | undefined;
  if (!me) redirect("/");

  const [{ data: rows }, { data: profile }, { data: memberships }] =
    await Promise.all([
      q(
        "events.my_upcoming_events",
        supabase.rpc("my_upcoming_events", { p_limit: 50 }),
      ),
      q(
        "events.profile (timezone)",
        supabase.from("profiles").select("timezone").eq("id", me).maybeSingle(),
      ),
      q(
        "events.memberships (branch)",
        supabase
          .from("memberships")
          .select("role, groups(id, name, branch_id)")
          .eq("user_id", me),
      ),
    ]);

  const events = (rows ?? []).map(toUpcoming);
  const zone = profile?.timezone ?? "UTC";
  const nowISO = new Date().toISOString();
  const circles = (memberships ?? []).filter((m) => m.groups);
  const inBranch = circles.some((m) => m.groups?.branch_id);
  // Someone who can put their circle in a branch is told how; anyone else is
  // told who can.
  const leads = circles.find(
    (m) => !m.groups?.branch_id && (m.role === "owner" || m.role === "admin"),
  );

  return (
    <Screen>
      <PageHeader
        title="Events"
        subtitle="Camps and halaqahs for the branches your circles are in."
      />

      {events.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {events.map((e) => (
            <li key={e.id}>
              <EventCard event={e} viewerZone={zone} nowISO={nowISO} />
            </li>
          ))}
        </ul>
      ) : (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary-100 text-primary-800">
            <CalendarIcon aria-hidden className="size-6" />
          </span>
          {inBranch ? (
            <p className="text-sm text-muted-foreground">
              Nothing coming up yet. New camps and halaqahs for your branch will
              appear here.
            </p>
          ) : circles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Events reach you through your circle. Join a circle first.
            </p>
          ) : leads ? (
            <p className="text-sm text-muted-foreground">
              Your circle is not in a branch yet, so no events reach it.{" "}
              <Link
                href={`/g/${leads.groups!.id}/group/manage?tab=settings`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Choose a branch for {leads.groups!.name}
              </Link>
              .
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your circle is not in a branch yet, so no events reach it. Ask
              your circle&apos;s admin to choose one in Manage.
            </p>
          )}
        </Card>
      )}
    </Screen>
  );
}
