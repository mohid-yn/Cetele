import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";

/**
 * `/admin` has no screen of its own. An organiser lands on the roadmap hub, a
 * steward (D79) on their events, and anyone else on the circle picker.
 */
export default async function AdminPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub ?? "";

  const [{ data: viewer }, { data: stewardRows }] = await Promise.all([
    q(
      "admin.viewer (is_super_admin)",
      supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", me)
        .maybeSingle(),
    ),
    q(
      "admin.viewer (steward)",
      supabase
        .from("branch_stewards")
        .select("branch_id")
        .eq("user_id", me)
        .limit(1),
    ),
  ]);

  if (viewer?.is_super_admin) redirect("/programme");
  if ((stewardRows ?? []).length > 0) redirect("/admin/events");
  redirect("/groups");
}
