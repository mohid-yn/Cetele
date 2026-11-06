"use client";

import { createClient } from "@/lib/supabase/client";
import { q } from "@/lib/db-log";
import { toUpcoming, type UpcomingEvent } from "@/lib/events";

/**
 * The member's upcoming events, fetched once per document for Today's card and
 * the Group screen's link (D80). Any answer given anywhere clears it
 * (`forgetUpcoming`), so going back to Today never asks a question already
 * answered on the events screen.
 */
let cache: UpcomingEvent[] | null = null;
let inFlight: Promise<UpcomingEvent[]> | null = null;

export async function loadUpcoming(): Promise<UpcomingEvent[]> {
  if (cache) return cache;
  inFlight ??= (async () => {
    const supabase = createClient();
    const { data } = await q(
      "upcoming.my_upcoming_events",
      supabase.rpc("my_upcoming_events", { p_limit: 10 }),
    );
    cache = (data ?? []).map(toUpcoming);
    return cache;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function forgetUpcoming(): void {
  cache = null;
}
