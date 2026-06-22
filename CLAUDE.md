# CLAUDE.md — agent context for Cetele

A mobile-first **group dhikr tracker** (installable PWA): dopamine hooks (tap
counter, progress rings, streaks, live collective counter) layered on **real
group accountability** to make daily dhikr stick. Built around the traditional
*cetele* — a group that splits and completes a shared dhikr goal together.

## Start here (resume context)

1. **[.claude/STATUS.md](.claude/STATUS.md)** — current state, locked decisions, and ordered next steps. **Read first — it is the only doc that tracks status.**
2. **[docs/PRD.md](docs/PRD.md)** — the product spec (features, roles, data model, success metrics).

When resuming: read STATUS.md, continue from its "Next steps". When work state
changes, update STATUS.md **and** Linear — never track status elsewhere.

## How we work

- **Track in Linear** (team `CET`, https://linear.app/mohidkz/team/CET) via the Linear MCP — keep issue state in sync with the code.
- **Confirm consequential product decisions** with the user, then log them in STATUS.md "Decisions locked".
- **Build in increments**, verify, then commit. End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- The user prefers **concise, scannable** docs — tables and short bullets, not walls of text.

## Stack

Next.js (App Router) + React + TypeScript + Tailwind + shadcn/ui · **Supabase**
(Postgres, Auth, Realtime) · hosted on **Vercel** · shipped as an **installable
PWA** (no app store). Develop inside WSL Ubuntu — run `pnpm` directly.

## Retention thesis

Dhikr is *repetitive habit-maintenance*, not skill mastery — the use case where
gamification works. Lean into dopamine, but anchor it in group accountability +
"never miss twice" forgiveness so streaks breaking doesn't cause permanent quit.
Reference: `../arabic-app/claude/retention_and_motivation_guide.md` (note: that
guide argues *against* gamification — but that's for a mastery app; the durable
mechanics, esp. real accountability & never-miss-twice, still apply here).
