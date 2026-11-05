/**
 * The MCP server's on/off switches and hard blocks (docs/MCP_PLAN.md).
 *
 * Pure, so `mcp-policy.test.ts` pins every refusal. Every check here FAILS CLOSED:
 * an unset flag, an empty allowlist or a missing claim all mean no.
 */

/**
 * The client registered for Claude in Supabase, shown on the setup page. Public by
 * design: Claude sends it openly, and it has no secret. Registering it is not enough
 * to connect, as `MCP_ALLOWED_CLIENT_IDS` must also list it.
 */
export const CLAUDE_CLIENT_ID = "aa300035-9e96-4d37-ad60-fd3a761a738a";

export type McpConfig = {
  enabled: boolean;
  writesEnabled: boolean;
  allowedClients: string[];
};

export function readMcpConfig(
  env: Record<string, string | undefined>,
): McpConfig {
  const enabled = env.MCP_ENABLED === "true";
  return {
    enabled,
    // Writes need the master switch as well, so one flag can turn everything off.
    writesEnabled: enabled && env.MCP_WRITES_ENABLED === "true",
    allowedClients: (env.MCP_ALLOWED_CLIENT_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  };
}

export function bearerToken(header: string | null): string | null {
  const match = /^Bearer +([^\s]+)$/i.exec(header ?? "");
  return match ? match[1] : null;
}

export type TokenRefusal = "not-a-user" | "not-oauth" | "client-not-allowed";

/**
 * Is this signature-checked token one the MCP route should accept?
 *
 * Supabase issues OAuth tokens with the same `authenticated` audience as an app
 * session, so the audience cannot tell them apart. `client_id` can. A session
 * token from the app has none, and is refused here.
 */
export function tokenRefusal(
  claims: { role?: unknown; sub?: unknown; client_id?: unknown },
  allowedClients: string[],
): TokenRefusal | null {
  if (claims.role !== "authenticated" || typeof claims.sub !== "string") {
    return "not-a-user";
  }
  if (typeof claims.client_id !== "string" || claims.client_id === "") {
    return "not-oauth";
  }
  return allowedClients.includes(claims.client_id)
    ? null
    : "client-not-allowed";
}

/**
 * Only HTTPS destinations. Which app may use which address is not decided here:
 * Supabase matches a registered client's callback exactly, and the allowlist says
 * which clients count. Adding an AI app therefore needs no code change. This also
 * means a local callback, like Claude Code's, stays refused.
 */
export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export type ConsentRefusal =
  | "disabled"
  | "not-organiser"
  | "client-not-allowed"
  | "wrong-destination";

/** May this person approve this client? Checked before the page offers Allow. */
export function consentRefusal(input: {
  config: McpConfig;
  isOrganiser: boolean;
  clientId: string;
  redirectUri: string;
}): ConsentRefusal | null {
  if (!input.config.enabled) return "disabled";
  if (!input.config.allowedClients.includes(input.clientId)) {
    return "client-not-allowed";
  }
  if (!isHttpsUrl(input.redirectUri)) return "wrong-destination";
  return input.isOrganiser ? null : "not-organiser";
}
