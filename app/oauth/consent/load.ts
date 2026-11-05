import { createClient } from "@/lib/supabase/server";
import {
  consentRefusal,
  isHttpsUrl,
  readMcpConfig,
  type ConsentRefusal,
} from "@/lib/mcp-policy";

export type ConsentRequest =
  | { kind: "signed-out" }
  | { kind: "invalid" }
  | { kind: "already-approved"; redirectUrl: string }
  | { kind: "refused"; reason: ConsentRefusal; email: string }
  | { kind: "ask"; clientName: string; destination: string; email: string };

/**
 * Loads an approval request and decides what may happen to it. The page and the
 * Server Action both use this, because an action can be called without the page.
 */
export async function loadConsentRequest(
  authorizationId: string,
): Promise<ConsentRequest> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { kind: "signed-out" };
  const email = auth?.claims?.email ?? "";

  const { data: details, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) return { kind: "invalid" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  const isOrganiser = profile?.is_super_admin === true;
  const config = readMcpConfig(process.env);

  // Approved earlier, so Supabase hands back the way out directly and there is no
  // client to check. The other rules still apply, or an organiser who has lost the
  // role, or a server that has been switched off, would pass here.
  if (!("authorization_id" in details)) {
    if (!config.enabled) return { kind: "refused", reason: "disabled", email };
    if (!isOrganiser)
      return { kind: "refused", reason: "not-organiser", email };
    return isHttpsUrl(details.redirect_url)
      ? { kind: "already-approved", redirectUrl: details.redirect_url }
      : { kind: "refused", reason: "wrong-destination", email };
  }

  const reason = consentRefusal({
    config,
    isOrganiser,
    clientId: details.client.id,
    redirectUri: details.redirect_uri,
  });
  if (reason) return { kind: "refused", reason, email };

  return {
    kind: "ask",
    clientName: details.client.name,
    destination: new URL(details.redirect_uri).hostname,
    email,
  };
}
