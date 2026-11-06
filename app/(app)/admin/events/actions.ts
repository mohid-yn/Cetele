"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";

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
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidatePath("/admin/events");
  revalidatePath("/events");
  // A new camp opens its own page; an edit stays where it is.
  if (!input.id) redirect(`/admin/events/${data}`);
  revalidatePath(`/admin/events/${input.id}`);
  return { error: null };
}

export async function deleteDraft(
  eventId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.delete_event",
    supabase.rpc("delete_event", { p_event: eventId }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidatePath("/admin/events");
  redirect("/admin/events");
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
  revalidatePath("/admin/events");
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
