# Cetele MCP server — plan

**Status (2026-11-06): step 2 in progress on branch `mohidkhanzada/mcp-server`.** A fake-data route exists at `/api/mcp` and
passes locally. It has not been reached from normal Claude, because Vercel's login blocks previews (see §6). No Supabase
setting has changed. **Do not merge it, or add real data to it, until sign-in is in place.**

Goal: an organiser asks Claude to build a roadmap, and Claude creates a **draft** programme in Cetele with its items and
descriptions. A person reviews and publishes it in the app.

The owner is new to MCP and asked to learn as it is built, so **explain each piece while building it, one step at a time.**

---

## 1. Decisions

| Decision               | Choice                                                            | State                  |
| ---------------------- | ----------------------------------------------------------------- | ---------------------- |
| Where operators use it | Normal Claude and Cowork, no terminal                             | Owner's requirement    |
| Hosting                | Remote server, a route in the existing Next app                   | Follows from the above |
| Login                  | Browser sign-in and approval, like Vercel's MCP                   | Owner's idea, agreed   |
| Auth system            | Supabase OAuth 2.1 server, with existing Google sign-in behind it | Owner agreed           |
| What the AI can change | Drafts only, with no publish tool                                 | Proposed               |
| Learning path          | Toy server first, before any real data                            | Proposed               |

**Why a remote server:** Claude connects to connectors from Anthropic's cloud, including in Desktop and Cowork. A server on
someone's laptop cannot be reached that way.

**Why Supabase OAuth and not GCP:** they do different jobs. Google proves who the person is. Supabase issues the token that
Cetele's database accepts, because every rule depends on the Supabase identity (`auth.uid()`). Using Google alone would
mean building our own token system. Moving auth to GCP was already rejected on 2026-08-15, see
[`HOSTING_MIGRATION.md`](HOSTING_MIGRATION.md) §1. No Google Cloud change is expected.

---

## 2. How it works

```
1. Operator adds the Cetele URL in Claude: Customize > Connectors, then Connect
2. A browser tab opens on Cetele's approval page (Google sign-in first if needed)
3. Operator approves. Supabase issues a token, and Claude stores and renews it
4. Each tool call reaches /api/mcp with that token
5. The route calls the existing database function as that operator
6. The function applies its rules and writes the audit log
```

**The route stays a thin relay, like `authoring-actions.ts`.** Rules stay in the RPCs. Never use the service-role key here:
it would bypass the organiser check and lose the real actor in the audit log.

---

## 3. Planned tools

| Tool                    | Calls                                                                              | Notes                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `list_programmes`       | read `roadmaps`                                                                    | Programme details only                                                                                    |
| `get_programme`         | read items, requirements and rewards                                               | Lets Claude check its own work                                                                            |
| `create_programme`      | `create_roadmap`                                                                   | Always starts unpublished                                                                                 |
| `save_item`             | `create_roadmap_item` or `set_roadmap_item_shape`, then `set_roadmap_item_content` | Same order as `saveRoadmapItem`. Must return the id even on failure, so a retry cannot duplicate the item |
| `set_level_requirement` | `set_roadmap_level_requirement`                                                    | Minimum total for a budgeted category                                                                     |
| `save_reward`           | `upsert_roadmap_reward`                                                            | Threshold, label and description                                                                          |
| `check_readiness`       | `programmeReadiness` in `lib/programme-readiness.ts`                               | Reports what would block publishing                                                                       |

**Left out on purpose:** publish, delete programme, circle assignment, and anything that reads progress, members or
circles. This also keeps member data away from the AI provider.

**Input rules Claude must be told**, in the tool descriptions:

- `category` is one of `book`, `quran`, `quran_studies`, `memorisation`, `listening`.
- `level` and `target` are above 0, and a target of 1 means a yes/no item.
- `unit` is a plural such as "minutes" or "juz", and must agree across a budgeted category.
- `url` must be `http://` or `https://`.

---

## 4. Build steps

| #   | Step            | What happens                                                                  | Done when                                          |
| --- | --------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | Toy server      | Local, one fake tool, connected to Claude Code. Throwaway, for learning       | Owner has watched Claude call the tool             |
| 2   | Hosted test     | Same fake tool on a preview URL                                               | Works from normal Claude                           |
| 3   | Login           | Turn on OAuth, build the approval page at `/oauth/consent`, wire token checks | A real sign-in reaches the route as that user      |
| 4   | Security checks | Answer §5 "Check during the build"                                            | Each one answered and written down here            |
| 5   | Read tools      | `list_programmes`, `get_programme`                                            | Claude reads a real programme                      |
| 6   | Write tools     | The rest of §3                                                                | A draft is created, and a non-organiser is refused |
| 7   | Operator trial  | A real operator builds a draft in Cowork or normal Claude                     | Draft reviewed and published in the app            |

**Before step 3, ask the owner.** Turning on OAuth changes the production Supabase project, because staging shares that database.

Normal process applies: a Linear issue, a feature branch off `staging`, and green checks. Linear needs the owner to
re-authenticate through `/mcp` first. Pure logic gets `test:unit` tests.

**Known code touchpoints**

- `lib/supabase/proxy.ts`: add `/api/mcp` and the discovery path to `PUBLIC_PATHS`. Otherwise an unauthenticated call is
  sent to the login page, and Claude never sees the 401 that starts sign-in. Also check `proxy.ts`'s matcher.
- `/oauth/consent`: a signed-out operator must return to this page after Google sign-in, with the request intact. Build it
  from `components/ui` and the design tokens, and judge it at 390px.
- `supabase/config.toml`: `[auth.oauth_server]` exists with `enabled = false`, and its path is already `/oauth/consent`.
- New packages: the MCP SDK, and `zod` (not currently a direct dependency).
- Writes should refresh the programme screens, like `revalidateProgramme()` does.

---

## 5. Risks and open questions

**Check during the build**

| Question                                           | Why it matters                                                                                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How powerful is the issued token?                  | It probably carries the operator's full permissions, so leaving out a tool is not a hard limit. `client_id` checks in the database may narrow it                                                     |
| How does Supabase's setup fit the MCP token rules? | The spec requires tokens issued for this server and forbids passing them on. Supabase's MCP page does not address audience                                                                           |
| Does Supabase's OAuth server still count as beta?  | Its docs described it that way when checked, so behaviour may change                                                                                                                                 |
| Where can the real sign-in be tested?              | Claude cannot reach previews or staging without a bypass secret, and the approval page is built from the Site URL plus a path, so sign-in probably lands on production. Step 3 needs a plan for this |
| Which client method does Claude use with Supabase? | Claude offers its published identity, automatic registration, or our own client. Prefer the narrowest that works                                                                                     |

**Known risks**

| Risk                                            | Handling                                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| AI invents a hadith, source or citation         | Manual publishing, and tool descriptions telling Claude to use only sources the operator provides           |
| Automatic registration lets any client register | Clear approval page and a way to revoke. Writes still need an organiser                                     |
| Test data lands in production                   | Staging and previews use the production database, so label test drafts and delete them afterwards           |
| Editing a live programme                        | Proposed: tools refuse published programmes in v1. This guards against mistakes and is not a security limit |
| Hosting move to Cloudflare (D65)                | The route moves with the app. Re-test if that move goes ahead                                               |

**Owner questions, none blocking step 1**

1. Who are the operators, and which Claude plan are they on? This decides who adds the connector (table below).
2. Should Claude be able to remove an item from a draft? Proposed: yes for drafts only, as it will make mistakes.
3. Is drafts-only right for v1?

| Claude plan      | Normal Claude             | Cowork                          | Who adds the connector                    |
| ---------------- | ------------------------- | ------------------------------- | ----------------------------------------- |
| Free             | Yes, one custom connector | No                              | The operator                              |
| Pro, Max, Ultra  | Yes                       | Yes                             | The operator                              |
| Team, Enterprise | Yes                       | Yes (Enterprise: owner enables) | An org owner, then each operator connects |

**Fallback if login stalls:** use a temporary personal key to build and test the tools. Claude's custom request headers are in
limited beta, so this may only work in Claude Code. It is not the final setup for operators.

---

## 6. Already checked (2026-11-05)

| Item                       | Result                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project token signing      | ES256 on the public JWKS, which the OAuth server needs                                                                                                                                                                                                                                                                       |
| Vercel preview access      | Previews are behind Vercel Authentication: a POST to `/api/mcp` on the branch URL returns 401, and staging also refuses (302). Claude connects from the cloud, so it is blocked too. Do not turn protection off, as staging reads the production database. Testing needs a bypass secret, using `x-vercel-protection-bypass` |
| OAuth server on production | Not on: `/.well-known/oauth-authorization-server/auth/v1` returns 404                                                                                                                                                                                                                                                        |
| Authoring RPCs             | Organiser-only and audited, granted to `authenticated` (migration 0030)                                                                                                                                                                                                                                                      |
| Drafts                     | `create_roadmap` always inserts `published = false`                                                                                                                                                                                                                                                                          |
| Readiness                  | Client-only rule. `set_roadmap_published` accepts an empty roadmap                                                                                                                                                                                                                                                           |

## 7. References

- [Claude: add a connector by URL](https://claude.com/docs/connectors/custom/remote-mcp)
- [Claude: build an MCP server](https://claude.com/docs/connectors/building/index.md)
- [Claude: connector authentication](https://claude.com/docs/connectors/building/authentication.md)
- [Supabase: MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Supabase: OAuth 2.1 server, getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Supabase: deploy MCP servers](https://supabase.com/docs/guides/ai-tools/byo-mcp)
- [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
