import { readMcpConfig } from "@/lib/mcp-policy";

/**
 * Tells an MCP client which login system issues tokens for this server (RFC 9728).
 * Supabase is the login system, and Google sign-in sits behind it.
 *
 * `resource` must match the URL entered in Claude exactly, so it is built from the
 * address this request arrived on.
 */
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  if (!readMcpConfig(process.env).enabled) {
    return new Response(null, { status: 404 });
  }
  return Response.json({
    resource: `${new URL(request.url).origin}/api/mcp`,
    authorization_servers: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
    bearer_methods_supported: ["header"],
  });
}
