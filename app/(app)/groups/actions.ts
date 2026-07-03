"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Create a group via the create_group RPC (atomic group + owner membership). */
export async function createGroup(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Group name is required" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_group", { p_name: trimmed });
  if (error) return { error: error.message };

  revalidatePath("/groups");
  return { error: null };
}
