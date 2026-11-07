import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import type { ScheduleRow } from "@/lib/events";
import {
  EventDetailClient,
  type Attendee,
  type EventDetail,
} from "./event-detail";
import { loadPolls, loadQuestions } from "../actions";

/**
 * One event (D80): everything about it, the member's answer, its polls and its
 * questions. A host or steward sees their tools on the same screen rather than
 * in a separate one, so running a halaqah's polls is not a trip to another app.
 *
 * `event_detail` returns nothing to anyone who cannot see the event, so a
 * Queensland member with a Melbourne link gets a 404, not the venue.
 */
export default async function EventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string | undefined;
  if (!me) redirect("/");

  const [{ data: rows }, { data: profile }, polls, questions, { data: extra }] =
    await Promise.all([
      q("event.detail", supabase.rpc("event_detail", { p_event: eventId })),
      q(
        "event.profile (timezone)",
        supabase.from("profiles").select("timezone").eq("id", me).maybeSingle(),
      ),
      loadPolls(eventId),
      loadQuestions(eventId),
      // A camp's fields (0045). Read straight from `events`: `events_select`
      // already limits it to people the event reaches.
      q(
        "event.camp details (0045)",
        supabase
          .from("events")
          .select("cost, bring, contact_name, contact_detail, schedule")
          .eq("id", eventId)
          .maybeSingle(),
      ),
    ]);

  const r = rows?.[0];
  if (!r) notFound();

  // Names are the stewards' alone (owner's call). The RPC enforces it; this
  // only skips a read that would come back empty.
  let attendees: Attendee[] = [];
  if (r.can_steward) {
    const { data } = await q(
      "event.attendees",
      supabase.rpc("event_attendees", { p_event: eventId }),
    );
    attendees = (data ?? []).map((a) => ({
      userId: a.user_id,
      name: a.name ?? "Unnamed",
      status: a.status as Attendee["status"],
      note: a.note,
    }));
  }

  const event: EventDetail = {
    id: r.id,
    kind: r.kind === "camp" ? "camp" : "halaqah",
    title: r.title,
    details: r.details,
    venue: r.venue,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    timezone: r.timezone,
    status: r.status as EventDetail["status"],
    branchName: r.branch_name,
    seriesId: r.series_id,
    rsvpClosesAt: r.rsvp_closes_at,
    capacity: r.capacity,
    myStatus: (r.my_status as EventDetail["myStatus"]) ?? null,
    myNote: r.my_note,
    going: r.going,
    maybe: r.maybe,
    no: r.no,
    canLead: r.can_lead,
    canSteward: r.can_steward,
    cost: extra?.cost ?? "",
    bring: extra?.bring ?? [],
    contactName: extra?.contact_name ?? "",
    contactDetail: extra?.contact_detail ?? "",
    schedule: (extra?.schedule as ScheduleRow[] | undefined) ?? [],
  };

  return (
    <EventDetailClient
      event={event}
      polls={polls}
      questions={questions}
      attendees={attendees}
      viewerZone={profile?.timezone ?? "UTC"}
      nowISO={new Date().toISOString()}
    />
  );
}
