import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";

/**
 * The MCP endpoint. Stateless: each POST gets its own server and transport, and
 * nothing is remembered between calls, because a serverless function cannot rely
 * on the next request reaching the same instance.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await createMcpServer().connect(transport);
  return transport.handleRequest(request);
}

/**
 * GET would open a long-lived stream for server-initiated messages, and this
 * server sends none. A 405 is how the spec says so, and it stops a function being
 * held open for nothing. DELETE ends a session, and there are no sessions.
 */
function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
