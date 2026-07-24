# Account migration runbook — org accounts → owner's new Gmail

> Moves GitHub + Supabase + Vercel (including data) off the org/university accounts onto the owner's new
> Gmail. Consciously **reverses D33**. Ownership transfer is not available (the old email is dead), so every
> leg is a **recreate + copy**, not a transfer.

_Written 2026-07-24. Facts below were measured against production on that date._

---

## 0. Read this before you start

**Decide the production URL first.** The one thing this migration cannot undo cheaply is a second URL change.
A new Vercel project means a new `*.vercel.app` hostname, and that hostname is baked into: the installed PWA
on every member's phone, Google's OAuth redirect URIs, Supabase's redirect allowlist, and the Vault
`push_dispatch_url` the cron scheduler calls.

| Option                                                       | Cost                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Buy the custom domain now, migrate onto it** ← recommended | ~$10–15/yr. One URL change ever. Also unlocks the three things already deferred on it: Resend email, the Google consent-screen logo, a Supabase custom auth domain. |
| Migrate to a new `*.vercel.app`, domain later                | Free now, but you pay the whole redirect/re-install cascade **twice**.                                                                                              |

Everything below is written so the URL appears in exactly one place per system — substitute `NEW_URL` once.

### What's actually being moved (measured 2026-07-24)

| Thing                  | Size / note                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Git history            | 225 commits, one branch (`main`), no tags                                                           |
| `auth.users`           | **21**, all created 2026-07-05 → 07-23, **100% Google OAuth** (0 email/password identities)         |
| Public data            | **~316 rows** total across 15 tables — the largest is `daily_completion` at 109                     |
| Migrations             | 17, all in-repo; `db push` rebuilds the whole schema                                                |
| pg_cron jobs           | 4 — **all created by migrations**, nothing to re-create by hand                                     |
| Vault secrets          | **2** (`push_dispatch_url`, `push_dispatch_secret`) — **not** in migrations, the one manual DB step |
| Edge functions         | none                                                                                                |
| Storage buckets        | none                                                                                                |
| GitHub Actions secrets | **none** — CI runs entirely against a local Supabase stack, so nothing to copy                      |
| Env vars               | 12 (table in §5)                                                                                    |

Because the data is this small, the whole copy runs as **generated SQL through the MCP** — no DB password, no
`pg_dump`, no dashboard access to the old project required.

### The one real risk

All 21 accounts are Google OAuth. The migration preserves each user's `auth.users.id` (UUID) so that all 316
public rows keep pointing at the right person. On the new project they re-authenticate through a **new Google
OAuth client**, and Supabase must match them to the copied row via `auth.identities.provider_id` (Google's
`sub`). Google's `sub` is stable per Google account and not scoped per OAuth client, so this should match — but
**verify it with one account before announcing the move** (step 6.1). If it doesn't match, the fallback is in
§8.

---

## 1. GitHub — rehearsed, then rolled back (not started)

The target repo `ynproject-admin/Cetele` exists and the agent's GitHub account (`Mohidkz05`) is a collaborator
with push access. On 2026-07-24 the history push was run and then **deliberately reverted** at the owner's
request, to be redone as part of one continuous migration. The repo currently sits at its placeholder
`Initial commit` (`86f0dbc`, a one-line `README.md`).

**What the rehearsal established:** the push takes seconds, and there is nothing else on the GitHub side to
carry — 225 commits, one branch (`main`), **no tags, no other branches, no Actions secrets** (CI runs entirely
against a local Supabase stack).

**To do it:**

```bash
git remote add ynproject git@github.com:ynproject-admin/Cetele.git
git push --force ynproject main:main
git ls-remote ynproject main          # must equal `git rev-parse main`
```

**At cutover (step 7.4)** make it the default remote:

```bash
git remote rename origin old-org
git remote rename ynproject origin
git branch --set-upstream-to=origin/main main
```

Then in the new repo's settings: set it **Private**, and confirm branch protection is off (solo workflow, D16).

> The `--force` overwrites the placeholder commit. That is intended — but it is the only destructive step on
> the GitHub side, so confirm the repo still holds nothing but the placeholder before running it.

---

## 2. Google Cloud — new OAuth client

Under the **new Gmail**, at <https://console.cloud.google.com>:

1. New project (e.g. `cetele`).
2. **APIs & Services → OAuth consent screen** — External; app name `Cetele`; support + developer contact = new
   Gmail. Logo upload still requires a verified domain (deferred either way).
3. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorised JavaScript origins: `https://NEW_URL`
   - Authorised redirect URI: `https://<new-supabase-ref>.supabase.co/auth/v1/callback`
     _(you won't have the ref until step 3 — create the Supabase project first, or come back and add it)_
4. Copy the **Client ID** and **Client secret** — they go into Supabase in step 3.4.

> Publish the consent screen (or add the 21 members as test users) before cutover, or sign-in will refuse
> anyone not on the test list.

---

## 3. Supabase — new project + schema

1. New project under the new Gmail. **Region `ap-northeast-2` (Seoul)** to match the current one and stay
   colocated with the Vercel `icn1` functions. Save the DB password.
2. Record the new **project ref**, **URL**, **publishable key**, **service-role key**.
3. Link and push the schema from a clean checkout:

   ```bash
   supabase link --project-ref <new-ref>
   supabase db push          # replays all 17 migrations
   supabase migration list   # expect 17/17, no drift
   ```

   This also creates `pg_cron` + `pg_net`, all 4 cron jobs, and seeds the 6 `badges` rows.

4. **Authentication → Providers → Google:** enable, paste the Client ID + secret from step 2.
5. **Authentication → URL Configuration:**
   - Site URL: `https://NEW_URL`
   - Redirect allowlist: `https://NEW_URL/**` (and `http://127.0.0.1:3000/**` for local dev)
6. **Email:** nothing to do — magic link stays behind `NEXT_PUBLIC_AUTH_EMAIL`, still blocked pending the domain.
7. **Database → Backups:** turn on / verify automated backups now, while the project is empty. This is one of
   the open items in STATUS.md — do it here rather than deferring it again.

---

## 4. Data copy (old → new)

Run **after** step 3 and **before** anyone signs in on the new project.

### 4.1 Generate the script (agent, via Supabase MCP against the old project)

Emit `INSERT`s in this order, preserving every UUID verbatim:

| #   | Schema   | Tables                                                                                                                                                                                                        |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `auth`   | `users` → `identities`                                                                                                                                                                                        |
| 2   | `public` | `profiles` → `groups` → `memberships` → `tasks` → `invites` → `logs` → `streaks` → `daily_completion` → `reminders` → `push_subscriptions` → `reactions` → `badge_awards` → `banner_dismissals` → `audit_log` |

Skip `badges` (seeded by migration 0015) and `reports` (0 rows).

### 4.2 Suppress the new-user trigger during restore

`on_auth_user_created` fires on every `auth.users` insert and writes a `public.profiles` row from Google
metadata. Left enabled, it races the real profile copy and clobbers names, avatars, and **timezones** — and a
wrong timezone is a day-boundary bug (see the STATUS invariant). Wrap the restore:

```sql
alter table auth.users disable trigger on_auth_user_created;
--  … all inserts from 4.1 …
alter table auth.users enable trigger on_auth_user_created;
```

### 4.3 Verify parity

Row counts must match exactly:

| Table                | Expected |
| -------------------- | -------- |
| `auth.users`         | 21       |
| `auth.identities`    | 21       |
| `profiles`           | 21       |
| `groups`             | 8        |
| `memberships`        | 22       |
| `tasks`              | 17       |
| `invites`            | 4        |
| `logs`               | 86       |
| `streaks`            | 21       |
| `daily_completion`   | 109      |
| `reminders`          | 2        |
| `push_subscriptions` | 7        |
| `reactions`          | 6        |
| `badge_awards`       | 1        |
| `banner_dismissals`  | 4        |
| `audit_log`          | 2        |

Also spot-check that `profiles.timezone` survived (not all `UTC`) and that `badge_awards` still resolves to a
seeded `badges` row.

### 4.4 Vault — the step that is not in any migration

```sql
select vault.create_secret('https://NEW_URL/api/push/dispatch', 'push_dispatch_url');
select vault.create_secret('<PUSH_DISPATCH_SECRET>', 'push_dispatch_secret');
```

`push_dispatch_secret` **must be byte-identical** to the `PUSH_DISPATCH_SECRET` env var in Vercel (step 5) —
mismatch means the dispatch endpoint rejects every cron call and reminders die silently with no user-visible
error. Easiest is to carry the existing value over unchanged.

---

## 5. Vercel — new project + env vars

1. New project under the new Gmail, importing `ynproject-admin/Cetele`. Framework Next.js, region **`icn1`**.
2. Set all 12 env vars for **Production + Preview + Development**:

| Var                                    | Action                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | **NEW** — `https://<new-ref>.supabase.co`                                                                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **NEW**                                                                                                              |
| `SUPABASE_SERVICE_ROLE_KEY`            | **NEW**                                                                                                              |
| `VAPID_SUBJECT`                        | **CHECK** — `mailto:` the new Gmail. If empty/invalid, `web-push` refuses to sign and every reminder fails silently. |
| `PUSH_DISPATCH_SECRET`                 | carry unchanged — must equal the Vault secret from 4.4                                                               |
| `VAPID_PRIVATE_KEY`                    | carry **as-is** — regenerating invalidates all 7 push subscriptions                                                  |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`         | carry as-is (pairs with the private key)                                                                             |
| `NEXT_PUBLIC_AUTH_GOOGLE`              | carry                                                                                                                |
| `NEXT_PUBLIC_AUTH_EMAIL`               | carry (still off, domain-blocked)                                                                                    |
| `NEXT_PUBLIC_AUTH_DEV`                 | carry — confirm it is **off** in Production                                                                          |
| `DB_DEBUG` / `NEXT_PUBLIC_DB_DEBUG`    | carry (unset in Production)                                                                                          |

3. Attach the custom domain here if you bought one (§0), **before** the first production deploy, so `NEW_URL`
   never has to change again.
4. Deploy `main`. Confirm the deploy region is `icn1`.
5. Relink the local CLI: `rm -rf .vercel && vercel link` under the new account.

---

## 6. Verify before announcing

Run in this order — 6.1 is the gate.

1. **The auth-identity gate.** Sign in with **your own** Google account on `NEW_URL`. Then check the DB:
   `auth.users` must still be **21**, not 22, and your `profiles` row must still carry your old groups and
   logs. A 22nd row means the identity did not match — stop and go to §8.
2. Sign in with a second real member's account (or ask one). Same check.
3. Core loop: open a circle → count on a task → the ring advances, the collective counter moves.
4. Streaks and the 14-day grid render past history (proves `logs` + `daily_completion` + `streaks` copied).
5. Reactions toggle and untoggle (the D45 path).
6. Install the PWA fresh on a phone from `NEW_URL`; sign in; confirm no login-screen flash (proxy forward).
7. Set a reminder 2 minutes out and confirm the push arrives — this is the end-to-end proof that Vault +
   `PUSH_DISPATCH_SECRET` + VAPID all line up. **If it's quiet, check `VAPID_SUBJECT` first.**
8. `pnpm test:rls` and `pnpm test:e2e` still run against local Supabase — unaffected, but run them once to
   confirm the checkout is clean.

---

## 7. Cutover

1. Tell the 21 members: the app has moved to `NEW_URL`; delete the old installed PWA icon and re-install from
   the new address; sign in with the same Google account. Their history is intact.
2. Old Vercel project → keep it deployed but add a permanent redirect to `NEW_URL` for a few weeks, so anyone
   still on the old icon lands in the right place instead of a dead app.
3. **Freeze writes on the old Supabase project** the moment you start step 4 — any dhikr logged on the old
   project after the copy is silently lost. The window should be minutes, not days.
4. Repoint the local remotes (§1) and update `.env.local` with the new Supabase values.
5. Update `.claude/STATUS.md`: new refs, new URLs, D33 explicitly reversed, and close the migration row.
6. Update Linear.

---

## 8. If the Google identity does not match (fallback)

Symptom: signing in on the new project creates a **22nd** `auth.users` row, or errors on a duplicate email.

- **Cause:** the copied `auth.identities.provider_id` (Google `sub`) didn't match what the new OAuth client
  returned for that account.
- **Fix:** after the affected user signs in once on the new project, read their new `auth.users.id`, then
  re-point their public rows at it and delete the orphaned copy. With 21 users this is survivable by hand, but
  it turns a ½-day job into 1–2 days.
- **Prevent:** do step 6.1 with a single account _before_ copying announcements or deleting anything old, and
  before the old project is frozen — so rolling back is still free.

---

## 9. Decommission (only after a week of clean operation)

- Old Supabase project: take a final backup, then pause it before deleting.
- Old Vercel project: keep the redirect until installs have moved over, then delete.
- Old GitHub repo `mohid-yn/Cetele`: archive rather than delete — it is the only copy of the pre-migration
  remote state.
- Old Google Cloud OAuth client: delete last, once nobody is hitting the old callback.
