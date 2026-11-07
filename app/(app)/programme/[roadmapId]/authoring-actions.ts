"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";

/**
 * The organiser's authoring actions (D59, migration 0030).
 *
 * THIN RELAYS, every one. Not a single rule lives here: organiser-only, the
 * freeze on the fields completion is computed from, the refusal to delete
 * anything anyone has recorded against — all of it is in the RPCs, because a
 * Server Action is reachable by anyone who can guess its name and is therefore
 * not a place a permission can live. A copy here would only be a second thing
 * to drift, and the app's copy would be the one nobody tested.
 *
 * WHAT EACH ONE REVALIDATES matters more than it looks. A programme's content
 * is read on three different routes — the hub, the catalogue, and every
 * member's own `/roadmap` — so an edit that revalidates only the
 * screen the organiser is standing on leaves members holding the old copy until
 * something else happens to refresh them.
 */
type Result = { error: string | null };

/** Both readers of a programme: the administration's screens and the members'. */
function revalidateProgramme(): void {
  revalidatePath("/programme", "layout");
  revalidatePath("/g", "layout");
  revalidatePath("/roadmap");
}

export async function updateRoadmap(
  roadmapId: string,
  name: string,
  startsOn: string,
  endsOn: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.update_roadmap",
    supabase.rpc("update_roadmap", {
      p_roadmap: roadmapId,
      p_name: name,
      p_starts_on: startsOn,
      p_ends_on: endsOn,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidateProgramme();
  return { error: null };
}

export async function setRoadmapPublished(
  roadmapId: string,
  published: boolean,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.set_roadmap_published",
    supabase.rpc("set_roadmap_published", {
      p_roadmap: roadmapId,
      p_published: published,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidateProgramme();
  return { error: null };
}

/**
 * Delete a programme outright. REDIRECTS on success rather than returning,
 * because the screen the caller is standing on has just ceased to exist —
 * staying on it would render "No programme here", which reads as a failure.
 *
 * The refusal path still returns: `delete_roadmap` refuses once anyone has
 * recorded work, and that message ("unpublish it instead") is the whole point
 * of the guard, so it has to reach the dialog rather than a redirect.
 */
export async function deleteRoadmap(roadmapId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.delete_roadmap",
    supabase.rpc("delete_roadmap", { p_roadmap: roadmapId }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidateProgramme();
  redirect("/programme");
}

export async function createRoadmapItem(
  roadmapId: string,
  item: {
    level: number;
    category: string;
    title: string;
    source: string;
    unit: string;
    target: number;
    compulsory: boolean;
    sortOrder: number;
  },
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.create_roadmap_item",
    supabase.rpc("create_roadmap_item", {
      p_roadmap: roadmapId,
      p_level: item.level,
      p_category: item.category,
      p_title: item.title,
      p_source: item.source,
      p_unit: item.unit,
      p_target: item.target,
      p_compulsory: item.compulsory,
      p_sort_order: item.sortOrder,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidateProgramme();
  return { error: null };
}

export async function setRoadmapItemShape(
  itemId: string,
  item: {
    level: number;
    category: string;
    title: string;
    source: string;
    unit: string;
    target: number;
    compulsory: boolean;
    sortOrder: number;
  },
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.set_roadmap_item_shape",
    supabase.rpc("set_roadmap_item_shape", {
      p_item: itemId,
      p_level: item.level,
      p_category: item.category,
      p_title: item.title,
      p_source: item.source,
      p_unit: item.unit,
      p_target: item.target,
      p_compulsory: item.compulsory,
      p_sort_order: item.sortOrder,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidateProgramme();
  return { error: null };
}

export async function deleteRoadmapItem(itemId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.delete_roadmap_item",
    supabase.rpc("delete_roadmap_item", { p_item: itemId }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidateProgramme();
  return { error: null };
}

export async function upsertRoadmapReward(
  roadmapId: string,
  reward: {
    id: string | null;
    threshold: number;
    label: string;
    description: string;
  },
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.upsert_roadmap_reward",
    supabase.rpc("upsert_roadmap_reward", {
      p_roadmap: roadmapId,
      p_threshold: reward.threshold,
      p_label: reward.label,
      p_description: reward.description,
      // Omitted entirely when adding — the parameter defaults to null in SQL,
      // which is how one function serves both add and edit.
      ...(reward.id ? { p_reward: reward.id } : {}),
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidateProgramme();
  return { error: null };
}

export async function deleteRoadmapReward(rewardId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.delete_roadmap_reward",
    supabase.rpc("delete_roadmap_reward", { p_reward: rewardId }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidateProgramme();
  return { error: null };
}

/**
 * Save one item from the single item form (D72). Shape and content are still two
 * RPCs because they have different freeze rules, so this runs them in order.
 *
 * A link is checked BEFORE a new item is created. Otherwise a bad link would
 * create the item, report an error, and a second press of Add would create it
 * twice. The message matches the one `set_roadmap_item_content` raises.
 */
export async function saveRoadmapItem(
  roadmapId: string,
  itemId: string | null,
  shape: {
    level: number;
    category: string;
    title: string;
    source: string;
    unit: string;
    target: number;
    compulsory: boolean;
    sortOrder: number;
  },
  content: { url: string; description: string; imageUrl: string },
): Promise<Result & { id: string | null }> {
  const url = content.url.trim();
  if (url !== "" && !/^https?:\/\//i.test(url)) {
    return {
      error: "a link must start with http:// or https://",
      id: itemId,
    };
  }

  const supabase = await createClient();
  const shapeArgs = {
    p_level: shape.level,
    p_category: shape.category,
    p_title: shape.title,
    p_source: shape.source,
    p_unit: shape.unit,
    p_target: shape.target,
    p_compulsory: shape.compulsory,
    p_sort_order: shape.sortOrder,
  };

  let id = itemId;
  if (id) {
    const { error } = await q(
      "rpc.set_roadmap_item_shape",
      supabase.rpc("set_roadmap_item_shape", { p_item: id, ...shapeArgs }),
    );
    await signOutIfStaleSession(error);
    if (error) return { error: error.message, id };
  } else {
    const { data, error } = await q(
      "rpc.create_roadmap_item",
      supabase.rpc("create_roadmap_item", {
        p_roadmap: roadmapId,
        ...shapeArgs,
      }),
    );
    await signOutIfStaleSession(error);
    if (error) return { error: error.message, id: null };
    id = data as string;
  }

  const { error } = await q(
    "rpc.set_roadmap_item_content",
    supabase.rpc("set_roadmap_item_content", {
      p_item: id,
      p_url: url,
      p_description: content.description,
      p_image_url: content.imageUrl,
    }),
  );
  await signOutIfStaleSession(error);
  revalidateProgramme();
  // The id comes back even on failure, so a retry edits the new item instead of
  // adding a second copy of it.
  return { error: error?.message ?? null, id };
}

export async function reorderRoadmapItems(
  roadmapId: string,
  level: number,
  category: string,
  itemIds: string[],
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.reorder_roadmap_items",
    supabase.rpc("reorder_roadmap_items", {
      p_roadmap: roadmapId,
      p_level: level,
      p_category: category,
      p_items: itemIds,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidateProgramme();
  return { error: null };
}

/** Null clears the total, so the category goes back to "finish every item". */
export async function setRoadmapLevelRequirement(
  roadmapId: string,
  level: number,
  category: string,
  minTotal: number | null,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.set_roadmap_level_requirement",
    supabase.rpc("set_roadmap_level_requirement", {
      p_roadmap: roadmapId,
      p_level: level,
      p_category: category,
      // The generated type says number, and the function treats null as "clear".
      p_min_total: minTotal as number,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidateProgramme();
  return { error: null };
}

export async function setCircleOnRoadmap(
  roadmapId: string,
  groupId: string,
  follow: boolean,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.set_circle_on_roadmap",
    supabase.rpc("set_circle_on_roadmap", {
      p_roadmap: roadmapId,
      p_group: groupId,
      p_follow: follow,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidateProgramme();
  return { error: null };
}

/** Assign or unassign a whole branch (0044, D81): every circle under it follows. */
export async function setBranchOnRoadmap(
  roadmapId: string,
  branchId: string,
  assign: boolean,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.set_branch_on_roadmap",
    supabase.rpc("set_branch_on_roadmap", {
      p_roadmap: roadmapId,
      p_branch: branchId,
      p_assign: assign,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidateProgramme();
  return { error: null };
}
