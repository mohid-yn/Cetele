import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { ArrowLeftIcon, ChevronRightIcon } from "@/components/app/icons";
import { q } from "@/lib/db-log";
import type { ScheduleRow } from "@/lib/events";
import { loadStewardTree, requireSteward } from "../../steward";
import { CampForm } from "../camp-form";
import { branchOptions } from "../branch-options";

/**
 * Edit a camp (D80). Who is coming, polls, questions and cancelling live on
 * the event's own screen, where members see it too, so there is one place to
 * look rather than two copies.
 */
export default async function EditCampPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { supabase, timezone } = await requireSteward();
  const [tree, { data: e }] = await Promise.all([
    loadStewardTree(supabase),
    q(
      "admin.camp",
      supabase
        .from("events")
        .select(
          "id, kind, branch_id, title, details, venue, starts_at, ends_at, timezone, rsvp_closes_at, capacity, status, cost, bring, contact_name, contact_detail, schedule",
        )
        .eq("id", eventId)
        .maybeSingle(),
    ),
  ]);
  if (!e || e.kind !== "camp") notFound();
  const runs = tree.some((b) => b.id === e.branch_id);
  if (!runs) notFound();

  return (
    <Screen>
      <Link
        href="/admin/events"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary"
      >
        <ArrowLeftIcon aria-hidden className="size-4" /> Events
      </Link>
      <PageHeader
        eyebrow="Camp"
        title={e.title}
        action={
          e.status === "draft" ? (
            <Badge variant="warning">Draft</Badge>
          ) : e.status === "cancelled" ? (
            <Badge variant="danger">Cancelled</Badge>
          ) : (
            <Badge variant="success">Published</Badge>
          )
        }
      />
      <Link
        href={`/events/${e.id}`}
        className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-surface-hover"
      >
        Who is coming, polls and questions
        <ChevronRightIcon
          aria-hidden
          className="size-5 text-muted-foreground"
        />
      </Link>
      <CampForm
        branches={branchOptions(tree)}
        defaultZone={timezone}
        initial={{
          id: e.id,
          branchId: e.branch_id,
          title: e.title,
          details: e.details,
          venue: e.venue,
          startsAt: e.starts_at,
          endsAt: e.ends_at,
          timezone: e.timezone,
          rsvpClosesAt: e.rsvp_closes_at,
          capacity: e.capacity,
          status: e.status as "draft" | "published" | "cancelled",
          cost: e.cost,
          bring: e.bring,
          contactName: e.contact_name,
          contactDetail: e.contact_detail,
          schedule: e.schedule as ScheduleRow[],
        }}
      />
    </Screen>
  );
}
