"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_GROUP_COOKIE } from "@/lib/active-group";
import { groupHref } from "@/lib/group-href";

/**
 * Accept an invite (D34/D35): the accept_invite RPC validates the code + email
 * lock, creates the membership, and consumes a locked invite. On success the
 * joined group becomes active (last-visited cookie) and we land on it directly
 * (CET-25 path routing).
 */
export async function acceptInvite(
  code: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite", {
    p_code: code,
  });
  if (error) return { error: error.message };

  (await cookies()).set(ACTIVE_GROUP_COOKIE, data.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(groupHref(data.id, "/today"));
}
