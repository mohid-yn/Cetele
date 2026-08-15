# Hosting migration — Vercel → Cloudflare (planned, ~2026-09)

**Status: NOT STARTED. Decided 2026-08-15, to be done next month.**
Supabase stays exactly where it is. This moves the compute tier only.

---

## 1. Why, and what is actually being solved

| Driver                         | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cost**                       | Real. Vercel Hobby is free but **non-commercial only** — the moment Cetele charges, takes donations, or is deployed for an organisation, its terms require Pro (~$20/user/mo). That clause, not capacity, is what forces the upgrade: measured 2026-08-15, prod is **24 MB, 54 users, 19 circles, 395 log rows** — orders of magnitude below every Hobby limit. Cloudflare Workers is ~$5/mo paid, generous free tier.                                                                                                                                                                                                            |
| **"Functions skip execution"** | **UNCONFIRMED, and there is a documented in-app cause that looks identical.** `claim_due_reminders` only fires when `last_sent_on <> today` (0033, L179), and **`set_reminder` never clears `last_sent_on`** — a known unfixed bug inherited from 0013. So a reminder that fired at 07:00 and was then moved to 20:00 silently does not fire again that day. Indistinguishable from a dropped invocation. **Diagnose before treating platform reliability as a requirement for this migration** — the same "write looks dropped" shape has been ours every time so far (the 600ms debounce, `use-action.ts`' refresh coalescing). |
| **DNS**                        | Cloudflare, bought as part of the move.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**Rejected: moving authentication to GCP.** Considered and dropped 2026-08-15. The
authorization model IS Supabase Auth — every RLS policy keys on `auth.uid()`,
`on_auth_user_created` creates the `profiles` row, `private.require_caller_profile()`
underpins every write, and **727 pgTAP assertions are written against that identity**.
Replacing it means minting custom JWTs signed with Supabase's secret so `auth.uid()`
still resolves: possible, but a real project with a real chance of a security
regression, in exchange for replacing something that is already free and already
working. **GCP is already in the auth path in the role it is good at** — see §2.

---

## 2. What runs where, before and after

|                                | Now                           | After                          |
| ------------------------------ | ----------------------------- | ------------------------------ |
| Postgres, RLS, RPCs, `pg_cron` | Supabase (Seoul)              | **unchanged**                  |
| Auth (`auth.users`, JWT, PKCE) | Supabase GoTrue               | **unchanged**                  |
| Identity provider              | **GCP** — Google OAuth client | **unchanged**                  |
| Next.js app                    | Vercel functions (`icn1`)     | Cloudflare Workers             |
| DNS                            | —                             | Cloudflare                     |
| Web Push send                  | Vercel function               | Workers, **or** Cloud Run (§4) |

**The GCP/Supabase split, because it is the thing that was misremembered:** GCP is the
identity PROVIDER (it vouches that this person is that Google account — the OAuth
client, consent screen, client ID/secret live there). Supabase is the auth SYSTEM (it
holds those credentials, runs the PKCE exchange, owns `auth.users`, and issues the JWT
that makes `auth.uid()` work). Google already does the part it is good at.

---

## 3. THE LOCKOUT RISK — read this before touching DNS

**Measured 2026-08-15: 100% of production users (54 of 54) authenticate with Google.
Not one uses a magic link.** There is no password fallback. If the redirect URIs are
not right at cutover, **every user is locked out with no way in.**

Cutover checklist, in this order:

1. **GCP OAuth client** → add the new authorized redirect URI. **Keep the old one.**
2. **Supabase** → add the new Site URL + `additional_redirect_urls`. **Keep the old ones.**
3. Deploy to Cloudflare on a preview hostname; sign in with Google end-to-end.
4. Only then move DNS.
5. Remove the old URIs **a week later**, not the same day.

Both allowlists are **exact-match**. `http://` vs `https://`, a trailing slash, or
`www.` is a lockout.

---

## 4. The only two things in the codebase that are not portable

Audited 2026-08-15 — the whole repo has exactly two Node-specific spots, both in the
push path:

| File                             | Dependency                                                      |
| -------------------------------- | --------------------------------------------------------------- |
| `lib/push/send.ts`               | `web-push` — Node crypto for VAPID signing + payload encryption |
| `app/api/push/dispatch/route.ts` | `timingSafeEqual` from `node:crypto`                            |

Everything else is portable as-is: `supabase-js` is `fetch`-based, `@supabase/ssr` is
cookies, and every page/action is a plain async function. No filesystem, no
long-running process, no native module.

- `timingSafeEqual` → a few lines of Web Crypto, or `nodejs_compat`.
- `web-push` → **prove this out FIRST, before anything else in the migration.** Workers
  are V8 isolates; `nodejs_compat` covers much of `node:crypto` but VAPID signing and
  payload encryption are exactly the thing to test rather than assume.
- **If `web-push` does not work on Workers, THAT is Cloud Run's job** — one small Node
  service exposing the dispatch endpoint, called by `pg_cron` exactly as today. One job,
  sized to the one thing that genuinely cannot run on an isolate. **Cloud Run has no
  other role**; running it alongside Workers for general traffic would be two compute
  platforms doing one thing.

---

## 5. Route

`@opennextjs/cloudflare` runs Next.js App Router on Workers. Rough order:

1. Confirm or refute the "skipped execution" claim (§1). It may remove a stated reason.
2. Prove `web-push` on Workers (§4). Decides whether Cloud Run is in scope at all.
3. Branch off `staging`, add `@opennextjs/cloudflare`, get a preview deploy building.
4. Port env vars — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, the three `VAPID_*`, and the push dispatch secret.
   **`NEXT_PUBLIC_AUTH_DEV` must NOT be set** (§7 of STATUS).
5. Run the e2e suite against the preview URL.
6. Google sign-in end-to-end on the preview hostname (§3).
7. DNS cutover, old redirect URIs still live.
8. Watch reminders fire for a week (`pg_cron` → dispatch is the least-exercised path).

---

## 6. Sequencing — do this AFTER the feature stack lands

As of 2026-08-15 there are **four features stacked and unpromoted** (D61–D64) and
**three unpushed migrations**, one of which (0033) drops `public.reminders` with live
rows in it. Land those on production first. Changing hosts and shipping D61–D64
together means every bug has two possible causes, and the reminder path is implicated
in both.

**Also: prod is on the Supabase FREE plan — no daily backups, no PITR.** Take a manual
dump before pushing 0033. That is unrelated to this migration but shares its window.
