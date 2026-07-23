# Instructions for next steps — UI fixes + refinement pass

> **Purpose:** a precise, self-contained implementation spec so the work can be
> carried out mechanically without re-deriving the architecture. Every edit
> below is exact (file, location, old → new). Follow the **Guardrails** — they
> are load-bearing invariants, not style preferences.
>
> **Branch:** work is already on `mohidkhanzada/ui-refinement-motion` (branched
> off `main`). Commit increments here; do **not** commit to `main`. Merging to
> `main` = deploying to prod → needs explicit owner approval (STATUS.md §3).

---

## 0. Guardrails (do not break these)

| Rule                                                                                                                                                                                                                                                                                                    | Consequence if broken                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Token contract (D14).** No raw hex / `rgb()` / `hsl()` in `.ts`/`.tsx`. Use utilities (`bg-primary`, `text-muted-foreground`, `rounded-xl`) or `var(--token)`.                                                                                                                                        | `pnpm lint` **fails** (ESLint error). |
| **Motion mirrors the CSS tokens (D46).** Durations/eases come from `lib/motion.ts` (`DURATION`, `EASE_BRAND`, `springGlide`, `springCelebrate`, `fadeRise`) or the CSS vars (`--duration-fast/base/slow`, `--ease-brand`, `--ease-spring`). Never invent a duration or cubic-bezier.                    | Two motion languages; visual drift.   |
| **No load-stagger (D46, explicit).** Every screen already fades+rises in via `app/(app)/template.tsx`. Adding a per-list stagger-on-load on top is _motion-on-motion_ and was **rejected**. Motion added here must be **interaction-driven** (hover, tap, pick, error appear), never entrance cascades. | Violates a locked decision.           |
| **`ease-spring` / `springCelebrate` = earned moments only.** Bounce is reserved for closing a ring / celebration. Everything else uses `ease-brand` (ease-out).                                                                                                                                         | Cheapens the celebration.             |
| **Reduced motion is global.** `<MotionConfig reducedMotion="user">` (root layout) + the CSS guard handle it. Don't hand-roll `prefers-reduced-motion` except for raw-canvas/vibration (already done). Use `motion-reduce:` utilities for pure-CSS transforms (as the Today ring cards already do).      | Redundant / inconsistent.             |
| **The app shell does no auth/DB work** (`app/(app)/layout.tsx`, `app-frame.tsx`). Don't add data fetching there.                                                                                                                                                                                        | e2e collapses (D44).                  |

**Definition of done for every change:** `pnpm build` · `pnpm lint` ·
`pnpm exec tsc --noEmit` · `pnpm format:check` all green, **and** verified in a
real browser at **390px** and **1440px**, in **both** light and dark themes.

---

## 1. How to run & verify locally

```bash
supabase start                 # local Postgres/Auth/Mailpit
supabase db reset              # applies migrations + seed (idempotent)
pnpm dev                       # http://localhost:3000  (visuals are fine in dev)
```

**Sign in (local):** open `/`, click **“Dev sign-in (skip inbox)”** (leave the
email blank → signs in as `dev@cetele.local`). It may redirect to a stale
`/login` 404 — ignore it, you are signed in.

**Get seeded data:** the dev user starts with no circle. Visit
**`/join/FAJRSEED`** and click **Join the group** → you’re in **“Fajr Circle”**
(3 tasks: Salawat/Istighfar/Subhanallah; members Ahmad/Zayd/Yusuf).

**Handy fixed IDs (from `supabase/seed.sql`):**

- group: `00000000-0000-0000-0000-0000000000b1`
- task “Salawat”: `00000000-0000-0000-0000-0000000000c1`
- Routes: `/g/<groupId>/today`, `/g/<groupId>/group`, `/g/<groupId>/progress`,
  `/g/<groupId>/count/<taskId>`

> Note: `ahmad@example.com` (the seeded owner) **cannot** complete OTP sign-in
> locally — its `auth.users` row lacks the fields GoTrue needs. Use the fresh
> dev user + join code as above.

---

## 2. PART A — the three reported bugs (exact fixes)

### Bug 1 — Progress “task by task” grid: task names paint over the day squares

**Where:** `components/app/task-grid.tsx`
**Symptom:** on the Progress tab’s _“Last {days} days · task by task”_ grid, the
task labels (Salawat / Istighfar / Subhanallah) appear on top of the coloured
day cells.
**Root cause:** the label is a `position: sticky` first grid-column with a
`bg-card` background. It _does_ clip to its 88px track, but because it floats
over the horizontally-scrolling cells (and, for an empty record, `bg-card` ≈ the
`bg-muted` cells), it reads as text dumped on the squares. The fix is to stop
overlapping entirely: put labels in a **fixed column that does not scroll**, next
to a **cells region that does**, with matching row heights so they stay aligned.

**Edit 1 — the column template (currently line ~98):**

```tsx
// OLD
const cols = `5.5rem repeat(${days}, 2.75rem)`;
// NEW  (label column is now separate; this drives only the cells)
const cellCols = `repeat(${days}, 2.75rem)`;
```

**Edit 2 — replace the scroller block** (the `<div ref={scrollRef} …>` …
`</div>` that spans roughly lines 149–196) with the following. **Keep the
`{row.cells.map((c) => { … })}` button JSX byte-for-byte identical** — you are
only re-housing it and dropping the sticky label span:

```tsx
{
  /* A fixed label column that never scrolls, beside a cells region that does —
    so a long task name can never paint over the day squares (the old sticky
    column floated the label over the cells). Row heights match: h-11 == the
    2.75rem aspect-square cell, gap-1.5 on both, so labels line up with rows. */
}
<div className="flex gap-2">
  <div className="flex shrink-0 flex-col gap-1.5">
    {rows.map((row) => (
      <div
        key={row.taskId}
        className="flex h-11 max-w-[7.5rem] items-center pr-1"
      >
        <span className="truncate text-xs font-medium text-foreground">
          {row.label}
        </span>
      </div>
    ))}
    {/* spacer aligned to the caption row on the right */}
    <div className="h-4" aria-hidden />
  </div>

  <div ref={scrollRef} className="-m-1 no-scrollbar overflow-x-auto p-1">
    <div className="flex w-max flex-col gap-1.5">
      {rows.map((row) => (
        <div
          key={row.taskId}
          className="grid h-11 items-center gap-1"
          style={{ gridTemplateColumns: cellCols }}
        >
          {row.cells.map((c) => {
            /* …EXISTING BUTTON JSX, UNCHANGED… */
          })}
        </div>
      ))}
      {/* Older → today caption under the grid */}
      <div
        className="grid gap-1 text-[10px] text-muted-foreground"
        style={{ gridTemplateColumns: cellCols }}
        aria-hidden
      >
        <span className="col-span-7">{days} days ago</span>
        <span className="col-span-7 text-right">today</span>
      </div>
    </div>
  </div>
</div>;
```

Notes:

- The caption previously had a leading empty `<span />` (for the old label
  column). It’s removed — with `days = 14`, two `col-span-7` = 14 columns, which
  matches `repeat(14, …)`.
- The `scrollRef` “open scrolled to today” effect (lines ~91–94) is unchanged
  and still works — it now scrolls the cells region only.
- Leave the picked-cell detail panel and the legend (below the grid) untouched.

**Verify:** Progress tab, 390 + 1440, both themes. Labels sit in their own
left column; scrolling the cells never moves or collides with the labels.

---

### Bug 2 — Desktop: content stranded in a narrow centred column

**Where:** `components/app/app-frame.tsx` (line ~49)
**Symptom:** on wide screens the content sits in a `max-w-3xl` (48rem) column
centred in the post-sidebar area, leaving large empty gutters both sides — reads
as broken / unlike a normal sidebar app.
**Root cause:** the frame hardcodes `lg:max-w-3xl`, ignoring the design token
`--container-page: 64rem` that already exists for exactly this (see the comment
at `app/globals.css` line ~193).

```tsx
// OLD
<div className="mx-auto flex w-full max-w-[28rem] flex-1 flex-col lg:max-w-3xl">
// NEW  (use the sanctioned page-width token; 64rem fills the space naturally)
<div className="mx-auto flex w-full max-w-[28rem] flex-1 flex-col lg:max-w-[var(--container-page)]">
```

Keep the mobile `max-w-[28rem]` (that column is correct on phones).

**Verify at 1440, both themes:** Today, Group (all three tabs), Progress, Count,
Profile. Gutters should now look like a normal centred app (~80px each side at
1440), not a stranded column. Single-column screens (Count ring, circle list)
will be wider — **that is expected and fine**; do **not** re-narrow them. The
Today rings already reflow to 2 columns via their container-query `Grid`.

---

### Bug 3 — Group header: the circle name truncates (“Fajr Cir…”) with space to spare

**Where:** `components/app/page-header.tsx` (line ~24)
**Symptom:** in the Group tab header, a short name like “Fajr Circle” shows as
“Fajr Cir…” even though there’s hundreds of px of free space before the
“Groups” action.
**Root cause:** the title container is `min-w-0` but not allowed to _grow_.
`GroupSwitcher`’s button is `max-w-full`, whose “full” resolves against the
title container’s width — a circular constraint the browser resolves by
under-sizing the container ~8px, so the truncating span clips. Letting the
container flex-grow breaks the circularity (measured: span goes from clientW 107
/ scrollW 115 → 115/115, i.e. no clip).

```tsx
// OLD
<div className="min-w-0">
// NEW
<div className="min-w-0 flex-1">
```

This is safe for **every** `PageHeader` (the row is already `justify-between`
with a `shrink-0` action; `flex-1` just lets the title claim the free space
instead of leaving it stranded). Headers without an action are unaffected.

**Verify:** Group tab, 390 + 1440. “Fajr Circle” shows in full with the chevron.
Also spot-check Today (greeting + streak chip) and Progress (title + subtitle,
no action) look unchanged.

---

## 3. PART B — the refinement (ambitious, but inside the system)

This is a **real visual lift**, not just spacing tweaks — richer heroes, more
depth, better hierarchy, and motion that makes the app feel alive. It is still
**inside the design system**: every new value is a **token**, gold stays scarce,
contrast stays AA. Work **one screen at a time**, verify in-browser (390 + 1440,
light + dark) after each, and commit per screen so a regression is easy to bisect.

### B.0 — Art-direction guardrails (read before touching pixels)

| Principle                                     | Rule                                                                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Emerald is the world; gold is the reward.** | Gold (`accent`) = **one** earned/primary action _or_ a celebration per view — never decoration. Emerald + neutrals carry everything else. Don’t “brighten” a screen by adding gold. (D25)                                 |
| **Depth via tokens.**                         | New gradients/glows/shadows go in `app/globals.css` as tokens (§B.1), referenced by utility or `var(--token)`. **Never** inline a colour in `.tsx` (lint fails, D14). globals.css is CSS, so raw stops there are allowed. |
| **Contrast is non-negotiable.**               | The tokens carry documented AA ratios (globals.css comments). If you put text on a new gradient, keep ≥4.5:1 (body) / ≥3:1 (large). White-on-gold **fails** — gold surfaces use `--accent-foreground` (dark).             |
| **Don’t re-tint the garden.**                 | `group-garden.tsx` sky/ground are owner-approved; the dark re-tint is handled in globals.css (`.garden-*`). Leave hues alone; you may restyle the card _around_ it.                                                       |
| **Both themes, always.**                      | Every new token needs a `:root.dark` value. On dark, depth comes from **lighter surfaces + border**, not shadow (shadows barely register — see globals.css §dark).                                                        |
| **Motion budget (D46 still binds).**          | No list load-stagger. Motion is interaction-driven (hover/tap/pick/appear) + value-change. Bounce (`ease-spring`/`springCelebrate`) only for earned moments.                                                              |

### B.1 — Foundation: add depth tokens first (do this before the screens)

Add to `app/globals.css`. Put the gradient/glow definitions in `:root` and
mirror them in `:root.dark`. Use the existing numbered scale vars
(`--color-primary-600`, `--color-primary-800`, `--color-accent-500`, etc.) as
stops so they stay on-brand:

```css
/* :root — light */
--gradient-hero: linear-gradient(
  135deg,
  var(--color-primary-700) 0%,
  var(--color-primary-800) 55%,
  var(--color-primary-900) 100%
);
--gradient-hero-sheen: radial-gradient(
  120% 100% at 100% 0%,
  rgb(255 255 255 / 0.12),
  transparent 60%
);
--glow-primary:
  0 0 0 1px var(--color-primary-600), 0 8px 24px -8px var(--color-primary-700);
--glow-accent:
  0 0 0 1px var(--color-accent-500), 0 8px 24px -8px var(--color-accent-600);
--surface-raised: color-mix(
  in oklab,
  var(--card) 92%,
  var(--primary) 8%
); /* faint emerald-tinted card for secondary heroes */

/* :root.dark — mirror (lighter emerald stops so the hero reads on brown) */
--gradient-hero: linear-gradient(
  135deg,
  var(--color-primary-800) 0%,
  var(--color-primary-900) 60%,
  #0f2f22 100%
);
--glow-primary: 0 0 0 1px var(--color-primary-700), 0 8px 24px -10px #000;
--surface-raised: color-mix(in oklab, var(--card) 85%, var(--primary) 15%);
```

Reference them as `bg-[image:var(--gradient-hero)]`,
`shadow-[var(--glow-accent)]`, `bg-[var(--surface-raised)]`. Add a short entry
to `docs/DESIGN_SYSTEM.md` and a swatch to the `/designsystem` route for each new
token (that route is the living reference — keep it honest).

### B.2 — Reusable patterns (build once, use across screens)

Add these to `components/ui/` (or `components/app/` if app-specific) so the lift
is consistent, not per-screen improvisation:

1. **`HeroCard`** — the one emphasis surface per screen. `rounded-3xl`,
   `bg-[image:var(--gradient-hero)]` + an overlaid `--gradient-hero-sheen`,
   `text-primary-foreground`, `shadow-lg`. Props for an icon medallion (a
   `size-14 rounded-2xl bg-primary-foreground/10` tile), a big stat, and a
   trailing slot. Replaces the hand-rolled emerald card in Progress
   (`progress-client.tsx` streak hero) and the Welcome/FreshStart banners.
2. **`Eyebrow`** — the small uppercase label already hand-written in several
   places (`text-xs font-semibold tracking-wide uppercase text-muted-foreground`).
   Extract it so section labels are identical everywhere.
3. **`StatRing`** — a `ProgressRing` sized for a hero with a centered value +
   caption, used for the Group “circle today %” and Count. Wraps the existing
   `ProgressRing` (`components/ui/progress-ring.tsx`) — don’t fork it; if the
   ring needs a gradient stroke or a soft track, add that as a prop there.
4. **`ProgressBar`** — the emerald fill bar is copy-pasted 4× (group overview
   ×2, progress band, collective list). Extract one component
   (`h-2.5 rounded-full bg-muted` track + `bg-primary` fill with the existing
   `transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-brand)]`),
   with a `tone` prop for `primary` vs `success` (met). Replace the copies.

> These four extractions are what turn “nicer here and there” into a coherent
> lift. Do them **first**, then the screens below mostly become “swap in the new
> component + tune spacing.”

### B.3 — Per-screen briefs

Verify each at 390 + 1440, both themes, before moving on. **P1** = do it,
**P2** = do if time; **risk** flags how much can go wrong.

**Today (`today-client.tsx`)** — the daily home; make it feel warm and alive.

- **[P1, low] Ring tiles → richer cards.** Bump the ring to `size={72}`, add a
  slim `ProgressBar` under the label, and clearer hierarchy: label
  (`font-display font-semibold`), Arabic subtitle, then `count / target` in
  `tabular-nums`. Keep the hover-lift recipe (§B.5) and chevron.
- **[P1, low] Promote the nearest-to-done ring.** The `next` tile gets a subtle
  emerald ring/border (`shadow-[var(--glow-primary)]`) so the eye lands on the
  one to continue — reinforces the single gold “Continue” CTA above it.
- **[P2, med] “Your circle today” → mini-leaderboard.** Add an `Avatar`
  (initials) per member and a slim per-member ring/bar; keep rows **flat/
  non-interactive** (they don’t navigate). Tighten to a clean list rhythm.
- **[P2, low] Header.** Add today’s date under the greeting (`Eyebrow` +
  `fmtLongDate(todayISO)`); keep the streak chip as the single right-side stat.

**Group (`group-client.tsx`)** — a small dashboard; unify the top.

- **[P1, med] Overview hero.** Replace the plain-text “The circle today 0%”
  card with a `StatRing` (large ring = `collectivePct`) beside the count and a
  live pulse dot. Sit it directly under the garden so the top reads as one
  cohesive hero block, not three stacked cards.
- **[P1, low] Bars → `ProgressBar`.** Swap the “Steadfast · 90 days” and each
  “Collective progress” bar for the extracted component; add the `success` tone
  when met (keep the existing ✓ “met” chip).
- **[P2, low] Standings top-3.** Keep the medals; give the current user’s row
  the existing accent tint and add `Avatar`s to all rows for scan-ability.
- **[P2, low] Members rows.** Add `Avatar`s; keep admin rows as buttons (open
  breakdown), non-admin rows flat.

**Progress (`progress-client.tsx`)** — the motivational spine.

- **[P1, low] Streak hero → `HeroCard`.** Move the emerald streak block onto
  `HeroCard` (gradient + sheen + medallion for the flame). `longest` becomes a
  `Badge`/chip in the trailing slot. This is the screen’s one hero.
- **[P1, low] Consistency band.** Use `ProgressBar`; keep the calm `bandWord`.
  Optional [P2]: a `StatRing` instead of a bar for a stronger focal point.
- **[P2, med] Badges.** Earned badges get a faint `--surface-raised` fill + a
  soft gold rim **only if earned** (`shadow-[var(--glow-accent)]` at low
  opacity) — this is a sanctioned gold use (earned). Locked badges stay muted
  and flat. Don’t over-gild — restraint reads as premium.
- Task grid: already redesigned in Part A — leave it.

**Count (`count-client.tsx`)** — the tap ritual; make the ring the hero.

- **[P1, med] Ring depth.** Give the big `TapPad` ring a soft track and, as it
  approaches the target, a gentle emerald glow (`shadow-[var(--glow-primary)]`
  on the ring wrapper, ramped by proximity — bind opacity to `count/target`).
  At 100% the glow is fullest (an earned moment — the celebration already fires).
- **[P1, low] Number + affordance.** Keep the `count-pop`; enlarge the value,
  soften “of {target}”, and make “Tap anywhere to count” a calmer caption.
- **[P2, low] Correction pill + action bar** stay as-is structurally; just make
  sure they align to the new rhythm and the pinned bar still spans edge-to-edge.

### B.4 — Motion (expanded, still D46-safe)

Interaction-driven + value-change only. **No list load-stagger.**

1. **[P1] TaskGrid picked-cell detail** — `AnimatePresence mode="wait"` keyed by
   `picked?.taskId + picked?.date` (or `"empty"`), fade `opacity` + `y:4/-4` on
   `easeBrand(DURATION.fast)`. Model on the `panel` variant in `group-client.tsx`
   (lines ~48–53). Only the text inside animates; the box stays put.
2. **[P1] Alerts fade in** — wrap inline page-level `{error && <p role="alert">}`
   (count/group/task-grid/progress) in `AnimatePresence` + `motion.p`
   (`initial{opacity:0,y:-4} → animate{opacity:1,y:0} → exit{opacity:0}`,
   `easeBrand(DURATION.fast)`). Leave alerts inside `Dialog` alone.
3. **[P1] Banners appear/dismiss** — Welcome/FreshStart (`today-client.tsx`)
   mount conditionally; wrap in `AnimatePresence` so they ease in/out rather than
   pop.
4. **[P1] Tap ripple on `TapPad`** — on each tap, spawn a short emerald ripple
   (a `motion.span` scaling `0→1` + `opacity 0.25→0` on `DURATION.base`,
   `bg-primary/20`). This is feedback, not celebration — no bounce.
5. **[P2] Value-change count-up (Count ring only).** When the settled count
   changes, tween the displayed number to the new value (`DURATION.base`,
   `ease-brand`). This is **value-change**, not load — allowed. Do **not** add
   count-ups that run on mount/navigation anywhere.
6. **[P2] Hover-scale on ring tiles** — a `hover:scale-[1.01]` alongside the
   lift (see §B.5), `motion-reduce:transform-none`.
7. **Do NOT** touch: `Segmented`/nav pill (`springGlide` shared-layout already),
   page transition (`template.tsx`), celebration confetti, `count-pop`,
   progress-bar width growth — all exist; verify, don’t re-add.

### B.5 — Hover / focus (richer, but honest)

Reference recipe (Today ring cards, `today-client.tsx` ~210–213):

```
transition-[box-shadow,transform] duration-[var(--duration-base)]
hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none
```

1. **Only interactive things lift.** Card-links / buttons that navigate or open
   get the recipe (optionally `+ hover:scale-[1.01]` and, for the promoted
   Today ring, `hover:shadow-[var(--glow-primary)]`). Static rows — Today
   “circle today”, Standings — **stay flat** (a lift implies a click that isn’t
   there).
2. **Don’t touch** existing token hovers on Buttons/ghost/outline/link and the
   day-strip — they’re correct.
3. **Focus-visible** on any new bare `<button>`/`<a>`:
   `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`.
   Global `:focus-visible` already draws a ring, but keep it explicit on custom
   interactive elements.
4. All hover state = **transform / shadow / token-colour** only. No inline
   colours, no new hues (define a token if you truly need one).

### B.6 — Layout sweep (fold Part A’s width change through)

After Bug 2 widens the column, re-check every screen at 1440:

- **Count** (`count-client.tsx`): ring still centres (it will); the pinned bar’s
  `-mx-5 … px-5` still matches `Screen`’s `px-5` — leave it.
- **Profile** (`profile-client.tsx`): if a single input stretches awkwardly at
  1440, cap that **input** with `max-w-*`, never the page.
- **Group header actions**: on 360px, confirm “Groups” + settings don’t wrap
  under the now-untruncated title; if tight, collapse “Groups” to icon-only
  under `sm` (keep `aria-label`).
- Do **not** re-tune global gaps — the 2026-07-24 pass already put everything on
  `Screen`/`Stack`/`Grid`.

---

## 4. Final verification checklist

- [ ] `pnpm build` green
- [ ] `pnpm lint` green (token contract holds — no raw colours)
- [ ] `pnpm exec tsc --noEmit` green
- [ ] `pnpm format:check` green
- [ ] Bug 1: Progress grid — labels in their own column, no overlap, aligned
      rows, scrolls to today. (390 + 1440, light + dark)
- [ ] Bug 2: 1440 — content fills the column, no stranded gutters; every screen
      still reads well; single-column screens not re-narrowed.
- [ ] Bug 3: Group header shows the full circle name; other headers unchanged.
- [ ] **B.1 tokens** exist in **both** `:root` and `:root.dark`, are referenced
      via utilities/`var()` (no inline colours in `.tsx`), and are documented in
      `docs/DESIGN_SYSTEM.md` + shown on `/designsystem`.
- [ ] **B.2 components** (`HeroCard`, `Eyebrow`, `StatRing`, `ProgressBar`)
      extracted and the old copy-pasted versions replaced (no orphaned dupes).
- [ ] **Gold scarcity holds** — each screen has at most one gold
      action/celebration; nothing gold added as decoration.
- [ ] **Contrast AA** on every new surface (esp. text on `--gradient-hero`;
      gold surfaces use `--accent-foreground`, never white).
- [ ] **Both themes** verified for every changed screen — dark depth comes from
      lighter surfaces + border, not shadow.
- [ ] Motion respects reduced-motion (OS “reduce motion” → fades/ripples/count-up
      collapse; nothing janks); **no** list load-stagger anywhere (D46).
- [ ] Hover: only real link/button targets lift; static rows stay flat; focus
      rings visible on keyboard nav.
- [ ] No changes under `app/(app)/layout.tsx` / `app-frame.tsx` beyond the
      one-line width token (the shell stays inert — no auth/DB).

When all green: **ask the owner before merging to `main`** (that confirm is the
deploy approval, STATUS.md §3), then update `.claude/STATUS.md` “Last work” +
Linear. On merge: fast-forward, push, delete the branch (local + remote).
