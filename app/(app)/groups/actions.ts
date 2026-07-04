"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_GROUP_COOKIE } from "@/lib/active-group";

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

/**
 * Make a group the active one (F5 cookie home) and open its manage screen.
 * Visibility is validated under RLS — a group you can't see never becomes
 * active. Used as a <form action> so it works without client JS.
 */
export async function openManage(groupId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("groups")
    .select("id")
    .eq("id", groupId)
    .maybeSingle();
  if (!data) return;

  (await cookies()).set(ACTIVE_GROUP_COOKIE, groupId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/group/manage");
}
