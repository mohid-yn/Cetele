import { createClient } from "@/lib/supabase/server";
import {
  consentRefusal,
  isClaudeCallback,
  readMcpConfig,
  type ConsentRefusal,
} from "@/lib/mcp-policy";

export type ConsentRequest =
  | { kind: "signed-out" }
  | { kind: "invalid" }
  | { kind: "already-approved"; redirectUrl: string }
  | { kind: "refused"; reason: ConsentRefusal }
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

  const { data: details, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) return { kind: "invalid" };

  // Already approved earlier, so Supabase hands back the way out directly.
  if (!("authorization_id" in details)) {
    return isClaudeCallback(details.redirect_url)
      ? { kind: "already-approved", redirectUrl: details.redirect_url }
      : { kind: "refused", reason: "wrong-destination" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", userId)
    .maybeSingle();

  const reason = consentRefusal({
    config: readMcpConfig(process.env),
    isOrganiser: profile?.is_super_admin === true,
    clientId: details.client.id,
    redirectUri: details.redirect_uri,
  });
  if (reason) return { kind: "refused", reason };

  return {
    kind: "ask",
    clientName: details.client.name,
    destination: new URL(details.redirect_uri).hostname,
    email: details.user.email,
  };
}
