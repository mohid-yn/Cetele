# CLAUDE.md — agent context for Cetele

A mobile-first **group dhikr tracker** (installable PWA): dopamine hooks (tap
counter, progress rings, streaks, live collective counter) layered on **real
group accountability** to make daily dhikr stick. Built around the traditional
_cetele_ — a group that splits and completes a shared dhikr goal together.

## Start here (resume context)

1. **[.claude/STATUS.md](.claude/STATUS.md)** — current state, how we work, the invariants, and the decisions that still bind. **Read first — it is the only doc that tracks status.** Full history (every decision in full, every shipped milestone) is archived in [.claude/history/](.claude/history/) — consult it only when you need the _why_ behind a specific decision number.
2. **[docs/PRD.md](docs/PRD.md)** — the product spec (features, roles, data model, success metrics). This is the editable source of truth; `docs/PRD.docx` is a generated Word copy for the user.

When resuming: read STATUS.md, continue from its "Next steps". When work state
changes, update STATUS.md **and** Linear — never track status elsewhere.

## How we work

- **Track in Linear** (team `CET`, https://linear.app/mohidkz/team/CET) via the Linear MCP — keep issue state in sync with the code.
- **Confirm consequential product decisions** with the user, then log them in STATUS.md "Decisions locked".
- **Build in increments**, verify, then commit. End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Branching — `main` is PRODUCTION and is gated; `staging` is the soak (D50):**
  - **Nothing reaches `main` that has not sat on `staging` first.** `main` is only ever **fast-forwarded from `staging`**.
  - Cut one **feature branch per Linear issue off `staging`** (not `main`), named to match the issue's git branch (`mohidkhanzada/cet-N-slug`). Never commit features straight to either long-lived branch.
  - Commit increments; **push to get a Vercel preview URL**.
  - When `build` + `lint` + `tsc` + `format:check` are green, merge to **`staging`**, push, **delete the feature branch** (local + remote). This needs no approval — staging is not production.
  - **Verify on the staging URL**, then **ask the owner before promoting to `main`** — that confirm is the approval step (it replaces a PR).
  - Promotion is `ALLOW_MAIN_PUSH=1 git push origin main`; `.husky/pre-push` refuses anything else (unsoaked commit, non-fast-forward, or a missing override). Open a real PR only ad-hoc when a written review trail is wanted (`gh` is installed). See STATUS.md **§3** + **D16**.
- The user prefers **concise, scannable** docs — tables and short bullets, not walls of text.
- **Keep the PRD Word copy in sync:** edit `docs/PRD.md`, then regenerate the formatted `.docx` with `python3 scripts/build_prd_docx.py` (stdlib-only; the script _is_ the doc's formatting — edit its content there too).

## UI / design system

Themed **sage `#346D3F` + rose `#ED6B86` on warm paper `#FAF6EC`** (light-first; dark = warm
brown). This is **v3** — the whole palette was re-derived from the owner's swatches as Material 3
tonal ramps (D20 → D25 → v3; the emerald + gold of v1/v2 is gone, brand mark included).
Sage = brand + calm/spiritual + completion/growth; rose = earned action +
celebration only. Build UI from the existing system — don't hard-code
colors/spacing or fork primitives.

- **Token contract (enforced):** every UI value comes from a design token in
  `app/globals.css` — colour, type, spacing, radius, shadow, motion, z-index.
  Reference via a utility (`bg-primary`, `text-sm`, `rounded-lg`) or `var(--token)`;
  **never hardcode** a colour. Raw hex/`rgb()`/`hsl()` in `.ts`/`.tsx` is an
  **ESLint error** (`pnpm lint` fails). Need a new value? Add a token, don't inline.
  The only sanctioned literal is `lib/brand.ts` (`BRAND_THEME_COLOR`, for PWA/meta).
- **Components:** `components/ui/` (Button, Card, Badge, Input/Field, Avatar,
  ProgressRing, Stat, Spinner) — import from `@/components/ui`. Pattern: `cva` +
  `cn` (`lib/utils.ts`), always spread `className`/`...props`.
- **No emoji in the UI — ever.** Every mark is a drawn icon from
  `components/app/icons.tsx` (24×24, 2px round caps, `currentColor`). An emoji is rendered by
  the OS in its own font and colours, so it cannot honour a token, and it is the owner's
  standing objection ("emojis look tacky"). Missing a mark? Draw it there. The gallery on
  `/designsystem` is derived from that module's exports, so a new icon appears automatically.
- **Living reference:** route `/designsystem`. **Guidelines:** `docs/DESIGN_SYSTEM.md`.
- Accent (rose) = one primary action per view. PWA icons: `node scripts/gen-icons.mjs`;
  iOS launch/splash images: `node scripts/gen-splash.mjs` (regenerate after editing
  `public/logo.svg` or the device table in `lib/apple-splash.js`).

## Commands

`pnpm dev` (dev server) · `pnpm build` · `pnpm start` (serve prod build) ·
`pnpm lint` · `pnpm exec tsc --noEmit` (typecheck). Run them directly — you're
inside WSL. Verify build + lint + tsc are green before committing.

> Note: the service worker only registers in **production** (`pnpm build && pnpm start`),
> not in `pnpm dev`. PWA icons: `node scripts/gen-icons.mjs`; iOS splash images:
> `node scripts/gen-splash.mjs`. The installed PWA caches the old manifest/icons — to
> see a `start_url`/splash change, remove the home-screen icon and re-add it.

## Stack

Next.js (App Router) + React + TypeScript + Tailwind + shadcn/ui · **Supabase**
(Postgres, Auth, Realtime) · hosted on **Vercel** · shipped as an **installable
PWA** (no app store). Develop inside WSL Ubuntu — run `pnpm` directly.

## Retention thesis

Dhikr is _repetitive habit-maintenance_, not skill mastery — the use case where
gamification works. Lean into dopamine, but anchor it in group accountability +
"never miss twice" forgiveness so streaks breaking doesn't cause permanent quit.
Reference: `../arabic-app/claude/retention_and_motivation_guide.md` (note: that
guide argues _against_ gamification — but that's for a mastery app; the durable
mechanics, esp. real accountability & never-miss-twice, still apply here).
