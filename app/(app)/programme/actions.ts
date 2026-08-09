"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";

/**
 * Start a new programme (D59, migration 0030).
 *
 * A thin relay, like every authoring action: `create_roadmap` refuses a
 * non-organiser, insists on a name and a window, and audits the result.
 *
 * It REDIRECTS into the new programme on success. A programme is born
 * unpublished and empty, so leaving the organiser on the hub would show them a
 * row that says "0 levels · 0 items" and no obvious next step — the next step
 * is adding the work, and that lives on the screen this opens.
 */
export async function createRoadmap(
  name: string,
  startsOn: string,
  endsOn: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await q(
    "rpc.create_roadmap",
    supabase.rpc("create_roadmap", {
      p_name: name,
      p_starts_on: startsOn,
      p_ends_on: endsOn,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  revalidatePath("/programme", "layout");
  redirect(`/programme/${data as string}`);
}
