import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * The organiser MCP server (docs/MCP_PLAN.md), at step 2: FAKE DATA, NO LOGIN.
 *
 * This proves that an AI app can reach the route over the web. It must not gain
 * a real read or write until step 3 puts sign-in in front of it, because the
 * route is open to anyone with the URL.
 */
const FAKE_PROGRAMMES = [
  { name: "TOY Programme A", published: true, items: 12 },
  { name: "TOY Programme B", published: false, items: 3 },
];

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "cetele", version: "0.0.1" });

  server.registerTool(
    "list_programmes",
    {
      description:
        "List Cetele programmes. This is a test version, so the data is fake.",
      inputSchema: {
        onlyDrafts: z
          .boolean()
          .optional()
          .describe("If true, only return unpublished programmes"),
      },
    },
    async ({ onlyDrafts }) => {
      const programmes = onlyDrafts
        ? FAKE_PROGRAMMES.filter((programme) => !programme.published)
        : FAKE_PROGRAMMES;
      return {
        content: [{ type: "text", text: JSON.stringify(programmes, null, 2) }],
      };
    },
  );

  return server;
}
