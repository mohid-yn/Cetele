"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";

/** Create a group via the create_group RPC (atomic group + owner membership). */
export async function createGroup(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Group name is required" };

  const supabase = await createClient();
  const { error } = await q(
    "rpc.create_group",
    supabase.rpc("create_group", { p_name: trimmed }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  revalidatePath("/groups");
  return { error: null };
}
