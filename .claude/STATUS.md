# STATUS — Cetele (ground truth)

> **The only doc that tracks status. Read this first when resuming.** Update it **and** Linear when work state changes.
> The rule for this file: current state, binding rules, one line per decision. Stories go to the archive, not here.
>
> Full history: [`STATUS-2026-11-05-full.md`](history/STATUS-2026-11-05-full.md) (every session and decision up to this
> rewrite) · [`STATUS-2026-07-16-full.md`](history/STATUS-2026-07-16-full.md) (D1–D48 in full, including superseded ones).
> Section numbers are stable, because code comments and docs cite them.

_Last updated: 2026-11-07 · Phase: **live in production. The MCP server is live for organisers.**_

---

## 1. What Cetele is

A mobile-first group dhikr tracker, shipped as an installable PWA. Spec: [`docs/PRD.md`](../docs/PRD.md). Thesis and stack: `CLAUDE.md`.

---

## 2. Where it's at

### Current state (checked 2026-11-06)

| Item         | State                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Production   | [cetele-sable.vercel.app](https://cetele-sable.vercel.app), `main` at `62078f7` (Manage tabs promoted 2026-11-06)   |
| Staging      | `cetele-git-staging-university-services.vercel.app`. Level with `main` apart from this docs commit                  |
| Migrations   | **40 on prod.** `feat/branches-events` adds 0042 + 0043 (local only, never pushed). D77's 0041 is on its own branch |
| Git          | D77 approved, blocked on `supabase login`. `feat/branches-events` sits on rebrand + garden (`feat/garden-dopamine`) |
| CI           | Green on both `main` and `staging`                                                                                  |
| Tests        | On `feat/branches-events`: unit 228 · pgTAP 997 across 27 suites · e2e 90 across 22 specs, all green locally        |
| Local stack  | Runs on omenserver: Docker data on the HDD, Supabase started as in CI. Every suite green 2026-11-06                 |
| Linear       | **Out of date.** CET-1…31 Done except CET-10 (deferred). Nothing since 2026-07-25 has an issue                      |
| Prod numbers | 64 users, all Google sign-in · 11 reminders across 9 members · 2 circles on a roadmap                               |

Everything through D76 is on production. The 2026-08-15 relative-redirect change to `/auth/callback`, long listed as unverified, is confirmed working: 10 accounts have Google sign-ins recorded after it.

### Last release (2026-11-06)

Three releases that night, all at the owner's request without a staging soak, each with CI green first. The owner checked the first two on production. The third has not been opened signed in.

| Release   | What changed                                                                                    | Migration | Checked by owner |
| --------- | ----------------------------------------------------------------------------------------------- | --------- | ---------------- |
| `eaa5167` | Administration workspace (D74): sage bar, `/admin/organisers`, off the Groups tab               | None      | Yes              |
| `fa24989` | Personal roadmap (D75): `/roadmap`, tab shows whichever circle is selected                      | None      | Yes              |
| `2224fd2` | Saves survive a reload (`lib/roadmap-outbox.ts`). Organisers can Take part with no circle (D76) | 0040      | **No**           |

For an organiser whose circle follows a roadmap, Admin is off the usual tab bar. It is at Profile > Administration and on the Groups screen. The owner was told, and may want this revisited.

### Previous release (2026-11-06)

The organiser MCP server (D73). Organisers connect Claude and build draft programmes; a person reviews and publishes in the app. Migration 0039 ends a connection after seven days. Runbook, blocks and remaining risks: [`docs/MCP_PLAN.md`](../docs/MCP_PLAN.md).

| Production setting       | Value                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Vercel (Production only) | `MCP_ENABLED`, `MCP_WRITES_ENABLED`, `MCP_ALLOWED_CLIENT_IDS`                           |
| Supabase                 | OAuth server on, path `/oauth/consent`, dynamic registration off, one client (`Claude`) |

To turn it off, set `MCP_ENABLED` to anything else and redeploy.

### Previous release (2026-11-05)

Next and eslint-config-next 16.2.9 → 16.4.5, plus CI repairs (runner `ubuntu-26.04`, Supabase CLI 3.0.0, `scripts/ci-build.sh`
retries only the `next/font/google` build error). No migrations.

The bug: tapping a ring soon after Today loads could leave the count screen empty until the member navigated away. The server
sent the whole page and the browser rendered nothing.

| Measured (fresh profile, immediate click, service worker blocked) | Blank screens |
| ----------------------------------------------------------------- | ------------- |
| 16.2.9                                                            | 5 of 240      |
| 16.2.9, waiting 2.5s first                                        | 0 of 240      |
| 16.4.5                                                            | 0 of 480      |
| `prefetch={false}` on ring links, no upgrade                      | 7 of 480      |

Which upstream change fixed it was not traced. The bug predates D71/D72 (August's `0532e25` blanks 1 of 240).

### Branches and events (built 2026-11-07, on `feat/branches-events`, not merged)

Camps and weekly halaqahs, scoped by place (D79, D80). After the owner's first local review ("if I'm having trouble navigating, so will others"), reach and creation were made visible (D81–D84). Owner gave the agent full ownership of the branch; nothing is on staging or prod.

| Layer        | What exists                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| DB           | 0042 branches · 0043 events, series, RSVPs, polls, questions · 0044 roadmaps on a branch · 0045 camp details · 0046 `branch_reach` |
| Member       | **Events tab** (camps first), `/events/[id]` with cost, what to bring, schedule, contact. Today "Up next". Progress is in Group    |
| Steward      | Admin lands on **Branches**: coming up, create buttons, how reach works. Each branch lists what reaches it, set here or from above |
| Organiser    | Roadmap editor's **Who follows** tab: by branch, then single circles. Assign a roadmap from a branch's page too                    |
| Circle admin | Manage › Settings › Branch: ask, withdraw, leave. A roadmap the branch set shows ticked and locked                                 |

To ship: owner review on a preview, then `supabase db push` (0042–0046) **before** merging, because staging reads prod's DB. 0041 (D77) must go first or with it. Not done: push notifications for events, Linear issues. Local review data: `review-demo.sql` was a scratch file, not committed.

### Next steps, in order

- **D77 is approved; ship it once the CLI is logged in.** omenserver's Supabase CLI was never linked. The owner runs `! supabase login`, then: `supabase link --project-ref <prod ref>`, `supabase db push` (0041), merge `fix/drafts-cannot-be-followed-v2` to `staging`, soak, promote. The merge onto current staging is clean and every gate passed on it (2026-11-06). Do not merge the code before the push: staging reads prod's database.
- **Owner: review the Youth Nexus rebrand** on the `feat/youth-nexus-rebrand` Vercel preview (D78, proposed). Confirm the name stays **Cetele**, and send the official YN logo if the app should carry it. Then merge to `staging`.

0. **Owner: check `2224fd2` on the phone.** Open Roadmap, tap +1 on an item a few times, reload at once. The count should hold. **Take part will not appear on the owner's organiser account**: it follows the only published roadmap through **meeting** and **Keysy Dersh**. Seeing it takes another organiser outside those circles, or a second published roadmap. CI covers the full flow.
1. **Owner: check the release on a real phone.** Sign in, then open a ring from Today right after it loads, a few times. Google sign-in on a desktop browser is confirmed on this release (2026-11-06). Nobody has used a phone on it, and staging was not clicked through.
2. **Owner: run `/mcp` to re-authenticate Linear**, then create issues for the untracked work, including D74, D75 and D76.
3. Work through the rest of "What's open". Nothing there blocks anything.
4. **MCP server: operator trial.** Live and tested by the owner from normal Claude, including the drafts-only refusal. Send an organiser **Roadmaps > Build with Claude** and have them build something real. Remaining checks are in [`docs/MCP_PLAN.md`](../docs/MCP_PLAN.md) §4. On 2026-11-12, confirm Claude asks to reconnect when the first session expires.
5. **Owner: delete the `MCP test` draft** in `/programme`, and check "Angels in Your Presence 1" against "Angels In Their Presence 2" in the booklet, as one may be a typo.
6. **Owner: decide whether to try ChatGPT.** Its unknowns are in the plan. Linear also has no issue for this work (step 2).

### What's open

**Owner decisions**

| Item                       | Decision needed                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staging's database         | **Staging reads the PRODUCTION database**, so a migration tested there is a prod migration. Options: second free Supabase project, paid preview branches, or keep sharing |
| Hosting move (D65)         | Planned for ~2026-09 and not started. Still wanted? [`docs/HOSTING_MIGRATION.md`](../docs/HOSTING_MIGRATION.md)                                                           |
| Account migration          | Not started; reverses D33. Decide on the domain first. [`docs/ACCOUNT_MIGRATION_RUNBOOK.md`](../docs/ACCOUNT_MIGRATION_RUNBOOK.md). Its measurements date from 2026-07-24 |
| Custom domain (~$10–15/yr) | Unlocks Resend email (invites, magic links), the Google consent-screen logo and a custom auth domain                                                                      |
| Members who lost reminders | Migration 0033 removed 15 reminders from five members, as designed. **They were never told.** The backups in `~/cetele-backups/` are not on this machine now              |
| Celebration quotes         | Two remaining religious quotes need checking by someone qualified                                                                                                         |

**Roadmap questions (D55).** None block anything, and the code assumes no answer.

| #   | Question                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Content conflicts in the booklet: level 3's Qur'an is "2 Khatm" or "1 Khatm with Interpretation" (detail page taken). Real reward figures? The booklet says 2025, so it may be superseded |
| Q2  | What happens on 1 January: automatic enrolment, or fresh opt-in? Leaning opt-in with a prompt on screen                                                                                   |
| Q4  | How is a reward claimed: an admin-marked state, or informational only? Leaning informational                                                                                              |
| Q5  | Can progress be recorded after the window closes? Leaning: writes close at `ends_on`, the roadmap stays readable                                                                          |
| Q6  | Does an organiser see every roadmap, or only their own administration's? One flag exists, which is wrong the moment there are two orgs                                                    |

Also open: should later levels genuinely lock (D57)? Does neglecting a newly joined circle break a streak earned elsewhere (D36/D48)?

**Owner setup, no decision needed**

- **Vercel access for the agent:** add the CLI account to team `university-services`. It is on `mohidkz05s-projects`, so the agent cannot open staging, read env vars or see logs. Every promotion since July has gone out without the agent seeing staging.
- **Real custom environment for staging** on Vercel, bound to the `staging` branch. It currently builds as an ordinary preview. Decide its database first.
- **Real-device pass:** iPhone Safari vs the installed PWA on `/profile` (install steps, then the reminder switch). Android for haptics. Ring and grid contrast on a real screen. CWV numbers are lab-only.
- **Supabase automated backups:** set and verify.
- Optionally make `mohid-yn/Cetele` private (no secrets in history).

**Known gaps in the product**

- A full reload on the first load on a device can still flash the member's tabs before the sage bar, until the organiser hint cookie is set.
- Taps batch for 300ms on Today and 600ms on the count screen, so force-closing the app inside that window can lose the last tap. The roadmap fix does not cover this: dhikr taps are increments, so `lib/roadmap-outbox.ts`, which resends absolute counts, cannot be reused as it is.
- A tap in the first moments of an account's very first visit belongs to the UTC day until the timezone sync finishes.
- "Turn on" for reminders looks disabled in `pnpm dev` because no worker exists there. If a worker ever failed to register in production, it would stay disabled with no explanation.
- Deleting a roadmap item orphans its uploaded cover (D60).
- D65's "Vercel skips executions" premise is unconfirmed. Its in-app twin, `set_reminder` not re-arming, is fixed (0033).

**Tests and performance**

- `task-links` link pane: after Link, the heading can keep the old count though the row is saved. Timing, not fixed: the dialog relies on `router.refresh()`.
- A loading skeleton held for 30s once in `task-config-history`. Not reproduced in 12 repeats. Unexplained.
- `roadmap` e2e picks the first "Roadmap Circle", so it fails on an unreset database.
- Local full e2e runs can still go red from machine pressure (§7). CI is the reliable read.
- CWV baseline (2026-07-26, lab, 4× CPU, localhost): LCP 300–470ms except `/group` at 1546ms, CLS 0.00. INP 114ms, except the first tap of a count session at 368ms. Audio is disproved as the cause; suspects are first-run Framer Motion setup and the ripple/celebration subtree.

**Small cleanups**

- Manage's "Add people" section is still wordy.
- `--gradient-hero*` tokens now only appear on `/designsystem`.
- `components/app/roadmap-entry-card.tsx` has no importers and its comment cites an answered question (Q7).
- `lib/database.types.ts` was hand-edited for three RPCs. Regenerate it when the stack is next up.
- `cetele-toy`, the MCP learning server, is still in the owner's local Claude Code config and points at a temp folder. Remove it with `claude mcp remove cetele-toy`.
- `addTask` `sort_order` race: won't fix, harmless at this scale.

---

## 3. How we work

The branching flow, the promotion command and the doc rules are in `CLAUDE.md`. This section holds only what it doesn't.

- **Gates before `staging`:** `pnpm build` · `pnpm lint` · `pnpm exec tsc --noEmit` · `pnpm format:check`. DB or core-loop work also needs `pnpm test:unit`, `pnpm test:rls` and `pnpm test:e2e`.
- **Two approvals, never assume one covers the other:** promoting to `main` (deploys) and `supabase db push` (migrates prod). Because staging shares prod's database (§2), merging a branch that needs a migration also needs that approval.
- **Migrations** are the only path for schema change. A new table starts with zero grants for every role, `service_role` included (0006), so it needs **explicit grants and RLS from day one**, pinned by a pgTAP suite.
- **`.husky/pre-push` is local only.** A push from another machine or the GitHub UI is unguarded; the agent's GitHub account has push, not admin, so no server-side ruleset. Non-fast-forward and deleting `main` have no override.
- **Checking a release without Vercel access:** `gh api repos/mohid-yn/Cetele/commits/<full-sha>/status` gives the Vercel result. The served Next version is in the JS chunks linked from the production HTML.
- **After a promotion**, `staging` being a docs commit or two ahead of `main` is normal.
- **Keep this file short.** New work replaces "Last release" and the open lists. Decisions get one line in §6, with the reasoning in the commit or migration header.

---

## 4. Invariants — the rules that bite

Each is a production bug already paid for. The full story behind each is in the archive.

**Time and history**

- **The user's timezone IS the day boundary.** It is captured in a cookie at sign-in and applied in the auth callback, before the first authenticated render. Otherwise a new member's first taps land on yesterday (D44).
- **A group read spanning members resolves each member on THEIR day**, never the viewer's. Otherwise "the circle today" reads 0 while the member's own Today shows taps.
- **A stored timestamp becomes a date on the member's calendar** (`private.user_date`), never via `::date`. Client mirrors keep raw timestamps and reduce per member.
- **A past day is judged by the configuration that day had.** Everything `private.obligations` reads that an admin can edit is an interval: closed and reopened, never overwritten or deleted (D54).
- **A client hook derived from the timezone re-derives when the timezone changes**, not only on the clock (`useLocalToday`).
- **A PWA left open past midnight keeps a stale "today"**, hence `lib/use-local-today.ts`.

**Figures and fairness**

- **A figure spanning members is scoped to who carries each task, on both sides of the fraction.** Otherwise one circle shows two percentages on two screens.
- **A number a member chose never becomes a number they are judged by.** Keep `target` (the circle's share) and `goal` (my bar) apart in code, and show the other wherever they differ (D51).
- **Never write worship that didn't happen.** No fabricated counts, for onboarding or demos (D43).
- **An earned badge is permanent.** `badge_awards` is append-only, with INSERT granted to nobody (D43).
- **White-hat gamification only.** No shame, punishment, global ladder or cumulative XP. Leaderboards are within-group, weekly and resetting (D8, D28, D31).
- **A celebration marks a transition, never a state.** Fire on the tap that closes the ring, never on arriving at a closed one.
- **No god view.** Nobody, the operator included, sees a group they don't belong to (D26, D27).
- **App audio never resembles music.** No melodies, pitched tones or instrument timbres. Unpitched noise clicks and recorded nature sounds only (D37).

**Server, network, PWA**

- **The service worker caches static assets only** (allowlist). If a response can vary by who is signed in, the worker must not touch it, or it leaks across users on a shared device (D39). Bump `CACHE` on any `sw.js` change and any non-hashed asset change.
- **The app shell does no auth and no DB work.** Cookies only; screens fetch their own data. One `getClaims()` in the layout took e2e from 15/15 to 7/15 (D44).
- **Never trust an in-place refetch after a Server Action.** Navigate, or use optimistic state and reconcile from the action's own return. `revalidatePath` alone counts as trusting it (D45).
- **Writes that must be atomic are RPC-only:** counting, reminders, reactions, membership, ownership moves (D35, D42, D43).
- **The count screen never renders a raw server number.** It shows `replay(confirmed, pendingOps)`. Undo and edit are `set` ops on the same FIFO queue as taps.
- **A signed-in user is forwarded off `/` in the proxy, server-side.** Otherwise a login flash on a cold PWA reads as "my login didn't persist".
- **`start_url` is a real destination (`/today`), never a redirect.** The cold-start gap is covered by a splash. iOS needs `apple-touch-startup-image`, and manifest `background_color` is the page surface.
- **Never offer a control that cannot work on this device.** Decide from the platform rule, not feature detection: iOS delivers Web Push only to a Home-Screen install, whatever `PushManager` says. Gate a reminder on whether ANY of the member's devices can receive it.
- **CI's environment is the committed `.env.ci` plus `pnpm check:env`**, never a copy in the workflow YAML. A new env-gated feature adds its var to both `.env.ci` and the guard. `NEXT_PUBLIC_*` is build-inlined, so the guard runs before `pnpm build`.

**UI mechanics**

- **Every control comes from `components/ui/button.tsx`.** Inline controls: `variant="link" size="inline"`. Standalone quiet ones: `outline`, never `ghost`. Exceptions are recorded in `docs/DESIGN_SYSTEM.md` §8.15.
- **Base CSS goes in `@layer base`.** A bare unlayered `*` rule beats every Tailwind utility; one silently swallowed every border-colour utility for months.
- **A colour that must always render is a token referenced inline (`fill`/`stroke`/`stopColor`)** with a `var(x, var(y))` fallback. SVG's initial fill is black, so a missing rule renders a black rectangle. Judge decorative colour on its real backdrop, per theme.
- **A bare `var()` in an arbitrary shadow renders nothing, with no error.** Use the `glow-primary` / `glow-accent` utilities.
- **A state layer belongs to its surface.** `--surface-*` is computed from `--card` and is a no-op on `--chrome`; nav and sticky headers take `--chrome-hover` / `--chrome-active`.
- **A progress track is `--progress-track`,** never a fill token, never thinned with alpha, ≥3:1 on card and page. It is sand, not grey, because the hue carries the arc.
- **A heatmap's empty cell is outlined, never darkened.** A filled empty day reads heavier than a barely-touched one, which is a punishment read (D8).
- **Text on the hero gradient uses `--gradient-hero-foreground`;** chips on it use `HeroChip`, never `Badge`.
- **`ProgressRing`'s `size` is an inline width/height no class can override.** To scale a ring to its parent, pass `fluid`.
- **A fixed px column is a floor, not a size.** Use `minmax(floor, 1fr)` with `min-w-max`. A cell that may widen cannot be `aspect-square`.
- **A modal never outgrows the viewport and is never un-closable.** `Dialog` caps at `calc(100dvh-2rem)` with a scrolling body (`min-h-0`). Async work that disables controls goes in `try/finally`, and `onClose` stays live.
- **An aspiration is not a correction.** Never file an opt-in control beside Undo. If a feature must be explained before it can be found, the placement is the bug (D51).
- **No bounce or elastic easing anywhere.** `--ease-brand` for routine, `--ease-emphasized` for earned moments. JS springs stay near-critically damped.
- **A vibration pattern must not lead with `0`,** and feedback belongs on `pointerdown`. Haptics are Android-only, with no iOS fallback.
- **Tokens and emoji:** the rules are in `CLAUDE.md`. An emoji in a seeded `glyph` column or a push body counts too, and nothing in lint catches it.

---

## 5. Where things live

```
app/(app)/g/[groupId]/{today,group,progress,count/[taskId],group/manage}   group-scoped routes
app/(app)/{groups,profile,roadmap}                 circle picker · personal settings and reminders
app/(app)/admin/organisers                 who holds the organiser role (D74)
app/(app)/programme/                       roadmap hub, builder and cohort report (organisers, circle leads)
app/join/[code] · app/(legal) · app/designsystem
components/{ui,app,motion,theme}           primitives · shared app components · motion · theme
lib/                                       supabase/ · push/ · use-*.ts · groups-store · viewer-store · brand.ts
                                           goals.ts · shares.ts · task-links.ts · quick-count.ts · roadmap.ts
                                           programme-readiness.ts · sound.ts · haptics.ts · db-log.ts
supabase/migrations/ (39) · supabase/tests/ (23 pgTAP) · e2e/ (21 specs + helpers.ts)
public/splash/ (gen-splash.mjs) · public/icons/ (gen-icons.mjs)
scripts/                                   build_prd_docx.py · check-env.mjs · ci-build.sh · dev-fixture.sql
research/                                  landscape · motivation and reward · feature recommendations
```

| Doc                                                                         | What it is for                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `CLAUDE.md`                                                                 | How we work, UI rules, commands, stack                        |
| [`docs/PRD.md`](../docs/PRD.md)                                             | Product spec (`.docx` is generated from it)                   |
| [`docs/DESIGN_SYSTEM.md`](../docs/DESIGN_SYSTEM.md)                         | Visual system; `/designsystem` is its living reference        |
| [`docs/UI_PRACTICES.md`](../docs/UI_PRACTICES.md)                           | Research behind colour, theming, responsive, motion           |
| [`docs/MCP_PLAN.md`](../docs/MCP_PLAN.md)                                   | Organiser MCP server: design, blocks, runbook, untested items |
| [`docs/HOSTING_MIGRATION.md`](../docs/HOSTING_MIGRATION.md)                 | Vercel → Cloudflare plan, not started (D65)                   |
| [`docs/ACCOUNT_MIGRATION_RUNBOOK.md`](../docs/ACCOUNT_MIGRATION_RUNBOOK.md) | Move to the owner's new Gmail, not started                    |
| [`history/`](history/)                                                      | Old STATUS copies, plus the finished backend plans            |

**If reminders go quiet, check `VAPID_SUBJECT` first:** `web-push` refuses to sign without it, so every send fails silently.

**DB observability:** `lib/db-log.ts` logs query timing and errors. On in dev; silent in prod unless `DB_DEBUG=1` / `NEXT_PUBLIC_DB_DEBUG=1`.

---

## 6. Decisions that still bind

One line each. Cite by number; the numbering is stable. Full text: D1–D48 in the [2026-07-16 archive](history/STATUS-2026-07-16-full.md), the rest in the [2026-11-05 archive](history/STATUS-2026-11-05-full.md).

**Product and retention**

- **D5 · D6** The dhikr list is set per group by its admin; logging is tap counter, rings and live collective counter.
- **D8** Retention is a dopamine layer on top of group accountability and "never miss twice" forgiveness.
- **D17** Generic vocabulary in UI and code: a `task`, not a "dhikr". Brand stays Cetele.
- **D21 · D28** Consistency is a 30-day band plus a 14-day task grid. Group 90-day rollup is the North Star. Rejected: global XP, all-time ranking, punishment.
- **D29** Admins may proxy-log by role with no consent gate; every entry is attributed and audited, and the member can correct it.
- **D30 · D62** A reminder is the member's own: a name and a clock time, no group or task, 20 per account. It fires regardless of progress. Ownership is its entire authority model. This replaces D42's "a closed ring is never nagged".
- **D31** Steadfastness is the average daily completion rate over 90 days (≥14-day floor), admin-only and private, informing an out-of-app reward.
- **D32** Requirements are soft-locked: the baseline to build against, revisited after real user testing.
- **D36** Streaks advance when the day completes. The freeze re-arms after every kept day; two consecutive misses reset; longest is kept.
- **D36a** Counts: 1–500 per call, capped at `greatest(target×10, target+1000)`, dates from today back 13 days in the member's zone.
- **D43** The v2 layer: only reactions, badges and dismissals persist; the rest is derived.
- **D47** "No circle" is a designed front door, not an empty state. Last-group deletion is allowed.
- **D48** Back-filling a day feeds the streak, bounded by the 14-day write window.
- **D49** The garden has durable growth plus a today layer that can only add. A quiet day never shrinks anything.
- **D51** A member may raise their own bar, never lower it (`greatest(target, override)`). It changes what they aim at and nothing they are judged by. The control is "My goals" on Today.
- **D53** Duos auto-pair monthly, statelessly, with the rule on the card. Shortfall copy never names a person.
- **D54** A past day is judged by that day's configuration. A task assigned to exactly one person IS a personal task.
- **D61** An admin may raise one member's share, never lower it below the circle. The obligation is `greatest(share, circle target)`, interval-versioned, and it drives everything a member is judged by. The collective goal is a sum of shares.
- **D63** The roster reads rings (`closed of owed`), ordered by proportion. Everyone sees today; only admins see the fortnight. The matrix is alphabetical, not ranked.
- **D64 · D66 · D67** One act, logged once, counted in every linked circle. Fan out on write, never alias on read; the raw count travels, not completion. Links are the member's own and dormant after leaving. The matcher only orders a menu in a pane under "My goals". Show the live count, never the cluster's size.
- **D68** Peer reactions are real emoji, the one exception to the emoji ban.
- **D70** A member may add a task for themselves (`tasks.personal_for`, `add_personal_task`). It counts in their day and streak, is out of the collective goal and standings, and an admin may edit or delete it but not reassign it.
- **D71** Closing a ring on Today gets confetti and moves to the next open ring. The full card is only for the whole day closing. Back-filling a past day stays put.
- **D72** A tap on a ring on Today counts in place and the name opens the count screen. Closed rings are inert; past days and resting rings open the count screen. The ring centre shows the count, not a percentage. Organisers see and assign any circle's roadmap, alongside circle admins.

**Roadmap**

- **D55** A roadmap is a published programme a circle follows. Progress is keyed `(member, item)`. Three sequential levels; a member's level is derived, never stored. Rewards count levels. Budgets are data, and `compulsory` is checked separately. Progress never reaches `private.obligations`. An organiser's view reads roadmap tables only.
- **D56** An organiser can appoint another, by exact email. The first is made in the dashboard. The last cannot be stood down. No self-escalation; all audited.
- **D57 · D60** Organisers author programmes in the app. Fields that decide completion freeze field by field once anyone records work (`done > 0`). Delete refuses once recorded; withdraw instead. Adding work is checked per level. Unsafe URLs are refused. Covers go to a public `roadmap` bucket gated by storage RLS. A circle owner cannot author.
- **D58** A circle may follow several programmes (`group_roadmaps`).
- **D59** (tab amended by D74) Organisers get a nav tab; circle admins don't, and never two tabs. `/programme` is a hub, and each cohort's report is at `/programme/[roadmapId]/progress`.
- **D69** The cohort report is for whoever leads a circle (`can_read_roadmap_cohort`). A member is refused it and still reads their own progress.

**Architecture and ops**

- **D3 · D24** Delivery is an installable PWA. Capacitor is the escape hatch if a store is ever needed.
- **D4** Auth is Google OAuth, plus email magic link behind `NEXT_PUBLIC_AUTH_EMAIL`, blocked on a domain.
- **D26 · D27** Drive-style ownership: creator is owner; roles `owner` / `admin` / `member`; private by default. A co-admin can claim a dormant owner's circle (≥14 days). Super-admin grants are recovery and moderation only (amended by D56).
- **D31a** Raw `logs` are kept 14 days, the daily rollup 90. The rollup writes before the prune.
- **D33** Org-owned hosting. The account migration would reverse it, and has not started.
- **D34 · D35 · D52** Joining is by invite only. A circle owns exactly one open link from birth, regenerated rather than revoked. No invite can grant admin. One-off email-locked invites remain. Day rollover is per-user timezone.
- **D40 · D41** A group dies with its last member. A JWT outliving its account means sign-out. Leaving keeps your logs; an owner cannot leave.
- **D42** Push: the schedule is in Postgres (`pg_cron` → `pg_net` → `/api/push/dispatch`), the sender is on Vercel. The claim is atomic and dead devices are pruned.
- **D46** Motion is a token-aligned layer mirroring the CSS motion tokens, with `reducedMotion="user"` globally. No stagger-on-load.
- **D50** `main` is production, `staging` is the soak.
- **D73** Organisers build programmes through an MCP server: real tools behind flags (off by default), Supabase OAuth with one pre-registered Claude client, organisers only, drafts only, no publish tool. A connection lasts seven days (0039). No database-level limit on what a token can do, for now. [`docs/MCP_PLAN.md`](../docs/MCP_PLAN.md).
- **D74** Administration is its own workspace, not a section of `/groups`. Inside `/admin/*`, and `/programme/*` for an organiser, a deep sage bar replaces the member's tabs: Roadmaps, Organisers, Circles (the way out). The way in is an Admin tab, which gives way to a circle's Roadmap tab, plus a Profile row that is always there.
- **D75** The roadmap screen is the member's own, at `/roadmap`, and lists what any of their circles follows. The tab shows whichever circle is selected, and opening it leaves that selection alone. `/g/[id]/roadmap` only forwards or explains. For an organiser this tab takes the fifth slot from Admin.
- **D76** An organiser can take part in a published roadmap with no circle (`roadmap_participants`, `take_part_in_roadmap`, 0040). It counts in the cohort report, only organisers see that row, and it lasts only while they hold the role. Recorded progress stays. Offered only when they have no other way to log.
- **D79 (built, awaiting owner)** A circle sits in at most one **branch** (a nested place). Its reach is that branch and every ancestor. Joining is a request a steward approves. **Stewards** run a branch and its subtree; organisers run all. Stewards see circle names and sizes only (D27 holds).
- **D80 (built, awaiting owner)** Events belong to a branch and reach every circle under it, with no circle opt-in (an invitation, not an obligation, unlike roadmaps). No circle or no branch: no events. RSVP counts to everyone in reach, names to stewards only (owner, 2026-11-07). Questions are anonymous to every reader, the asker stored only for limits and self-delete. Today gets one actionable line below the rings, fetched after paint: logging speed comes first (owner, 2026-11-07).
- **D81 (owner, 2026-11-07)** A roadmap can be assigned to a **branch** as well as to single circles. Materialised into `group_roadmaps` with `via_branch`, synced by trigger when a circle's branch changes; a direct follow survives the branch's removal. A circle admin cannot drop a branch-set row. Organisers only.
- **D82 (owner, 2026-11-07)** The branch tree is the admin hub. The workspace lands on Branches (not Roadmaps); each branch shows every roadmap, weekly halaqah and upcoming camp reaching it, marked set here or from above, with "Camp here", "Weekly halaqah here", "Assign a roadmap".
- **D83 (owner, 2026-11-07)** Events is a tab: Today · Group · Events · Roadmap/Admin · Profile. Progress moves into Group as its fourth segment (own route kept, Group lit). `/events` leads with camps.
- **D84 (owner, 2026-11-07)** A camp's cost, what to bring, contact and day-by-day schedule are fields, not a paragraph. `cleanSchedule` mirrors 0045's check in the unit suite.
- **D78 (proposed, awaiting owner)** Rebrand to the Youth Nexus palette: blue + navy + orange on white, design tokens v4, Chivo display face. Every v3 value is re-hued at its exact L\*, so contrast holds. The product name stays Cetele until the owner says otherwise. See `docs/DESIGN_SYSTEM.md` on the branch.
- **D65** Planned: compute moves to Cloudflare (`@opennextjs/cloudflare`). Supabase and auth stay. Only `lib/push/send.ts` and `api/push/dispatch` are not portable. Not started.

---

## 7. Local dev — gotchas worth not re-debugging

**Before believing a red e2e**

- **Re-run the spec alone first.** A different spec failing each run and passing alone is machine pressure, proven on unmodified code on the old 6.7 GB WSL VM. omenserver (16 GB) has not shown it yet. Do not raise the Playwright timeout; that hides it.
- **Stop `pnpm dev` first** and check `ss -ltnp | grep :3000`. `reuseExistingServer` silently tests whatever is there, and a stale `next start` gives "This page couldn't load". `pkill -f "next dev"` also kills your own shell.
- **Reset before EACH suite:** `supabase db reset && pnpm test:rls`, then `supabase db reset && pnpm test:e2e`. Neither suite rolls back, and past about 150 leftover circles, list and search screens fail at random.
- **Write fixture-scoped pgTAP assertions,** never global counts. A local-only pgTAP failure usually means a polluted DB.
- **After tapping, go back in-app,** never `page.goto`. A hard navigation loses taps still in the queue.
- **Only `realtime.spec` fails:** run `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/realtime/v1/api/ping`. A 502 is a stale Kong upstream; fix with `supabase stop && supabase start`. A 200 means one failure is still unproven until it repeats on a fresh stack.
- **Sign-in failures are real.** e2e mints credentials with the service role, so there is no email in the path.

**Local browser**

- **Use `http://localhost:3000`, never `127.0.0.1`.** They are separate cookie jars, and Server Actions 403 silently on the wrong one.
- **Phone width:** `resize_page` silently stops at 500px. Use `emulate` with `390x844x2,mobile,touch` and confirm `innerWidth`.
- **Authenticated perf traces:** `pnpm build && pnpm start`, click **Dev sign-in (skip inbox)**, emulate mobile at 4× CPU. Skip network throttling; it times out through the MCP.
- **Judge perf on a production build.** `next dev` compiles per route. Never build while `pnpm dev` is live.
- **`Failed to fetch RSC payload … dev version of React`:** run `rm -rf .next`, hard reload, clear site data, unregister the worker.
- **`Element type is invalid … got: undefined`:** stale chunks from the worker; see `CLAUDE.md`.
- **A new CSS rule or token has no effect, or an SVG goes black:** `next dev` is serving a stale stylesheet. Stop the server and run `rm -rf .next/dev`. Restarting and `touch` don't reliably help. Check with `getComputedStyle(document.documentElement).getPropertyValue("--border")`.
- **`replaceState(window.history.state, ...)` is treated by Next as internal,** so the next Server Action reverts the URL. Use `replaceState(null, "", url)`.
- **A constant exported from a client component cannot be read by a server page.** Put it in a plain module.

**The dev machine: omenserver**

- **An always-on home server,** reached by `ssh omen`. Repo at `~/projects/Cetele`. Node 26 locally; CI uses 22.
- **Docker data lives on the HDD** (`/mnt/data/docker`, containerd snapshotter off), because the SSD is worn. Don't move it back.
- **pnpm** is a global npm install under nvm; **Supabase CLI 3.0.0** and **gh** are binaries in `~/.local/bin`.
- **Headless Chromium needed nine apt libraries** (`libatk1.0-0t64`, `libgbm1`, `libasound2t64` and others), not `playwright install-deps`, which adds Xvfb. A launch failing with `error while loading shared libraries` means one is missing: `ldd` the binary.
- **sudo can't prompt through Claude Code's `!`.** Run root steps from a separate SSH session.

**Supabase and CI**

- **Full local env:** `cp .env.ci .env.local`, plus the service-role key from `supabase status -o env`. `pnpm test:e2e` runs `check:env` first and fails by name if something is missing.
- **GoTrue errors:** read `docker logs supabase_auth_Cetele`. The JS client only reports `AuthRetryableFetchError {}`.
- **`supabase db push` certificate error after "Finished":** the CLI's catalog-cache step, not a migration failure.
- **`supabase db push` DNS error (`no such host`):** seen on the old WSL box, fixed there with `generateResolvConf = false` in `/etc/wsl.conf` and real nameservers in `/etc/resolv.conf`.
- **A Supabase CLI step is red but its report says `Result: PASS`:** read the last lines before the exit code. PostHog telemetry caused it once; `DO_NOT_TRACK: "1"` is set on `stack-tests`.
- **CI jobs:** `verify` (lint, tsc, build, format) and `stack-tests` (migration replay, pgTAP, `check:env`, build, e2e) on every push. Husky pre-commit is the local gate.
