import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";

/**
 * `/admin` has no screen of its own. The workspace opens on the roadmap hub, and
 * anyone who is not an organiser goes to the circle picker.
 */
export default async function AdminPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;

  const { data: viewer } = await q(
    "admin.viewer (is_super_admin)",
    supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", me ?? "")
      .maybeSingle(),
  );

  redirect(viewer?.is_super_admin ? "/programme" : "/groups");
}
