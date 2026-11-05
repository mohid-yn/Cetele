import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bearerToken,
  consentRefusal,
  isHttpsUrl,
  readMcpConfig,
  tokenRefusal,
  type McpConfig,
} from "./mcp-policy.ts";

const on: McpConfig = {
  enabled: true,
  writesEnabled: true,
  allowedClients: ["claude"],
};

describe("readMcpConfig", () => {
  it("is off when nothing is set", () => {
    assert.deepEqual(readMcpConfig({}), {
      enabled: false,
      writesEnabled: false,
      allowedClients: [],
    });
  });

  it("only accepts the exact value true", () => {
    assert.equal(readMcpConfig({ MCP_ENABLED: "1" }).enabled, false);
    assert.equal(readMcpConfig({ MCP_ENABLED: "TRUE" }).enabled, false);
    assert.equal(readMcpConfig({ MCP_ENABLED: "true" }).enabled, true);
  });

  it("turns writes off with the master switch", () => {
    assert.equal(
      readMcpConfig({ MCP_WRITES_ENABLED: "true" }).writesEnabled,
      false,
    );
    assert.equal(readMcpConfig({ MCP_ENABLED: "true" }).writesEnabled, false);
    assert.equal(
      readMcpConfig({ MCP_ENABLED: "true", MCP_WRITES_ENABLED: "true" })
        .writesEnabled,
      true,
    );
  });

  it("reads a tidy client list", () => {
    assert.deepEqual(
      readMcpConfig({ MCP_ALLOWED_CLIENT_IDS: " a, b ,," }).allowedClients,
      ["a", "b"],
    );
  });
});

describe("bearerToken", () => {
  it("reads a bearer token", () => {
    assert.equal(bearerToken("Bearer abc"), "abc");
    assert.equal(bearerToken("bearer abc"), "abc");
  });

  it("refuses anything else", () => {
    assert.equal(bearerToken(null), null);
    assert.equal(bearerToken(""), null);
    assert.equal(bearerToken("Bearer "), null);
    assert.equal(bearerToken("Basic abc"), null);
    assert.equal(bearerToken("Bearer a b"), null);
  });
});

describe("tokenRefusal", () => {
  const user = { role: "authenticated", sub: "u1" };

  it("accepts an allowed client's token for a user", () => {
    assert.equal(
      tokenRefusal({ ...user, client_id: "claude" }, ["claude"]),
      null,
    );
  });

  it("refuses an app session, which has no client_id", () => {
    assert.equal(tokenRefusal(user, ["claude"]), "not-oauth");
    assert.equal(
      tokenRefusal({ ...user, client_id: "" }, ["claude"]),
      "not-oauth",
    );
  });

  it("refuses another client", () => {
    assert.equal(
      tokenRefusal({ ...user, client_id: "other" }, ["claude"]),
      "client-not-allowed",
    );
  });

  it("refuses every client when the allowlist is empty", () => {
    assert.equal(
      tokenRefusal({ ...user, client_id: "claude" }, []),
      "client-not-allowed",
    );
  });

  it("refuses anon and service tokens", () => {
    for (const role of ["anon", "service_role", undefined]) {
      assert.equal(
        tokenRefusal({ role, sub: "u1", client_id: "claude" }, ["claude"]),
        "not-a-user",
      );
    }
  });

  it("refuses a token with no subject", () => {
    assert.equal(
      tokenRefusal({ role: "authenticated", client_id: "claude" }, ["claude"]),
      "not-a-user",
    );
  });
});

describe("isHttpsUrl", () => {
  it("accepts the callbacks of hosted AI apps", () => {
    for (const url of [
      "https://claude.ai/api/mcp/auth_callback",
      "https://chatgpt.com/connector/oauth/abc123",
      "https://claude.ai/api/mcp/auth_callback?code=x&state=y",
    ]) {
      assert.equal(isHttpsUrl(url), true, url);
    }
  });

  it("refuses anything else", () => {
    for (const url of [
      "http://claude.ai/api/mcp/auth_callback",
      "http://localhost:3118/callback",
      "javascript:alert(1)",
      "not a url",
      "",
    ]) {
      assert.equal(isHttpsUrl(url), false, url);
    }
  });
});

describe("consentRefusal", () => {
  const request = {
    config: on,
    isOrganiser: true,
    clientId: "claude",
    redirectUri: "https://claude.ai/api/mcp/auth_callback",
  };

  it("allows an organiser connecting Claude", () => {
    assert.equal(consentRefusal(request), null);
  });

  it("allows another allowlisted app, with no code change", () => {
    assert.equal(
      consentRefusal({
        ...request,
        config: { ...on, allowedClients: ["claude", "chatgpt"] },
        clientId: "chatgpt",
        redirectUri: "https://chatgpt.com/connector/oauth/abc123",
      }),
      null,
    );
  });

  it("refuses when the server is off", () => {
    assert.equal(
      consentRefusal({ ...request, config: { ...on, enabled: false } }),
      "disabled",
    );
  });

  it("refuses a member", () => {
    assert.equal(
      consentRefusal({ ...request, isOrganiser: false }),
      "not-organiser",
    );
  });

  it("refuses an unknown client, even for an organiser", () => {
    assert.equal(
      consentRefusal({ ...request, clientId: "other" }),
      "client-not-allowed",
    );
  });

  it("refuses a destination that is not HTTPS, even for an organiser", () => {
    assert.equal(
      consentRefusal({
        ...request,
        redirectUri: "http://localhost:3118/callback",
      }),
      "wrong-destination",
    );
  });
});
