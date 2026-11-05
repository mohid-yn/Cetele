# Cetele MCP server — plan and go-live runbook

**Status (2026-11-06): the server is on `staging`, OFF by default, and not on production. The seven-day connection limit is on branch `mohidkhanzada/mcp-session-expiry`, waiting for approval to run its migration.** Nothing has been tested with a real sign-in or a real database write, because neither is possible before go-live (§4). No Supabase setting has changed.

Goal: an organiser asks Claude to build a roadmap, and Claude creates a **draft** programme in Cetele with its items and
descriptions. A person reviews and publishes it in the app.

The owner is new to MCP and asked to learn as it is built, so **explain each piece as you work on it.**

---

## 1. Decisions

| Decision               | Choice                                                              | State                |
| ---------------------- | ------------------------------------------------------------------- | -------------------- |
| Where operators use it | Normal Claude and Cowork, no terminal                               | Owner's requirement  |
| Hosting                | A route in the existing Next app (`/api/mcp`)                       | Follows from above   |
| Login                  | Browser sign-in and approval                                        | Owner's idea         |
| Auth system            | Supabase OAuth 2.1 server, with existing Google sign-in behind it   | Owner agreed         |
| Rollout                | Real tools, shipped behind flags and tested on production           | Owner's decision     |
| What the AI can change | Drafts only, with no publish tool. It can remove items from a draft | Built, not confirmed |
| Client registration    | One pre-registered client, with open registration off               | Built, not confirmed |

**Why a remote server:** Claude connects to connectors from Anthropic's cloud, including in Desktop and Cowork.

**Why Supabase OAuth and not GCP:** Google proves who the person is. Supabase issues the token that Cetele's database
accepts, because every rule depends on the Supabase identity (`auth.uid()`). Moving auth to GCP was already rejected on
2026-08-15, see [`HOSTING_MIGRATION.md`](HOSTING_MIGRATION.md) §1. No Google Cloud change is expected.

---

## 2. How it works

```
1. Operator adds the Cetele URL in Claude and clicks Connect
2. A browser tab opens on /oauth/consent (Google sign-in first if needed)
3. Operator clicks Allow. Supabase issues a token, and Claude stores and renews it
4. Each tool call reaches /api/mcp with that token
5. The route checks the token and the organiser flag, then calls the RPC as that person
6. The RPC applies its rules and writes the audit log
```

| File                                            | Job                                                 |
| ----------------------------------------------- | --------------------------------------------------- |
| `lib/mcp-policy.ts`                             | Flags and refusal rules. Pure, and unit tested      |
| `lib/mcp-tools.ts`                              | The tools. Thin relays to the RPCs, and unit tested |
| `lib/mcp-auth.ts`                               | Token and organiser check on every request          |
| `app/api/mcp/route.ts`                          | The MCP endpoint                                    |
| `app/api/mcp/oauth-protected-resource/route.ts` | Tells Claude which login system to use              |
| `app/oauth/consent/`                            | The approval page                                   |

**Never use the service-role key here.** It would bypass the organiser check and lose the real actor in the audit log.

### Tools

| Tool                    | Calls                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `list_programmes`       | Reads `roadmaps`                                                                   |
| `get_programme`         | Reads items, requirements and rewards, and reports `programmeReadiness`            |
| `create_programme`      | `create_roadmap`                                                                   |
| `save_item`             | `create_roadmap_item` or `set_roadmap_item_shape`, then `set_roadmap_item_content` |
| `delete_item`           | `delete_roadmap_item`                                                              |
| `set_level_requirement` | `set_roadmap_level_requirement`                                                    |
| `save_reward`           | `upsert_roadmap_reward`                                                            |

**Left out on purpose:** publish, delete programme, circle assignment, and anything that reads progress, members or circles.

---

## 3. Flags and blocks

All server-only environment variables. Each fails closed, and a change needs a redeploy.

| Flag                     | Effect                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| `MCP_ENABLED`            | Must be exactly `true`, or the routes return 404 and approval is refused |
| `MCP_WRITES_ENABLED`     | Must be exactly `true` as well, or write tools are not offered           |
| `MCP_ALLOWED_CLIENT_IDS` | Comma list of Supabase OAuth client ids. Empty refuses everyone          |

| Block                                                                | Stops                                                 | Enforced in                 |
| -------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------- |
| Signature and expiry check on every request                          | Forged or expired tokens                              | `lib/mcp-auth.ts`           |
| `client_id` must be on the allowlist                                 | App session tokens and other OAuth clients            | `lib/mcp-policy.ts`         |
| Organiser check on every request                                     | Members, and organisers who have since lost the role  | `lib/mcp-auth.ts`           |
| Approval only for organisers                                         | Members being issued a token through the page         | `app/oauth/consent`         |
| Approval only for the allowlisted client and Claude's exact callback | Lookalike apps and redirects                          | `lib/mcp-policy.ts`         |
| Writes refuse a published programme, and an item from one            | AI changes reaching members                           | `lib/mcp-tools.ts`          |
| No publish tool                                                      | Claude publishing                                     | `lib/mcp-tools.ts`          |
| Connections end after 7 days (migration 0039)                        | A stolen or forgotten connection lasting forever      | `lib/mcp-auth.ts`, database |
| Input limits, and http(s) links only                                 | Malformed or oversized input                          | `lib/mcp-tools.ts`          |
| Existing RPC rules                                                   | Non-organisers, frozen fields, deleting recorded work | Database                    |

### Remaining risks

| Risk                                               | Position                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **The token also works against Supabase directly** | It carries the person's normal permissions, and scopes do not limit database access. So the drafts-only rule binds Claude's tools, not a stolen token, which could publish as that organiser. Exposure matches a stolen app session, held by Anthropic rather than a browser. A database-level limit on `client_id` is possible, but it is a production migration on every request and could not be tested here (no Docker), so it was not built |
| Token audience                                     | Tokens carry `aud: authenticated`, so the spec's audience check cannot be met as written. `client_id` is the substitute. Forwarding the token to Supabase follows Supabase's own recommended setup                                                                                                                                                                                                                                               |
| AI invents a hadith, source or citation            | Server instructions forbid it, and a person reviews before publishing. This is guidance, not a technical block, so **review matters**                                                                                                                                                                                                                                                                                                            |
| Beta                                               | Supabase's OAuth server is in beta, so behaviour or pricing may change                                                                                                                                                                                                                                                                                                                                                                           |
| Hosting move to Cloudflare (D65)                   | The route moves with the app. Re-test if that goes ahead                                                                                                                                                                                                                                                                                                                                                                                         |

---

## 4. Tested so far (2026-11-06)

| Check                                                                                          | Result                                |
| ---------------------------------------------------------------------------------------------- | ------------------------------------- |
| Policy and tool unit tests (`pnpm test:unit`), with a fake database                            | Pass                                  |
| Production build, flags off: route and metadata                                                | 404                                   |
| Production build, flags on: no token, Basic auth, garbage                                      | 401, with sign-in pointer on no token |
| Signed-out `/oauth/consent` keeps `authorization_id`, and other routes are unchanged           | Pass                                  |
| Six forged tokens against production's real public keys, including one signed with a wrong key | All refused                           |
| Approval page at 390px, ask state                                                              | Checked by eye                        |
| Normal Claude reaching a preview, using an earlier fake tool and a bypass secret               | Worked (owner)                        |

**Not tested, and only testable at go-live:** a real sign-in, the approve and deny calls, any real database read or write
through the tools, a non-organiser being refused with a real token, and a real app session being refused. Treat these as
unproven until §5 is complete.

---

## 5. Go-live runbook

Each step needs the owner. Stop and turn `MCP_ENABLED` off if anything looks wrong. Claude cannot reach previews or
staging without a bypass secret, which is why the real test happens on production.

| #   | Step                                                                                                                                                                                   | Check                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 0   | **Run migration 0039** with `supabase db push`, a separate approval from promoting. Then merge the branch to `staging`                                                                 | The `expire-mcp-sessions` job exists, and normal sign-in still works |
| 1   | **Promote to `main`.** Flags are unset, so the feature stays off                                                                                                                       | `/api/mcp` returns 404 on production                                 |
| 2   | **Supabase:** Authentication > OAuth Server. Enable it, set the path to `/oauth/consent`, and leave dynamic registration **off**. Confirm the Site URL is the production URL           | Normal Google sign-in still works                                    |
| 3   | **Supabase:** Authentication > OAuth Apps > Add. Name `Claude`, type **Public**, redirect URI `https://claude.ai/api/mcp/auth_callback`. Copy the client id                            | Discovery URL stops returning 404                                    |
| 4   | **Vercel production env:** `MCP_ALLOWED_CLIENT_IDS=<client id>` and `MCP_ENABLED=true`. Redeploy. Leave writes off                                                                     | `/api/mcp` POST with no token returns 401                            |
| 5   | **Claude:** add a custom connector with `https://cetele-sable.vercel.app/api/mcp`, choose **Use your own OAuth client**, and enter the client id. Connect as an organiser, and approve | Claude lists the real programmes                                     |
| 6   | **Refusal tests:** connect with a non-organiser account                                                                                                                                | Refused at the page, with no way to approve                          |
| 7   | **Vercel:** `MCP_WRITES_ENABLED=true`. Redeploy                                                                                                                                        | Write tools appear after reconnecting                                |
| 8   | **Ask Claude to build a test draft.** Check it in `/programme`, try to get Claude to edit a published programme, then delete the draft in the app                                      | Draft is unpublished and refused edits are refused                   |
| 9   | **Operator trial** in Cowork or normal Claude                                                                                                                                          | Draft reviewed and published in the app                              |

**After go-live, confirm the seven-day limit:** Supabase may skip the Allow screen for a client already approved, so reconnecting may only need a click while signed in to Cetele. A stolen token cannot do that, as it needs the browser session. Confirm how Claude prompts for this when it first happens.

**To turn it off:** set `MCP_ENABLED` to anything else and redeploy. Supabase's OAuth server can also be disabled.

**Owner questions**

1. Who are the operators, and which Claude plan are they on? On Team or Enterprise, an org owner adds the connector.
2. Confirm drafts-only and draft item removal.

| Claude plan      | Normal Claude             | Cowork                          | Who adds the connector                    |
| ---------------- | ------------------------- | ------------------------------- | ----------------------------------------- |
| Free             | Yes, one custom connector | No                              | The operator                              |
| Pro, Max, Ultra  | Yes                       | Yes                             | The operator                              |
| Team, Enterprise | Yes                       | Yes (Enterprise: owner enables) | An org owner, then each operator connects |

**Not set up yet:** Claude Code as a client. Its callback is a local address on a varying port, which the approval page refuses.

---

## 6. References

- [Claude: add a connector by URL](https://claude.com/docs/connectors/custom/remote-mcp)
- [Claude: connector authentication](https://claude.com/docs/connectors/building/authentication.md)
- [Supabase: MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Supabase: OAuth 2.1 server, getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Supabase: token security](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [Supabase: deploy MCP servers](https://supabase.com/docs/guides/ai-tools/byo-mcp)
- [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
