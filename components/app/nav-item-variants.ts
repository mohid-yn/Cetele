import { cva } from "class-variance-authority";

/**
 * The nav item's shape — ONE definition, worn by the mobile bottom bar and the
 * desktop sidebar.
 *
 * The two navs used to style their items independently, which is why they had
 * "no coordination": the sidebar already gave the active item a filled pill,
 * the bottom bar gave it a 2px hairline and a colour change, and neither had a
 * hover or pressed state you could see. An item you cannot press-test does not
 * read as a control — it reads as a label printed on the frame.
 *
 * State layers come from the **chrome** pair, not the surface pair. Both navs
 * sit on `--chrome`, and `--surface-active` is byte-identical to `--chrome` in
 * both themes, so the obvious `active:bg-surface-active` was a no-op — the
 * press did nothing at all. See the `--chrome-hover` / `--chrome-active` note
 * in globals.css.
 *
 * The active fill is the M3 container pair (`primary-container` /
 * `on-primary-container`), a real token rather than `bg-primary/10`: an alpha
 * fill over chrome lands on a different colour in each theme and cannot be
 * measured once.
 */
export const navItemVariants = cva(
  // `isolate` is load-bearing, not tidiness. The active pill is a child with
  // `-z-10` so the label paints over it without extra wrappers — but a negative
  // z-index only stays inside the item if the item is its own stacking context.
  // Without `isolate` the pill escapes and paints BEHIND the nav's own
  // `bg-chrome`, so it renders as nothing at all: the item looked active by
  // text colour, with the fill silently swallowed by its ancestor.
  "relative isolate flex items-center rounded-lg font-medium " +
    "transition-[background-color,color] duration-[var(--duration-fast)] " +
    "ease-[var(--ease-brand)] " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  {
    variants: {
      layout: {
        /** Bottom bar: icon over label, filling its grid cell. */
        stack: "flex-col justify-center gap-1 px-1 py-2 text-xs",
        /** Sidebar: icon beside label, full width. */
        row: "gap-3 px-3 py-2.5 text-sm",
      },
      active: {
        // Text only. The active FILL is a separate `motion.span` both navs
        // render with a shared `layoutId`, so the pill glides between tabs
        // instead of snapping — put the fill here too and the static
        // background would land instantly, hiding the very thing that moves.
        true: "text-on-primary-container",
        // `active:` (pressed) is the point: the rest state is quiet, but the
        // control answers the moment it is touched.
        false:
          "text-muted-foreground hover:bg-chrome-hover hover:text-foreground " +
          "active:bg-chrome-active",
      },
    },
    defaultVariants: { layout: "row", active: false },
  },
);
