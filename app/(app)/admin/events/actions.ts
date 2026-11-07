"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";
import type { ScheduleRow } from "@/lib/events";

/**
 * Posting events (D80). Stewards only, and the RPCs say so: these relay.
 * Times arrive as ISO instants, already resolved against the VENUE's zone by
 * the form (`venueLocalToISO`).
 */

export type CampInput = {
  id: string | null;
  branchId: string;
  title: string;
  details: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  rsvpClosesAt: string | null;
  capacity: number | null;
  status: "draft" | "published" | "cancelled";
  /** 0045 (D84). Free text, e.g. "$120, siblings $90". */
  cost: string;
  bring: string[];
  contactName: string;
  contactDetail: string;
  schedule: ScheduleRow[];
};

export async function saveCamp(
  input: CampInput,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await q(
    "rpc.save_camp",
    supabase.rpc("save_camp", {
      p_id: input.id as string,
      p_branch: input.branchId,
      p_title: input.title,
      p_details: input.details,
      p_venue: input.venue,
      p_starts_at: input.startsAt,
      p_ends_at: input.endsAt,
      p_timezone: input.timezone,
      p_rsvp_closes_at: input.rsvpClosesAt as string,
      p_capacity: input.capacity as number,
      p_status: input.status,
      p_cost: input.cost,
      p_bring: input.bring,
      p_contact_name: input.contactName,
      p_contact_detail: input.contactDetail,
      p_schedule: input.schedule,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidatePath("/admin/events", "layout");
  // The branch's "Happening here" and the home's "Coming up" (D85).
  revalidatePath("/admin/branches", "layout");
  revalidatePath("/events");
  // A new camp opens its own page; an edit stays where it is.
  if (!input.id) redirect(`/admin/events/${data}`);
  revalidatePath(`/admin/events/${input.id}`);
  return { error: null };
}

export async function deleteDraft(
  eventId: string,
  branchId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.delete_event",
    supabase.rpc("delete_event", { p_event: eventId }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidatePath("/admin/branches", "layout");
  // Back to the branch it was in (D85): there is no events list to return to.
  redirect(`/admin/branches/${branchId}`);
}

export type SeriesInput = {
  id: string | null;
  branchId: string;
  title: string;
  details: string;
  venue: string;
  weekday: number;
  startTime: string;
  durationMinutes: number;
  timezone: string;
  active: boolean;
};

export async function saveSeries(
  input: SeriesInput,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await q(
    "rpc.save_series",
    supabase.rpc("save_series", {
      p_id: input.id as string,
      p_branch: input.branchId,
      p_title: input.title,
      p_details: input.details,
      p_venue: input.venue,
      p_weekday: input.weekday,
      p_start_time: input.startTime,
      p_duration_minutes: input.durationMinutes,
      p_timezone: input.timezone,
      p_active: input.active,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidatePath("/admin/events", "layout");
  // The branch's "Happening here" and the home's "Coming up" (D85).
  revalidatePath("/admin/branches", "layout");
  revalidatePath("/events");
  if (!input.id) redirect(`/admin/events/series/${data}`);
  revalidatePath(`/admin/events/series/${input.id}`);
  return { error: null };
}

export async function appointHost(
  seriesId: string,
  email: string,
): Promise<{ error: string | null }> {
  const trimmed = email.trim();
  if (!trimmed) return { error: "Enter an email address" };
  const supabase = await createClient();
  const { error } = await q(
    "rpc.appoint_series_host",
    supabase.rpc("appoint_series_host", {
      p_series: seriesId,
      p_email: trimmed,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidatePath(`/admin/events/series/${seriesId}`);
  return { error: null };
}

export async function removeHost(
  seriesId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.remove_series_host",
    supabase.rpc("remove_series_host", { p_series: seriesId, p_user: userId }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidatePath(`/admin/events/series/${seriesId}`);
  return { error: null };
}
