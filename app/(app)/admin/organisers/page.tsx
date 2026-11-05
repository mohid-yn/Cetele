import { redirect } from "next/navigation";
import { Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { Organisers } from "./organisers";

/**
 * Who holds the administration's role (D56), in its own screen (D74).
 *
 * The redirect is courtesy, not the gate: `list_super_admins` returns nothing to
 * anyone else and the grant and revoke RPCs refuse them.
 */
export default async function OrganisersPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string | undefined;
  if (!me) redirect("/");

  const { data: viewer } = await q(
    "organisers.viewer (is_super_admin)",
    supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", me)
      .maybeSingle(),
  );
  if (!viewer?.is_super_admin) redirect("/groups");

  const { data: rows } = await q(
    "organisers.list",
    supabase.rpc("list_super_admins"),
  );

  return (
    <Screen>
      <PageHeader
        eyebrow="Administration"
        title="Organisers"
        subtitle="They see how far everyone has got on a roadmap, and nothing else. No circle’s dhikr, no streaks, no daily figures."
      />
      <Organisers
        me={me}
        organisers={(rows ?? []).map((o) => ({
          userId: o.user_id,
          name: o.name,
          email: o.email,
        }))}
      />
    </Screen>
  );
}
