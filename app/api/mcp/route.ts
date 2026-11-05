import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { revalidatePath } from "next/cache";
import { authenticateMcpRequest } from "@/lib/mcp-auth";
import { readMcpConfig } from "@/lib/mcp-policy";
import { createMcpServer } from "@/lib/mcp-tools";

/**
 * The MCP endpoint (docs/MCP_PLAN.md). OFF unless `MCP_ENABLED` is exactly "true".
 *
 * Stateless: each POST gets its own server and transport, and nothing is
 * remembered between calls, because a serverless function cannot rely on the next
 * request reaching the same instance.
 */
export const dynamic = "force-dynamic";

const notFound = () => new Response(null, { status: 404 });

export async function POST(request: Request): Promise<Response> {
  const config = readMcpConfig(process.env);
  if (!config.enabled) return notFound();

  const caller = await authenticateMcpRequest(request, config);
  if (caller instanceof Response) return caller;

  const server = createMcpServer({
    supabase: caller.supabase,
    writesEnabled: config.writesEnabled,
    // The same two readers `authoring-actions.ts` refreshes.
    onWrite: () => {
      revalidatePath("/programme", "layout");
      revalidatePath("/g", "layout");
    },
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

/**
 * GET would open a long-lived stream for server-initiated messages, and this
 * server sends none. A 405 is how the spec says so, and it stops a function being
 * held open for nothing. DELETE ends a session, and there are no sessions.
 */
function methodNotAllowed(): Response {
  if (!readMcpConfig(process.env).enabled) return notFound();
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
