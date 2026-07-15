# Cetele Design System

Themed **emerald `#047857` + gold `#F59E0B` on warm cream `#FAF6EC`** (light-first; see §Colour + D25). Emerald is
brand, calm/spiritual, _and_ the completion/growth signal; gold is reserved for
earned action and celebration only.
Live reference: **`/designsystem`** · Tokens: **`app/globals.css`** · Components: **`components/ui/`**.

---

## 0. The token contract (golden rule) — read first

> **Every UI value comes from a design token. No exceptions in components.**

All colour, typography, spacing, radius, shadow, motion, and layering values are
defined **once** as CSS variables in `app/globals.css` (`@theme` + `:root`). UI
code must reference them — it must **never** hardcode a raw value. This is what
makes the whole app re-themeable from one file and keeps it modular.

**How to reference a token (in priority order):**

1. **Token-backed Tailwind utility** — the default. `bg-primary`, `text-foreground`, `p-4`, `rounded-lg`, `text-sm`, `shadow-md`, `gap-3`. These all resolve to the CSS variables under the hood.
2. **`var(--token)`** — when a utility doesn't fit (inline `style`, SVG strokes, dynamic values). `style={{ stroke: "var(--accent)" }}`, `className="z-[var(--z-modal)]"`.

**Forbidden in components:**

- Raw colours: `#1d3a5f`, `rgb(...)`, `hsl(...)`, `text-[#fff]` → **ESLint error** (`no-restricted-syntax`, see `eslint.config.mjs`). `pnpm lint` fails the build.
- Magic numbers for spacing/size: prefer the scale (`p-4`, `h-11`) over `p-[13px]`. Arbitrary values are allowed only for genuinely relative/one-off cases (`size-[1.1em]`).

**The one sanctioned literal:** `lib/brand.ts` exports `BRAND_THEME_COLOR` — the
PWA manifest and `<meta name="theme-color">` are platform APIs that require a
literal colour and can't read CSS vars. That file is the _only_ place a raw
brand colour lives; keep it in sync with `--primary`.

**Adding a value?** If something you need isn't a token yet, **add it to
`app/globals.css`** (and document it here) — don't inline it.

---

## 1. Principles

1. **Tokens over hard-codes.** Never write a raw hex or px color in a component. Use a token (`bg-primary`, `text-muted-foreground`, `border-border`). One re-theme = one edit.
2. **Semantic before scale.** Prefer `bg-primary` / `text-foreground` over `bg-primary-700`. Reach for a scale step (`bg-accent-100`) only for tints/states the semantic layer doesn't cover.
3. **Accent is precious.** Gold = the single most important action or live progress on a screen. Emerald is the workhorse. If everything is accent, nothing is.
4. **Mobile-first.** Design for the phone, enhance up. Tap targets ≥ 44px (our `md`/`icon` buttons are 44px).
5. **Accessible by default.** Visible focus ring, labelled controls, **AA contrast (≥ 4.5:1)**, `aria-*` on stateful components.
6. **Never colour alone.** ~6–8% of men can't separate green/amber/orange/red. Every status colour ships with a **glyph or text label** (✓ ✗ ⚠ / "Complete" / "At risk"); never green-vs-red as the only differentiator.
7. **Motion serves, never decorates.** 150–300ms micro-interactions, ≤500ms transitions, `--ease-spring` only for earned celebration; everything no-ops under `prefers-reduced-motion`.
8. **Composition over configuration.** Small primitives that compose (Card + Stat + Button) beat one mega-component with 20 props.

---

## 2. Design tokens

All tokens live in `app/globals.css`. Tailwind 4 generates utilities from them.

### Color

| Layer                      | Tokens                                                                                                                                                                                                   | Use                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Scales**                 | `primary-{50–950}`, `accent-{50–950}`, `neutral-{0–950}`, `success/warning/danger/info-{500,600}`                                                                                                        | tints, borders, state backgrounds |
| **Semantic** (theme-aware) | `background`, `foreground`, `card`, `card-foreground`, `muted`, `muted-foreground`, `border`, `input`, `ring`, `primary(-foreground)`, `accent(-foreground)`, `success/warning/danger/info(-foreground)` | everything in components          |

- Generates `bg-*`, `text-*`, `border-*`, `ring-*`, `fill-*`, etc.
- `--ring` is **emerald** — focus is high-visibility, calm, and on-brand.
- Dark mode = a **persisted Light/Dark toggle** (a `.dark` class on `<html>` set before paint; default light — the System/OS-follow option was dropped 2026-06-29); only semantic tokens flip. Light is still the priority, but dark is now **tuned** per `docs/UI_PRACTICES.md §2`: elevation comes from a surface ladder (`background` < `card` < `muted`, lighter = raised) + a visible `--border` (shadows barely register on dark), with calmed accent/status hues.

#### Colour psychology & meaning (why these colours)

Research-backed (habit-app + Islamic-app + white-UI research, 2026-06): **green
calms and signals growth/spirituality/completion; a single warm accent arouses;
red alarms.** For a dhikr audience green is both culturally expected and the
retention-correct "done" colour. Map meaning once and never reassign it:

| Colour                | Role                                                                                           | Why                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Emerald** `primary` | Brand, calm/spiritual surface, **completion & growth** — chrome, buttons, closed rings, "done" | Green lowers anxiety, reads as harmony/renewal for a dhikr audience, and is the natural "this is complete/alive" hue    |
| **Gold** `accent`     | The **one** primary action per view + live progress + celebration                              | Warm = arousal/energy "without red's alarm"; gold carries Islamic resonance; spend it at moments so it stays meaningful |
| **Emerald** `success` | Complete / on track                                                                            | Same family as brand, a touch brighter so "done" pops — always paired with a ✓ glyph                                    |
| **Orange** `warning`  | At risk / needs attention                                                                      | True orange (distinct from gold accent) — caution without alarm, paired with text                                       |
| **Red** `danger`      | Errors & destructive actions **only**                                                          | Red = "this is wrong/destructive", never urgency or FOMO marketing                                                      |

- **Warm surface:** `--background` is a **cream `#FAF6EC`** (light) / **deep warm brown `#1A140F`** (dark) — softer and calmer than stark white/black for a worship app. Cards stay **white** (light) / a lighter brown (dark) so they **lift off** the page by tone + border + shadow; muted fills/borders are warmed to match.
- **Contrast is non-negotiable (WCAG AA ≥ 4.5:1).** That's why `accent-foreground` is **dark, not white** — white-on-gold is only ~1.9:1 (fails); dark-on-gold is ~8:1.
- **One accent per view, ≤ ~3 hues per view.** If everything is coloured, nothing stands out and retention drops.

### Typography

- Families: `--font-sans` → **Geist** (body, UI); `--font-display` → **Quicksand** (headings, numbers, brand); `--font-mono`.
- Sizes (token + paired line-height): `--text-xs … --text-5xl` → utilities `text-xs … text-5xl`.
- Weights: `--font-weight-normal|medium|semibold|bold` → `font-normal … font-bold`.
- Headings & big numbers use `font-display`. Use `tabular-nums` for counts/streaks so digits don't jitter.

### Spacing

- 4px base (`--spacing`, Tailwind scale). Stick to `1 2 3 4 6 8 12 16`. Inside cards use `p-6`; stack gaps `gap-1.5`–`gap-6`.

### Radii

`--radius-sm`(6) `md`(8) `lg`(12) `xl`(16) `2xl`(24) `3xl`(32) → `rounded-*` (+ `rounded-full`). Buttons `lg`, cards `2xl`, pills/badges/avatars `full`.

### Elevation

`--shadow-xs sm md lg xl` → `shadow-*` — soft, neutral-tinted for a clean lift on white. Cards `sm`; menus/popovers `md`–`lg`; modals `xl`.

### Motion

`--duration-fast|base|slow` (150/220/360ms), `--ease-brand` (entrances), `--ease-spring` (celebration only). Respect `prefers-reduced-motion`.

### Layout & layering

`--container-page` (page max-width) and the z-index ladder `--z-base|dropdown|sticky|overlay|modal|toast`. Use via `var()`: `className="z-[var(--z-modal)]"`. Never invent ad-hoc z-index numbers.

---

## 3. Components (`components/ui/`)

Import from the barrel: `import { Button, Card, ProgressRing } from "@/components/ui";`

| Component                                              | Key props                                                                                                                          | Notes                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `Button`                                               | `variant` (primary·accent·outline·subtle·ghost·link·destructive), `size` (sm·md·lg·icon), `loading`, `leadingIcon`, `trailingIcon` | One accent per view                       |
| `Card` + `CardHeader/Title/Description/Content/Footer` | —                                                                                                                                  | Default surface                           |
| `Badge`                                                | `variant`, `size`                                                                                                                  | Roles, status, counts                     |
| `Input`, `Label`, `Field`                              | `Field`: `label`, `htmlFor`, `hint`, `error`, `required`                                                                           | Always wrap inputs in `Field`             |
| `Avatar`                                               | `name` (required, for initials+alt), `src`, `size`                                                                                 | Falls back to initials on error           |
| `ProgressRing`                                         | `value`, `max`, `size`, `thickness`, `progressColor`                                                                               | Signature dhikr ring; turns green at 100% |
| `Stat`                                                 | `label`, `value`, `icon`, `hint`                                                                                                   | Streaks, totals, ranks                    |
| `Spinner`                                              | —                                                                                                                                  | Inherits `currentColor`                   |

---

## 4. Authoring a new component

Follow the house pattern so everything stays consistent:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const thingVariants = cva("base classes here", {
  variants: { variant: { default: "…" } },
  defaultVariants: { variant: "default" },
});

export interface ThingProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof thingVariants> {}

export function Thing({ className, variant, ...props }: ThingProps) {
  return (
    <div className={cn(thingVariants({ variant }), className)} {...props} />
  );
}
```

Rules:

- **Always** accept and spread `className` (merged last via `cn`) and `...props`. Callers must be able to override.
- Use `cva` for anything with ≥ 2 visual variants; plain `cn` otherwise.
- `forwardRef` for focusable/controllable elements (inputs, buttons).
- Add `"use client"` **only** when the component uses state/effects/handlers. Keep primitives server-compatible where possible.
- Export the component + its `*Variants` + its `*Props` type; add it to `components/ui/index.ts`.
- Tokens only — no raw colors/px. No `style={{}}` except for genuinely dynamic values (e.g. ring geometry).

---

## 5. Do / Don't

| ✅ Do                                            | ❌ Don't                               |
| ------------------------------------------------ | -------------------------------------- |
| `className="bg-primary text-primary-foreground"` | `className="bg-[#047857] text-white"`  |
| One `accent` button per view                     | Accent on every button                 |
| Wrap inputs in `<Field>`                         | Bare `<input>` with no label           |
| `font-display` + `tabular-nums` for counts       | Body font for big jittery numbers      |
| Extend a primitive via `className`               | Fork/duplicate a component to tweak it |
| `prefers-reduced-motion` guard on confetti       | Unconditional heavy animation          |
| Pair status colour with ✓/✗/label                | Green-vs-red border as the only signal |
| Red only for errors/destructive                  | Red for "streak about to die!" FOMO    |
| Dark text on gold (AA)                           | White text on gold (fails contrast)    |

---

## 6. Maintenance

- Changing the brand = edit the scales/semantic tokens in `app/globals.css`. Nothing else.
- PWA icons follow the brand: regenerate with `node scripts/gen-icons.mjs` after a color change.
- When you add/alter a component, update `/designsystem` so the living reference stays truthful.
