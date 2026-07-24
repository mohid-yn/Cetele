# STATUS — Cetele (ground truth)

> **Single source of truth for where the project is and how we work.** Read this first when resuming.
> When work state changes, update this file **and** Linear — nowhere else.
> Full historical detail (every decision D1–D48 in full, every shipped milestone, every review) lives in
> [`.claude/history/STATUS-2026-07-16-full.md`](history/STATUS-2026-07-16-full.md). This file is the onboarding doc; that one is the archive.

_Last updated: 2026-07-24 · Phase: **feature-complete and live in production**, awaiting the stakeholder review._

---

## 1. What Cetele is

A mobile-first **group dhikr tracker**, shipped as an installable PWA. Dopamine mechanics (tap counter, progress
rings, streaks, live collective counter) layered on **real group accountability**, with "never miss twice"
forgiveness so a broken streak doesn't cause permanent quit. A _cetele_ is a circle that splits and completes a
shared dhikr goal together. Full spec: [`docs/PRD.md`](../docs/PRD.md).

Stack: Next.js App Router + React + TypeScript + Tailwind · Supabase (Postgres/Auth/Realtime) · Vercel · PWA, no app store.

---

## 2. Where it's at

**v1 and v2 are both done, real, and in production.** The mock is gone (M9 deleted `lib/mock/*` + Demo Controls,
−3,710 lines). The D38 gate — _100% real, no mock artifacts, feature-complete beyond v1 before the next stakeholder
review_ — is **met**.

|              |                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| Production   | [cetele-sable.vercel.app](https://cetele-sable.vercel.app) (org Vercel team `university-services`)       |
| Repo         | `mohid-yn/Cetele` — `main` auto-deploys to prod                                                          |
| Supabase     | ref `kwzlrztcwxjunvdhdoqu`, region Seoul (`ap-northeast-2`); Vercel functions colocated in `icn1`        |
| Migrations   | `0001`–`0017`, all pushed to prod, history 17/17 no drift                                                |
| Tests        | pgTAP **316** across 8 suites (`pnpm test:rls`) · Playwright e2e **21** across 9 specs (`pnpm test:e2e`) |
| Backend plan | M0–M9 **all shipped** ([`docs/BACKEND_BUILD_PLAN.md`](../docs/BACKEND_BUILD_PLAN.md))                    |
| Linear       | CET-1…CET-31 all **Done** except CET-10 (variable-reward milestones, deferred)                           |
| Working tree | clean; `main` = `origin/main`; no feature branches outstanding                                           |

**Last work (2026-07-24) — the UI-fix + refinement pass (shipped to prod, no migration):** UI-only, merged from
`mohidkhanzada/ui-refinement-motion`. Built from a local implementation brief kept **out** of the repo
(`docs/INSTRUCTIONS_NEXT_STEPS.md`, gitignored) — everything durable from it is recorded here. Build + lint + tsc +
format green, e2e **21/21**, pgTAP **316/316**; every screen verified in a real browser at 390 + 1440 in both themes.
**Part A** — three reported bugs: the Progress grid's sticky task label floated over the scrolling day cells (labels
now own a fixed non-scrolling column); desktop content was stranded in a hardcoded `lg:max-w-3xl` (now the
`--container-page` token, 64rem); the group header clipped "Fajr Cir…" because the title box was `min-w-0` but
couldn't grow against `GroupSwitcher`'s `max-w-full` (`flex-1` breaks the circularity — measured 115/115, was
107/115). **Part B** — six depth tokens + a `Depth` section on `/designsystem`; four extractions (`HeroCard`,
`StatRing`, `ProgressBar`, `Eyebrow`) replacing five copy-pasted bars and three hand-written section labels;
per-screen lifts on Today/Group/Progress/Count; interaction motion (picked-cell crossfade, `InlineAlert`, banner
enter/exit, tap ripple) with **no** load-stagger (D46 holds).
**Three traps the browser caught that a green build did not** — each is now an invariant below: the glow utilities,
the hero foreground, and `Badge` on a gradient.

**Before that (2026-07-24) — the spacing/design pass (also shipped to prod, no migration):** UI-only, merged from
`container-queries`. (1) **Layout primitives own the rhythm** — `Screen`/`Stack`/`Row` (earlier) plus a new **`Grid`**
that keys columns off its _own slot_ via container queries (Tailwind v4 `@container`, no plugin), not the window;
the rings and badges grids use it. (2) **Spacing stepped up one notch, app-wide** — `Screen` gap `xl→2xl`, edge
padding `px-5 pt-6 pb-8`, card ladder `p-4/p-6/p-8`; five hand-rolled screens that never used `<Screen>` were
brought onto the same edge padding so nothing is tighter. (3) **Device-review fixes:** day-strip scrollbar overlap
(`no-scrollbar` util), group tab panels had no inter-section rhythm (wrapped in `Stack`), the member-breakdown day
grid was ~15px cells → now 44px, horizontally scrollable, label pinned, opens on today. (4) **UI sweep** (frontend
review): role badges no longer clip on long names (name truncates, badge `shrink-0`), the group garden scales with
its card instead of cropping on desktop (`aspect-[320/130]`), groups empty-state centered, one celebration glyph not
two, reminder time field normalized. All verified in a real browser at 390/1280; build+lint+tsc+format green.

**Before that (2026-07-21) — the count screen, four changes:** (1) it gained a way to go **down** — an undo and an
exact-number `Edit count`, presented as one hairline-divided pill in the card language, 44px segments, verified in
a real browser at 360/390/768/1280 in both themes (no migration; `set_count` already allowed it, the gap was UI).
Deliberately **not a slider** — targets run into the hundreds, so a drag can't land on the value you actually
counted. (2) Owner-reported: **the celebration re-fired when you returned to a finished ring and tapped it** — a
reward you can summon on demand is not a reward; pre-existing since the screen was written. (3) **"Mark done" no
longer navigates away**, amending the earlier count-screen UX call: manual tapping already let you carry on, so
finishing was the one path that ended the session for you, and counting past target is normal here. (4) e2e 20/20.

**Before that (2026-07-16):** two full-repo review sweeps (15 fixes total — open redirect, mark-all-done clobber,
midnight freeze race, stale-session holes, and more; migration `0016`) and **D48** — back-filling a day now repairs
the streak (migration `0017`).

**Requirements are LOCKED (D32)** — a _soft_ lock: the baseline to build against, revisited after real user testing.
Net-new product ideas park until then.

### Nothing is blocking. What's actually open

| Item                                  | Note                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Custom domain** (~$10–15/yr)        | The single unlock for **three** deferred things: Resend email (invites + magic links), the Google consent-screen **logo**, and a Supabase custom auth domain. Owner's purchase.                                                                                                                                                                           |
| Make `mohid-yn/Cetele` private        | No secrets in history (verified), so not urgent. Needs a `mohid-yn` GitHub session.                                                                                                                                                                                                                                                                       |
| Supabase automated backups            | `seed.sql` is local/test only. Set/verify before real users arrive.                                                                                                                                                                                                                                                                                       |
| Super-admin grant (D27)               | `is_super_admin` is set **only** by hand in Supabase — no in-app path, by design.                                                                                                                                                                                                                                                                         |
| ~~e2e flake: peer-reaction untoggle~~ | **Fixed 2026-07-24 — it was never a flake.** `PeerReactions` relied solely on `revalidatePath`; when that revalidation was dropped (D45) `useOptimistic` fell back to the stale prop and the pill stuck pressed with nothing coming to correct it. Now reconciled from `toggle_reaction`'s own return.                                                    |
| Won't-fix: `addTask` sort_order race  | Two concurrent adds can share a `sort_order`. Harmless at halaqah scale; revisit only if task reordering ships.                                                                                                                                                                                                                                           |
| e2e flake: `core-loop.spec.ts:104`    | Surfaced 2026-07-24 once the sign-in noise + saturation cleared. `correcting down: undo one, then set an exact count` fails a `toHaveAttribute` at ~6 s (a race, not a timeout), ~1 run in 3. Smells like the same optimistic-vs-revalidation class as the peer-reaction bug — apply the D45 medicine to the count screen's undo/edit. Not yet diagnosed. |

---

## 3. How we work

**Ship in increments, verify, then commit.** End commit messages with
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Branching (solo; branches yes, PRs optional — D16):**

1. One **feature branch per Linear issue**, named to match Linear's (`mohidkhanzada/cet-N-slug`). Never commit features straight to `main`.
2. Commit increments; **push** to get a Vercel preview URL.
3. **The four gates must all be green** before merge: `pnpm build` · `pnpm lint` · `pnpm exec tsc --noEmit` · `pnpm format:check`. For anything touching the DB or core loop, also `pnpm test:rls` + `pnpm test:e2e`.
4. **Ask the user before merging to `main`** — `main` auto-deploys to production, so that confirm _is_ the approval step (it replaces a PR).
5. On approval: merge (fast-forward), push, **delete the branch** local + remote.

Open a real PR only ad-hoc when a written review trail is wanted (`gh` is installed).

**Two things need explicit owner approval, separately:** merging to `main` (= deploying), and `supabase db push`
(= migrating prod). Never assume one covers the other.

**Migrations** are the only sanctioned path for schema change — `supabase db push`, files named to match the applied
version (no drift). Every new table needs **explicit grants** (0006 set a default-privileges revoke, so a new table
starts at zero for _every_ role, `service_role` included) and **RLS from day one**, pinned by a pgTAP suite.

**Confirm consequential product decisions** with the user, then log them here in "Decisions that still bind."

**Keep the docs in sync:** edit [`docs/PRD.md`](../docs/PRD.md), then regenerate the Word copy with
`python3 scripts/build_prd_docx.py` (stdlib-only; the script _is_ the formatting — edit content there too).

**Track in Linear** (team `CET`, https://linear.app/mohidkz/team/CET) via the Linear MCP — issue state stays in sync
with the code.

**The user prefers concise, scannable docs** — tables and short bullets, not walls of text.

---

## 4. Invariants — the rules that bite

Each of these is a production bug we already paid for. Treat them as constraints, not preferences.

| Rule                                                                                                                                                                                                                                                                                                             | Why (learned the hard way)                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The service worker caches static assets ONLY** — allowlist `/_next/static/`, `/icons/`, static extensions. Everything else always hits the network. Bump `CACHE` on any `sw.js` change.                                                                                                                        | v2/v3 used a denylist and an RSC payload isn't a navigation → per-user, RLS-scoped payloads were cached forever with no notion of who was signed in: stale reads **and cross-user leakage on a shared device**. Rule of thumb: if a response can vary by who's signed in, the SW must not touch it. (D39)                                                                                                |
| **The app shell does NO auth and NO DB work.** It may read request data (cookies) only; screens fetch their own data.                                                                                                                                                                                            | Mounting one component that called `getClaims()` in the layout took e2e from 15/15 to **7/15** — the layout wraps every request, so per-request auth work multiplies across the whole app. (D44)                                                                                                                                                                                                         |
| **Never trust an in-place refetch after a Server Action.** Either navigate (a route change is a guaranteed server fetch) or apply **optimistic local state** (`lib/use-prop-state.ts`). **`revalidatePath` alone counts as trusting it** — if the action returns the fact the UI renders, reconcile from _that_. | `router.refresh()` right after an action's own `revalidatePath` can coalesce with the in-flight refresh and be **dropped** — ~1 run in 5 even single-threaded. `PeerReactions` hit the same thing with no `router.refresh()` at all: `useOptimistic` fell back to the stale prop and the pill stuck pressed, with no further render coming to fix it. Presents as a load-only "flake". (D45, 2026-07-24) |
| **The user's timezone IS the day boundary.** Any date rendered before the zone is known is a guess. It's captured in a cookie at sign-in and applied in the auth callback, before the first authenticated render.                                                                                                | A new profile defaults to `UTC`, and a prefetched payload baked that guess in → a new member's first taps were written to **yesterday**. Also: a PWA left open past midnight keeps a stale "today" — hence `lib/use-local-today.ts`. (D44)                                                                                                                                                               |
| **Writes that must be atomic are RPC-only**, in the DB: counting, reminders, reactions, membership creation, ownership moves.                                                                                                                                                                                    | PostgREST `upsert` compiles over every column sent; a client read-then-write let two concurrent saves interleave so the **loser's** value won. (D42, D35, D43)                                                                                                                                                                                                                                           |
| **Never write worship that didn't happen.** No fabricated counts, ever — not for onboarding, not for demos.                                                                                                                                                                                                      | Endowed-progress onboarding was specced as "a pre-filled first contribution." We refuse: the newcomer is endowed with the **circle's genuine momentum** instead, which is also the true thing. (D43)                                                                                                                                                                                                     |
| **An earned badge is permanent**; nothing the member earned is ever revoked. `badge_awards` is append-only, INSERT granted to nobody.                                                                                                                                                                            | Re-deriving badges from a live window silently **un-earned** them on a dip — a punishment mechanic, against D8/D28. A badge you could insert yourself would be _claimed_, not _earned_. (D43)                                                                                                                                                                                                            |
| **A celebration marks a TRANSITION, never a state.** Fire it on the tap that closes the ring; never on arriving at, or tapping, a ring that is already closed.                                                                                                                                                   | The guard was a ref starting `false` on every mount, so it meant "have I celebrated this mount?" not "was this ring already closed?" — returning to a finished ring and tapping re-fired the congratulations. A reward you can summon on demand stops being one. (2026-07-21)                                                                                                                            |
| **No god view.** Nobody — including the operator — sees a group they don't belong to. Super-admin powers are recovery + moderation only, granted out-of-band in Supabase.                                                                                                                                        | The privacy promise is load-bearing for a worship app; `/admin` was retired for it. (D26, D27)                                                                                                                                                                                                                                                                                                           |
| **App audio must never resemble music** — no melodies, pitched tones, or instrument timbres, including celebration sounds. Unpitched noise clicks; recorded nature sounds are the sanctioned path for richer audio.                                                                                              | Owner is Hanafi; ruling basis [askimam 125634](https://islamqa.org/hanafi/askimam/125634/). (D37)                                                                                                                                                                                                                                                                                                        |
| **Token contract, lint-enforced.** Every UI value comes from a token in `app/globals.css`. Raw hex/`rgb()`/`hsl()` in `.ts`/`.tsx` is an **ESLint error**. Sole sanctioned literal: `lib/brand.ts`.                                                                                                              | Need a new value? Add a token, don't inline. (D14)                                                                                                                                                                                                                                                                                                                                                       |
| **A bare `var()` in an arbitrary shadow renders NOTHING.** Use the `glow-primary` / `glow-accent` `@utility` classes, never `shadow-[var(--glow-primary)]`.                                                                                                                                                      | Tailwind can't tell a shadow from a shadow-_colour_, so it picks colour: the class emits nothing, the underlying `shadow-sm` survives, and **there is no error**. The promoted Today ring shipped-looking-fine with a plain slate shadow until the computed `box-shadow` was measured. (2026-07-24)                                                                                                      |
| **Text on the hero gradient uses `--gradient-hero-foreground`**, never `text-primary-foreground`; chips on it use `HeroChip`, never `Badge`.                                                                                                                                                                     | On dark, `--primary` is the _light_ emerald, so `--primary-foreground` is near-black — ~1.5:1 on the gradient. `Badge variant="outline"` sets `text-foreground`, measured **1.7:1** in light. Both look fine at a glance and fail on measurement. The sanctioned tokens hold ≥5.48:1. (2026-07-24)                                                                                                       |
| **White-hat gamification only** — no shame, no punishment, no permanent/global ladder, no cumulative XP. Forgiveness is reliable or it doesn't work.                                                                                                                                                             | Rich-get-richer ranking demotivates the median and courts riya' for this audience; loss-aversion burns out. Leaderboards are within-group, weekly, resetting. (D8, D28, D31)                                                                                                                                                                                                                             |

---

## 5. Where things live

```
app/(app)/g/[groupId]/{today,group,progress,count/[taskId],group/manage}  the group-scoped route tree (CET-25)
app/(app)/{groups,profile}      circle picker / front door · personal settings + reminders
app/join/[code]                 invite accept · app/(legal)/{privacy,terms} · app/designsystem  living UI reference
components/{ui,app,motion,theme}   primitives (cva+cn) · shared app components · motion layer · theme toggle
lib/                            supabase/ (server+client+service) · push/ · use-*.ts hooks · groups-store · motion.ts
supabase/migrations/            0001–0017 · supabase/tests/ 001–008 pgTAP
e2e/                            9 Playwright specs
docs/                           PRD.md (+ .docx) · BACKEND_BUILD_PLAN.md · MIGRATION_MOCK_TO_SUPABASE.md
                                DESIGN_SYSTEM.md · UI_PRACTICES.md
research/                       01 landscape · 02 motivation/reward · 03 feature recommendations
scripts/                        build_prd_docx.py · build_push_guide_pptx.py · gen-icons.mjs
```

**Commands:** `pnpm dev` · `pnpm build` · `pnpm start` · `pnpm lint` · `pnpm exec tsc --noEmit` · `pnpm format:check`
· `pnpm test:rls` · `pnpm test:e2e`. Run them directly — you're inside WSL.
The **service worker only registers in production** (`pnpm build && pnpm start`), not `pnpm dev`.

**Design system:** emerald `#047857` + gold `#F59E0B` on warm cream `#FAF6EC` (light-first; dark = warm brown).
Emerald = brand + calm + completion/growth; **gold is scarce** — one earned action or celebration per view.
Reference route `/designsystem`, guidelines [`docs/DESIGN_SYSTEM.md`](../docs/DESIGN_SYSTEM.md).

---

## 6. Decisions that still bind

One line each. **Full text and rationale for every decision — including superseded ones (D11, D13, D18, D20…) —
is in the [archive](history/STATUS-2026-07-16-full.md).** Cite them by number; the numbering is stable.

**Product & retention**

| #         | Decision                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D5 · D6   | Dhikr list is set per group by its admin (items + daily targets); logging = tap counter + rings + live collective counter.                                                                         |
| D8        | Retention = a dopamine layer **on top of** group accountability + "never miss twice" forgiveness.                                                                                                  |
| D17       | Generic vocabulary in UI **and** code — the trackable item is a `task`, not a "dhikr". Brand stays "Cetele"; dhikr communities stay the primary audience.                                          |
| D21 · D28 | Consistency = a **30-day band** headline + a **14-day task grid**. 7- and 90-day personal windows dropped; group 90-day rollup kept as the North Star.                                             |
| D28       | **Rejected:** global XP, cumulative/all-time ranking, punishment mechanics.                                                                                                                        |
| D29       | Admins may proxy-log for members **by role, no consent gate** (the halaqah leader tallying) — but every proxy entry is **attributed + audit-logged**, and the member can correct their own record. |
| D30       | Reminders are **member-set custom clock times** per task, not prayer-anchored. Flexibility over the habit-stacking hook.                                                                           |
| D31       | Steadfastness = average daily completion **rate** over a sliding 90 days (partial credit, ≥14-day floor). Admin-only, private, informs an out-of-app reward. A rate, never a sum or tenure.        |
| D36       | Streaks advance the moment the day completes; the **freeze re-arms after every kept day** (any single miss is forgiven if you return), two consecutive misses reset, longest is kept.              |
| D48       | **Back-filling a day feeds the streak** — `refresh_streak` is a present-anchored recompute; repairing a gap rebuilds the visible chain (bounded by the 14-day write window).                       |
| D43       | The v2 layer: four of six features need **no backend** (derived); only reactions, badges, and dismissals persist.                                                                                  |
| D47       | "No circle" is a **designed front door**, not an empty state — nav collapses to Groups + Profile, `/groups` becomes "Start your first circle". Hence last-group deletion is allowed.               |

**Architecture & ops**

| #         | Decision                                                                                                                                                                                                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D3 · D24  | Delivery = installable **PWA**, confirmed even after the app-store constraint relaxed. Escape hatch if store presence is ever needed: **Capacitor** wrap of the same code — no rewrite.                                                                                                                           |
| D4        | Auth = Google OAuth (primary) + email magic link (behind `NEXT_PUBLIC_AUTH_EMAIL`, blocked on a domain).                                                                                                                                                                                                          |
| D26 · D27 | **Drive-style ownership:** anyone can create a circle → becomes owner. Roles `owner` / `admin` (co-admin) / `member`, private by default. Ownership transfer is mandatory; a co-admin can **claim** a dormant owner's circle (≥14 days) so nothing is ever orphaned.                                              |
| D34 · D35 | Joining = **invite link/code only** (`/join/[code]`), one namespace: no email = an open reusable link; email-locked = single-use. Codes are DB-minted; membership creation is RPC-only. Day rollover is **per-user timezone**.                                                                                    |
| D36a      | Count integrity: 1–500 per call, capped at `greatest(target×10, target+1000)`, dates limited to today back 13 days in the member's own zone. Counting past target stays welcome.                                                                                                                                  |
| D40 · D41 | A group **dies with its last member** (trigger); a JWT outliving its account raises `PT401` → real sign-out. **Leaving keeps your logs** — group figures count current members only; an owner cannot leave (RLS: zero rows _is_ the refusal).                                                                     |
| D42       | Push: the **schedule lives in Postgres** (`pg_cron` every minute → `pg_net` → `/api/push/dispatch`), the **sender lives on Vercel** (it holds the VAPID key). Vercel Hobby cron can only fire once a day, and the key is write-only. The claim is atomic; dead devices are pruned; a closed ring is never nagged. |
| D31a      | Retention: raw `logs` **14 days** (= the correction window), daily rollup **90 days** (everything longitudinal). The nightly rollup writes **before** the prune.                                                                                                                                                  |
| D33       | Org-owned hosting — org GitHub/Vercel/Supabase for billing; personal account is a collaborator.                                                                                                                                                                                                                   |
| D46       | Motion (Framer Motion) is a **token-aligned layer**, mirroring the CSS motion tokens 1:1 — not a second language. `reducedMotion="user"` globally. Stagger-on-load rejected as motion-on-motion.                                                                                                                  |

---

## 7. Local dev — gotchas worth not re-debugging

| Symptom                                                            | Cause                                                                                                                                                                                                                                                                                                                                                                                                       | Fix                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nav feels slow, "must spam clicks"                                 | `next dev` compiles per-route; **not representative of prod**                                                                                                                                                                                                                                                                                                                                               | Judge perf on `rm -rf .next && pnpm build && pnpm start`. Never build while `pnpm dev` is live (shared `.next`).                                                                                                                                                               |
| `Failed to fetch RSC payload … dev version of React on the server` | Browser reused dev-cached prefetches with the prod bundle                                                                                                                                                                                                                                                                                                                                                   | Hard reload + Clear site data + **unregister the SW** for `localhost:3000`; always `rm -rf .next` first.                                                                                                                                                                       |
| `supabase db push` → `hostname resolving error … no such host`     | WSL's DNS proxy doesn't answer the CLI's Go resolver                                                                                                                                                                                                                                                                                                                                                        | Fixed permanently 2026-07-12: `generateResolvConf = false` in `/etc/wsl.conf` + real nameservers in `/etc/resolv.conf`.                                                                                                                                                        |
| A pgTAP assertion fails locally but passes in CI                   | **e2e writes are not rolled back** and pollute the local DB; global `count(*)` assertions then see them                                                                                                                                                                                                                                                                                                     | `supabase db reset`, re-run. **Write fixture-scoped assertions**, never global counts.                                                                                                                                                                                         |
| e2e degrades across repeated local runs                            | **e2e writes are not rolled back** — a second run sees the first run's groups/logs                                                                                                                                                                                                                                                                                                                          | **`supabase db reset` before each run.** Two back-to-back fresh-DB runs pass 21/21 in ~30s; three runs without a reset do not. CI is fresh per push, so this is a local-only contract.                                                                                         |
| A spec fails at the sign-in step                                   | **Fixed 2026-07-24 — should not recur.** e2e no longer sends email at all                                                                                                                                                                                                                                                                                                                                   | Sign-in mints its credential with the service role (`e2e/helpers.ts`), so there is no SMTP, no Mailpit poll and no auth rate limit in the path. If sign-in fails now, it is real.                                                                                              |
| A different spec times out at 30s each run (often `reflection`)    | **Worker over-subscription, fixed 2026-07-24.** The suite is `fullyParallel:false` sharing ONE single-threaded `pnpm start` + ONE local Postgres in a ~6.7 GB WSL2 VM; Playwright's default (nproc/2 = 8 here) saturated the server's CPU and memory, SSR latency rose ~4×, and the heaviest test (`reflection`, two contexts) crept past 30s. Which spec tipped over was random — hence "the flake moves." | Capped to `workers: 4` locally in `playwright.config.ts` (reflection: 8 s alone → ~10 s at 4 → 28–30 s at 8). If it recurs, the machine is genuinely loaded — check `uptime`, don't raise the timeout (that just masks saturation). CI's small runner already lands near this. |

**DB observability:** `lib/db-log.ts` `q()`/`dlog()` log query timing + errors — on in dev, silent in prod unless
`DB_DEBUG=1` / `NEXT_PUBLIC_DB_DEBUG=1`.

**CI** (`.github/workflows/ci.yml`): `verify` (lint + tsc + build + format) and `stack-tests` (fresh-stack migration
replay → pgTAP → build → e2e) on every push. **husky pre-commit is the local gate; CI is the backstop.**

**If reminders ever go quiet, check `VAPID_SUBJECT` first** — `web-push` refuses to sign without it, so every send
fails silently. The Vercel env vars can't be verified from the agent (local CLI is signed into the personal account,
project lives on the org team).
