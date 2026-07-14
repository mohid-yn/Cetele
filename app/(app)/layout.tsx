import { MockStateProvider } from "@/lib/mock/store";
import { CelebrationProvider } from "@/components/demo/celebration";
import { AppFrame } from "@/components/demo/app-frame";
import { TimezoneSync } from "@/components/app/timezone-sync";
import { createClient } from "@/lib/supabase/server";

/**
 * Shell for every in-app screen: mock state + celebration layer + the app frame.
 *
 * TimezoneSync lives HERE, not on a page (D44). The timezone is the member's day
 * boundary, so every date the server renders before it is known is a guess — and
 * a member can enter the app on any screen (an invite link drops them straight
 * onto /today, never passing /groups). Mounting it in the shell is the only
 * placement that learns the zone on whichever screen they actually land on first.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;

  const { data: profile } = me
    ? await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", me)
        .maybeSingle()
    : { data: null };

  return (
    <MockStateProvider>
      <CelebrationProvider>
        <TimezoneSync current={profile?.timezone ?? "UTC"} />
        <AppFrame>{children}</AppFrame>
      </CelebrationProvider>
    </MockStateProvider>
  );
}
