# STATUS — Cetele (ground truth)

> **This is the single source of truth for what is being worked on right now.**
> Read this first when resuming. When work state changes, update this file **and** Linear — never track status anywhere else.

_Last updated: 2026-06-22_

---

## What Cetele is

A mobile-first **group dhikr tracker** (installable PWA) that uses dopamine hooks + real group accountability to make daily dhikr stick. Full spec: [`docs/PRD.md`](../docs/PRD.md).

---

## Decisions locked

| # | Decision |
|---|---|
| D1 | Framework: **Next.js (App Router) + React + TypeScript**, Tailwind + shadcn/ui |
| D2 | Backend: **Supabase** (Postgres + Auth + Realtime), **Vercel** hosting |
| D3 | Delivery: **installable PWA** — no app store (org can't institutionalise store apps) |
| D4 | Auth: **Google OAuth + email magic link** |
| D5 | Dhikr list is **set by the group admin** (items + daily targets, per group) |
| D6 | Logging: **tap counter** + progress rings + **live collective group counter** (Realtime) |
| D7 | v1 = **Social v1** (groups, admins, logging, streaks, leaderboard, live counter). Push notifications = v1.1 fast-follow |
| D8 | Retention = dopamine layer **on top of** group accountability + "never miss twice" forgiveness |
| D9 | **Three roles**: `member` · `group_admin` (per group) · `admin` (app-level, via `users.is_admin`) |
| D10 | Notifications = **Web Push + service worker** (VAPID, sent from Vercel cron / Supabase Edge Fn); **email fallback** (Resend) for non-installers / iOS <16.4. Push is v1.1 |

---

## Current phase: 🟡 Foundation / setup

### Done
- [x] Repo cloned, `.gitignore` added
- [x] Docs: PRD written (`docs/PRD.md` + `docs/PRD.docx`)
- [x] `.claude/STATUS.md` + `CLAUDE.md` created
- [x] Linear issues created for all v1 + v1.1 features (CET-1 → CET-11)
- [x] **CET-1** — Next.js 16 + React 19 + TS + Tailwind 4 scaffolded; installable PWA (manifest + service worker + icons); mobile-first layout. `pnpm build`/`lint`/`tsc` all green. _(branch `mohidkhanzada/cet-1-scaffold-nextjs-app-pwa`)_

### Next steps (ordered) — tracked in Linear

| # | Issue | Feature |
|---|---|---|
| 1 | [CET-1](https://linear.app/mohidkz/issue/CET-1) | Scaffold Next.js app + PWA ✅ |
| 2 | [CET-2](https://linear.app/mohidkz/issue/CET-2) | Supabase: schema + Row-Level Security |
| 3 | [CET-3](https://linear.app/mohidkz/issue/CET-3) | Auth: Google OAuth + email magic link |
| 4 | [CET-4](https://linear.app/mohidkz/issue/CET-4) | Groups: create / invite / join + roles |
| 5 | [CET-5](https://linear.app/mohidkz/issue/CET-5) | Admin dhikr-list editor |
| 6 | [CET-6](https://linear.app/mohidkz/issue/CET-6) | Tap counter + progress rings |
| 7 | [CET-7](https://linear.app/mohidkz/issue/CET-7) | Live collective group counter (Realtime) |
| 8 | [CET-8](https://linear.app/mohidkz/issue/CET-8) | Streaks + never-miss-twice forgiveness |
| 9 | [CET-9](https://linear.app/mohidkz/issue/CET-9) | Group leaderboard |
| 10 | [CET-10](https://linear.app/mohidkz/issue/CET-10) | Variable-reward milestones |
| — | [CET-11](https://linear.app/mohidkz/issue/CET-11) | _(v1.1)_ Push notifications + email reminders |

---

## Linear

- Team: **`CET`** — https://linear.app/mohidkz/team/CET/overview
- Track every v1 feature as an issue; update issue state as work completes.

## Open questions / parking lot
- _(none yet)_
