import { test, expect } from "@playwright/test";
import { makeSuperAdmin, signIn } from "./helpers";

/**
 * The organiser MCP server, as far as it can be reached without an OAuth client
 * (docs/MCP_PLAN.md). `.env.ci` switches it on, with reads only.
 */
const STAMP = Date.now();

test("the MCP route asks for sign-in instead of redirecting to login", async ({
  request,
}) => {
  const response = await request.post("/api/mcp", {
    data: {},
    maxRedirects: 0,
  });
  expect(response.status()).toBe(401);
  expect(response.headers()["www-authenticate"]).toContain(
    "/api/mcp/oauth-protected-resource",
  );

  const metadata = await request.get("/api/mcp/oauth-protected-resource");
  expect(metadata.status()).toBe(200);
  expect((await metadata.json()).resource).toMatch(/\/api\/mcp$/);
});

test("an organiser gets the setup steps, and a member does not", async ({
  page,
}) => {
  const email = `e2e-connect-${STAMP}@example.com`;
  await signIn(page, email);

  await page.goto("/programme/connect");
  await expect(page).toHaveURL(/\/programme$/);

  await makeSuperAdmin(email);
  await page.goto("/programme");
  await page.getByRole("link", { name: "Build with Claude" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect Claude" }),
  ).toBeVisible();
  await expect(page.getByText(/\/api\/mcp$/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy OAuth client ID" }),
  ).toBeVisible();
});
