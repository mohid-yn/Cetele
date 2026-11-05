import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { bearerToken, tokenRefusal, type McpConfig } from "@/lib/mcp-policy";

/** Where a client learns which login system to use. See the route beside it. */
export const MCP_METADATA_PATH = "/api/mcp/oauth-protected-resource";

function unauthorized(request: Request): Response {
  const metadata = `${new URL(request.url).origin}${MCP_METADATA_PATH}`;
  return Response.json(
    { error: "Sign-in required" },
    {
      status: 401,
      headers: {
        // Claude only starts sign-in from a 401 that carries this pointer.
        "WWW-Authenticate": `Bearer resource_metadata="${metadata}"`,
      },
    },
  );
}

const forbidden = (error: string): Response =>
  Response.json({ error }, { status: 403 });

/**
 * Who is calling, or the response that refuses them. Runs on every request.
 *
 * The client it returns acts AS THE CALLER and never with the service role, so
 * RLS, the RPCs' organiser checks and the audit log all see the real person.
 */
export async function authenticateMcpRequest(
  request: Request,
  config: McpConfig,
): Promise<{ supabase: SupabaseClient<Database>; userId: string } | Response> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized(request);

  const supabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );

  // Checks the signature and expiry against the project's public keys.
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) return unauthorized(request);

  const claims = data.claims;
  if (tokenRefusal(claims, config.allowedClients)) {
    return forbidden("This token cannot be used with the Cetele connector.");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", claims.sub)
    .maybeSingle();
  if (profile?.is_super_admin !== true) {
    return forbidden("Only programme organisers can use this connector.");
  }

  return { supabase, userId: claims.sub };
}
