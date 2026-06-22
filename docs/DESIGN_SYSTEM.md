# Cetele Design System

Branded to **Youth Nexus** — navy `#1D3A5F` + orange `#F26522`.
Live reference: **`/designsystem`** · Tokens: **`app/globals.css`** · Components: **`components/ui/`**.

---

## 1. Principles

1. **Tokens over hard-codes.** Never write a raw hex or px color in a component. Use a token (`bg-primary`, `text-muted-foreground`, `border-border`). One re-theme = one edit.
2. **Semantic before scale.** Prefer `bg-primary` / `text-foreground` over `bg-primary-700`. Reach for a scale step (`bg-accent-100`) only for tints/states the semantic layer doesn't cover.
3. **Accent is precious.** Orange = the single most important action or live progress on a screen. Navy is the workhorse. If everything is accent, nothing is.
4. **Mobile-first.** Design for the phone, enhance up. Tap targets ≥ 44px (our `md`/`icon` buttons are 44px).
5. **Accessible by default.** Visible focus ring, labelled controls, **AA contrast (≥ 4.5:1)**, `aria-*` on stateful components.
6. **Never colour alone.** ~6–8% of men can't separate green/amber/orange/red. Every status colour ships with a **glyph or text label** (✓ ✗ ⚠ / "Complete" / "At risk"); never green-vs-red as the only differentiator.
7. **Motion serves, never decorates.** 150–300ms micro-interactions, ≤500ms transitions, `--ease-spring` only for earned celebration; everything no-ops under `prefers-reduced-motion`.
6. **Composition over configuration.** Small primitives that compose (Card + Stat + Button) beat one mega-component with 20 props.

---

## 2. Design tokens

All tokens live in `app/globals.css`. Tailwind 4 generates utilities from them.

### Color
| Layer | Tokens | Use |
|---|---|---|
| **Scales** | `primary-{50–950}`, `accent-{50–950}`, `neutral-{0–950}`, `success/warning/danger/info-{500,600}` | tints, borders, state backgrounds |
| **Semantic** (theme-aware) | `background`, `foreground`, `card`, `card-foreground`, `muted`, `muted-foreground`, `border`, `input`, `ring`, `primary(-foreground)`, `accent(-foreground)`, `success/warning/danger/info(-foreground)` | everything in components |

- Generates `bg-*`, `text-*`, `border-*`, `ring-*`, `fill-*`, etc.
- `--ring` is **orange** — focus is always high-visibility and on-brand.
- Dark mode is automatic via `prefers-color-scheme`; only semantic tokens flip.

#### Colour psychology & meaning (why these colours)
Research-backed (see Youth Nexus / arabic-app UI research): **cool hues calm and
focus; warm hues arouse; red alarms.** Map meaning once and never reassign it:

| Colour | Role | Why |
|---|---|---|
| **Navy** `primary` | Trust, focus, structure — chrome, default buttons, headings, the surface | Blue family lowers stress, improves attention & the calm "flow" the app wants |
| **Orange** `accent` | The **one** primary action per view + live progress + celebration | Warm = arousal/energy "without red's alarm"; spend it at moments so it stays meaningful |
| **Green** `success` | Complete / on track | Growth, completion — always paired with a ✓ glyph (never colour-alone) |
| **Amber** `warning` | At risk / needs attention | Caution without alarm — paired with text |
| **Red** `danger` | Errors & destructive actions **only** | Red = "this is wrong/destructive", never urgency or FOMO marketing |

- **Calm surface:** `--background` is a soft cool off-white (not pure white) to cut glare and cognitive load. Cards are white for gentle depth.
- **Contrast is non-negotiable (WCAG AA ≥ 4.5:1).** That's why `accent-foreground` is **navy, not white** — white-on-orange is only ~3.1:1 (fails); navy-on-orange is ~5.0:1 and mirrors the logo.
- **One accent per view, ≤ ~3 hues per view.** If everything is coloured, nothing stands out and retention drops.

### Typography
- `font-sans` → **Geist** (body, UI). `font-display` → **Quicksand** (headings, numbers, brand).
- Scale: `text-xs` `sm` `base` `lg` `xl` `2xl` `3xl` `4xl`. Weights 400/500/600/700.
- Headings & big numbers use `font-display`. Use `tabular-nums` for counts/streaks so digits don't jitter.

### Spacing
- 4px base (Tailwind scale). Stick to `1 2 3 4 6 8 12 16`. Inside cards use `p-6`; stack gaps `gap-1.5`–`gap-6`.

### Radii
`rounded-sm`(6) `md`(8) `lg`(12) `xl`(16) `2xl`(24) `3xl`(32) `full`. Buttons `lg`, cards `2xl`, pills/badges/avatars `full`.

### Elevation
`shadow-xs sm md lg xl` — soft, navy-tinted. Cards `sm`; menus/popovers `md`–`lg`; modals `xl`.

### Motion
`--duration-fast|base|slow` (150/220/360ms), `--ease-brand`. Respect `prefers-reduced-motion` for celebratory effects.

---

## 3. Components (`components/ui/`)

Import from the barrel: `import { Button, Card, ProgressRing } from "@/components/ui";`

| Component | Key props | Notes |
|---|---|---|
| `Button` | `variant` (primary·accent·outline·subtle·ghost·link·destructive), `size` (sm·md·lg·icon), `loading`, `leadingIcon`, `trailingIcon` | One accent per view |
| `Card` + `CardHeader/Title/Description/Content/Footer` | — | Default surface |
| `Badge` | `variant`, `size` | Roles, status, counts |
| `Input`, `Label`, `Field` | `Field`: `label`, `htmlFor`, `hint`, `error`, `required` | Always wrap inputs in `Field` |
| `Avatar` | `name` (required, for initials+alt), `src`, `size` | Falls back to initials on error |
| `ProgressRing` | `value`, `max`, `size`, `thickness`, `progressColor` | Signature dhikr ring; turns green at 100% |
| `Stat` | `label`, `value`, `icon`, `hint` | Streaks, totals, ranks |
| `Spinner` | — | Inherits `currentColor` |

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
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof thingVariants> {}

export function Thing({ className, variant, ...props }: ThingProps) {
  return <div className={cn(thingVariants({ variant }), className)} {...props} />;
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

| ✅ Do | ❌ Don't |
|---|---|
| `className="bg-primary text-primary-foreground"` | `className="bg-[#1d3a5f] text-white"` |
| One `accent` button per view | Accent on every button |
| Wrap inputs in `<Field>` | Bare `<input>` with no label |
| `font-display` + `tabular-nums` for counts | Body font for big jittery numbers |
| Extend a primitive via `className` | Fork/duplicate a component to tweak it |
| `prefers-reduced-motion` guard on confetti | Unconditional heavy animation |
| Pair status colour with ✓/✗/label | Green-vs-red border as the only signal |
| Red only for errors/destructive | Red for "streak about to die!" FOMO |
| Navy text on orange (AA) | White text on orange (fails contrast) |

---

## 6. Maintenance

- Changing the brand = edit the scales/semantic tokens in `app/globals.css`. Nothing else.
- PWA icons follow the brand: regenerate with `python3 scripts/gen_icons.py` after a color change.
- When you add/alter a component, update `/designsystem` so the living reference stays truthful.
