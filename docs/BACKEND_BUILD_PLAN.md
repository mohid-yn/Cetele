# Backend build plan — sequenced execution (CET-2 → v1 backend)

> **What this is:** the ordered "what to build next, in what order, done when" plan
> for taking Cetele from _foundation-only backend + disconnected mock_ to a
> working v1 backend. Grounded in the 2026-07-03 backend/frontend review.
>
> **How it relates to the other docs:**
>
> - [`MIGRATION_MOCK_TO_SUPABASE.md`](./MIGRATION_MOCK_TO_SUPABASE.md) = the **how** (schema §3, RLS §4, selector→query §5, action→Server-Action §6, auth §7, realtime §8). This plan references it; it does not repeat it.
> - [`PRD.md`](./PRD.md) §6 = the **data model** (the 12-table yardstick).
> - [`.claude/STATUS.md`](../.claude/STATUS.md) = **live status** (which milestone we're on). This doc is the map; STATUS is the "you are here".

---

## Where we are (verified against the live DB, 2026-07-03)

**Applied & secure:** `profiles`, `groups`, `memberships` — RLS on all three,
`SECURITY DEFINER` helpers in a `private` schema, owner-safety in the policies,
RPCs `create_group` + `transfer_ownership`, and the owner-pointer column lock
(migration `0004`, owner-orphan fix). Foundation is high quality.

**The gap:** **3 of the PRD's 12 tables** exist, and **none of the
dhikr-tracking domain** (`tasks`/`logs`) does. The app is **not wired to
Supabase at all** (no `@supabase/ssr`, still 100% mock/`localStorage`). Realtime
isn't configured; there are **no tests**; the retention rollup job is undesigned.
CET-2 is ~⅓ done.

### Review findings → where each is handled

| ID  | Problem (from review)                                                                     | Fixed in                |
| --- | ----------------------------------------------------------------------------------------- | ----------------------- |
| B1  | Only 3/12 tables; no `tasks`/`logs` → no product backend                                  | M2, M3                  |
| B2  | Realtime not configured (live counter has no substrate)                                   | M4                      |
| B3  | No RLS tests (scoped "from day one")                                                      | every M (cross-cutting) |
| B4  | No count-integrity / tap-rate guard (scoped)                                              | M3                      |
| B5  | `claim_ownership` / `reassign_owner` absent → dormant owner orphans a group unrecoverably | M7                      |
| B6  | Migration history drift (files ≠ applied versions)                                        | M0                      |
| B7  | Unindexed FKs (`memberships.group_id`, `groups.created_by`)                               | M0                      |
| B8  | `config.toml` seeds `./seed.sql` which doesn't exist                                      | M0                      |
| B9  | `daily_completion` rollup job undesigned (retention depends on it)                        | M6                      |
| F1  | App not connected to Supabase                                                             | M1                      |
| F2  | Client-Context → must go server-first (data-layer rewrite)                                | M2–M5                   |
| F3  | Auth not started                                                                          | M1                      |
| F4  | Zero tests in the repo                                                                    | every M                 |
| F5  | Session + active-group need a real home                                                   | M1                      |
| F6  | camelCase mock vs snake_case DB → mapping via generated types                             | M1                      |

---

## Cross-cutting standards (apply to every milestone)

1. **RLS tests from day one.** Each new table ships with SQL tests that assert
   its policies as a non-owner/non-member (the pattern proven in review: seed two
   auth users in a `BEGIN…ROLLBACK`, `set local role authenticated` + jwt claims,
   assert allowed/denied). No table merges without its policy tests.
2. **Type generation, never hand-rolling.** After each schema change,
   regenerate `lib/database.types.ts` (`supabase gen types typescript`). The mock
   `types.ts` is the _target spec_, retired at cutover (M9). Resolves F6.
3. **Migration hygiene.** Iterate with `execute_sql`; when a change is final,
   write the migration **file** and record it in `schema_migrations` with a
   **matching version** (the pattern used for `0004`). Never let files and
   applied versions drift again.
4. **Advisors clean.** Run `get_advisors` (security + performance) after every
   DDL change; the only accepted WARNs are the two intentional RPC exposures.
5. **Verify, don't assume.** Exercise each policy/flow live before marking done.

---

## Milestones (ordered)

### M0 — Backend hygiene (unblock the pipeline) · _small, do first_

Fix the three things that will otherwise break the next deploy or a fresh DB.

- **B6** reconcile migration drift — `supabase migration repair` (or rename the 3 files to their applied versions); `migration list` must show clean + in-sync.
- **B7** add indexes: `memberships(group_id)`, `groups(created_by)`.
- **B8** add a real `supabase/seed.sql` (a couple of groups/tasks/logs for local `db reset` + CI + previews).
- **Exit:** `migration list` clean · `db reset` succeeds · advisors clean.

### M1 — Connect the app + Auth (CET-3) · _make the two halves meet_

- `pnpm add @supabase/ssr @supabase/supabase-js` (pinned, lockfile committed).
- Browser + server clients + middleware (migration doc §7); generate `database.types.ts`.
- Real **Google OAuth + email magic link**; `handle_new_user` already creates the `profiles` row.
- Route gating in `(app)/layout.tsx`; **session + active-group** get a real home (cookie / `profiles` preference) — resolves F5.
- **Exit:** a real user signs in → profile row created → protected routes gate → `/groups` renders (empty) from the DB, not the mock.

### M2 — Groups + tasks write path (CET-4, CET-5) · _first server-first screens_

- Tables: **`tasks`**, **`invites`** (+ RLS + policy tests).
- Server Actions: create/rename/delete group (RPCs exist), invite-by-email + accept, add/remove/promote member, task CRUD. Invite codes generated in the DB/Server Action, never the client.
- Convert `/groups`, `/group/manage` to Server Components (F2); interactivity pushed to client leaves.
- **Exit:** create a group, define its task list + targets, invite/add a member — all persisted, all RLS-guarded, all tested.

### M3 — The core loop: logs + counting (CET-6, CET-8) · _the product_

- Tables: **`logs`** (14-day raw; `logged_by` for D29), **`streaks`** (+ RLS + tests).
- **Count-integrity / tap-rate guard (B4):** server-side increment RPC that validates the delta (bounds per call + per-window rate limit) so counts can't be inflated — they feed streaks/leaderboard/steadfastness.
- `increment` Server Action with **optimistic** UI (`useOptimistic`) so the tap stays snappy; D29 admin proxy-log + self-correct within the 14-day window.
- **Streaks + never-miss-twice** as a scheduled server job (`pg_cron`/Vercel cron), with a defined rollover time (decide: UTC for v1 vs per-user tz — see migration doc §11).
- Convert `/today`, `/count/[taskId]`.
- **Exit:** tap → count persists → ring fills → streak advances → never-miss-twice freeze consumes correctly; forged/oversized counts rejected (tested).

### M4 — Live collective counter (CET-7) · _realtime_

- Add `logs` (or a per-group aggregate) to the `supabase_realtime` publication (B2); client leaf subscribes; the group total ticks live.
- **Exit:** two sessions in one group — one taps, the other's collective counter moves within ~1s.

### M5 — Leaderboard + consistency reads (CET-9, CET-16) · _reflection surfaces_

- Bounded-scan queries: weekly leaderboard, 14-day member breakdown, 30-day band. (Read-only; designed in the mock already.)
- Convert `/leaderboard`, `/progress`, Group → Members oversight.
- **Exit:** leaderboard + progress render from real `logs`; admin member breakdown works; matches the mock's numbers.

### M6 — Retention rollup infra (B9) · _the longitudinal engine_

- Table: **`daily_completion`** (90-day rollup, one row/member/day).
- **Nightly job** that writes the rollup **before** the 14-day raw-`logs` prune (the ordering guarantee the retention design assumes; migration doc / PRD §6). `pg_cron` or an Edge Function.
- Wire steadfastness (`AVG(completion%)` over last 90 rollup rows — a rate, no stored score), 30-day band, 90-day group rollup, and (v2) badges/garden to read the rollup.
- **Exit:** rollup populates nightly; raw prune runs only after it; steadfastness board reads the rollup; re-verify the 14/90-day retention split.

### M7 — Succession + moderation (D27) · _resilience_

- Tables: **`reports`**, **`audit_log`** (+ RLS + tests).
- RPCs: **`claim_ownership`** (co-admin claims a dormant owner's group — needs `logs` for the ≥14-day dormancy check) and **`reassign_owner`** (super-admin recovery, writes `audit_log`). Closes B5.
- Every proxy-edit (D29) and super-admin action writes `audit_log`.
- **Exit:** a co-admin can claim a dormant-owner group; super-admin recovery works and is audited; no god-view leaks (tested).

### M8 — Notifications (v1.1: CET-11 delivery, push/email)

- Tables: **`reminders`** (settings can land earlier; delivery here), **`push_subscriptions`**.
- Web Push (VAPID) + Resend email fallback, sent from a Vercel cron / Edge Function.
- **Exit:** a scheduled reminder fires via Web Push on a subscribed install; email fallback for non-installers.

### M9 — Cutover

- Delete `lib/mock/*` + Demo Controls once nothing imports them; retire mock `types.ts`.
- **Exit:** no `lib/mock` imports remain; app is 100% Supabase-backed.

---

## Dependency order (why this sequence)

```
M0 hygiene ─┐
            ├─ M1 connect+auth ─ M2 tasks/groups ─ M3 logs/counting ─┬─ M4 realtime
            │                                                        ├─ M5 leaderboard/consistency
            │                                                        └─ M6 rollup ─ M7 succession/moderation
            └───────────────────────────────────────────────────────── M8 notifications (parallel after M1)
                                                                          M9 cutover (last)
```

Everything hinges on **M3 (`logs`)** — it's the product, and M4/M5/M6/M7 all read
it. M8 only needs auth (M1) and can run in parallel. M0 is a quick unblock before
anything else touches the migration pipeline.

## Linear mapping

M0 → CET-2 · M1 → CET-3 · M2 → CET-4/CET-5 · M3 → CET-6/CET-8 · M4 → CET-7 ·
M5 → CET-9/CET-16 · M6 → CET-16 (rollup) · M7 → CET-2 tail (D27 RPCs) + moderation ·
M8 → CET-11 · M9 → CET-14 close-out.

## Open decisions to lock before starting (migration doc §11)

- **Streak rollover time** — UTC (v1) vs per-user timezone.
- **`logs` read scope** — group-wide `SELECT` (matches the mock, chosen) vs aggregate-only RPC.
- **Rollup host** — `pg_cron` (in-DB) vs Vercel cron → Edge Function.
- **Count-integrity thresholds** — max delta/call + rate window.

---

## Infra & reproducibility (IaC) — scope decision

**Principle:** IaC the things that are (a) security-critical or (b) painful to
rebuild by hand — the database + access rules and the list of required config.
**Everything else stays dashboard config until the project grows.** Full
Terraform/CDK is **deliberately out of scope** for now: it pays off with multiple
environments / a team / frequent teardown, and this is a solo, single-environment,
pre-launch app. The DB migrations already give the 80% that matters (reproducible,
traceable schema + RLS). Revisit if a staging environment or a second developer
appears.

| Layer                                                                         | IaC today?                                                                            | Target                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Database** (tables, RLS, funcs, grants)                                     | ✅ `supabase/migrations/*.sql` (git-tracked, replayed in order — the source of truth) | Keep. **Fix the version drift (M0)** so "replay the files onto a fresh project" is clean — that's the guarantee. Optionally adopt **declarative schemas** (`supabase/schemas/*.sql` + `supabase db diff`) for a Terraform-like desired-state workflow. |
| **Supabase auth / project** (OAuth providers, redirect URLs, email templates) | ⚠️ partial — `config.toml`                                                            | Move what `config.toml` supports into it; capture the rest in a short **setup runbook** so it isn't pure clickops. (An official **Supabase Terraform provider** exists if we ever want project settings under IaC too.)                                |
| **Env vars / secrets**                                                        | ❌ dashboard                                                                          | Commit a **`.env.example`** (names only, never values) + manage real values via `vercel env`. Track _what's needed_, not the secrets.                                                                                                                  |
| **Vercel hosting**                                                            | ❌ dashboard                                                                          | Fine as-is; a `vercel.json` / `vercel.ts` can capture build/cron/headers later.                                                                                                                                                                        |

**What IaC does _not_ cover either way:** live **data** (schema ≠ data — `seed.sql`
is local/test only; production data needs **backups**, a separate concern).

**Concrete near-term actions (fold into M0/M1):** (1) M0 — fix migration drift so
the DB is cleanly replayable; (2) M1 — as auth is wired, record the provider +
redirect-URL config in `config.toml`/runbook and add `.env.example`. Stop there.
