"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";

/**
 * Edit an item's link, description and picture (D57, migration 0027).
 *
 * A thin relay. Every rule lives in `set_roadmap_item_content`: the caller must
 * already be an organiser, a link must be http(s), a picture must be http(s) or
 * an app path, and the edit is audited. Nothing is re-checked here — a Server
 * Action is reachable by anyone who can guess its name, so it is not a place a
 * permission rule can live, and a second copy would only be a second thing to
 * drift.
 *
 * Note what the RPC deliberately cannot touch: level, category, title, unit,
 * target and compulsory. Those decide what COMPLETION means, and editing them
 * would silently re-judge progress members have already earned.
 */
export async function setRoadmapItemContent(
  itemId: string,
  url: string,
  description: string,
  imageUrl: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.set_roadmap_item_content",
    supabase.rpc("set_roadmap_item_content", {
      p_item: itemId,
      p_url: url,
      p_description: description,
      p_image_url: imageUrl,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  // Both readers of this content, and they are different routes: the catalogue
  // the organiser is standing on, and every member's own roadmap.
  revalidatePath("/programme", "layout");
  revalidatePath("/g", "layout");
  return { error: null };
}
