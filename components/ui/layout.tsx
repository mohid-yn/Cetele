import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Layout primitives — the app's spacing rhythm, declared once.
 *
 * Why these exist: every screen used to hand-write its own page wrapper
 * (`flex flex-col gap-5 px-4 pt-5 pb-6`, repeated verbatim in a dozen files)
 * and pick its own stack gaps, which is how the codebase drifted to 58 distinct
 * spacing steps against a documented scale of eight. Rhythm chosen per call
 * site can't stay consistent, and it can't be changed centrally either.
 *
 * The gap scale here is deliberately SMALL — six steps, named, no arbitrary
 * values. New code physically cannot invent `gap-2.5`; it picks a step or it
 * makes the case for a new one.
 *
 * A note on flex, since it caused a real bug: a flex child defaults to
 * `min-height: auto` and refuses to shrink below its content, so a too-tall
 * child overflows its parent instead of adapting — and with `justify-center`
 * it overflows BOTH ends, landing on whatever sits above and below. Any
 * `Stack` that must shrink inside a constrained parent needs `min-h-0`; that
 * is what `scrollable` sets, along with the overflow it implies.
 */

const GAP = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
  xl: "gap-5",
  "2xl": "gap-6",
} as const;

export type Gap = keyof typeof GAP;

const stackVariants = cva("flex flex-col", {
  variants: {
    gap: GAP,
    align: {
      stretch: "items-stretch",
      start: "items-start",
      center: "items-center",
      end: "items-end",
    },
    /** Shrink below content and scroll, rather than overflowing the parent. */
    scrollable: { true: "min-h-0 overflow-y-auto", false: "" },
  },
  defaultVariants: { gap: "md", align: "stretch", scrollable: false },
});

export interface StackProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, "color">,
    VariantProps<typeof stackVariants> {
  asChild?: never;
}

/** Vertical rhythm. Children stack; the gap comes from the scale. */
export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  ({ className, gap, align, scrollable, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(stackVariants({ gap, align, scrollable }), className)}
      {...props}
    />
  ),
);
Stack.displayName = "Stack";

const rowVariants = cva("flex", {
  variants: {
    gap: GAP,
    align: {
      center: "items-center",
      start: "items-start",
      end: "items-end",
      baseline: "items-baseline",
      stretch: "items-stretch",
    },
    justify: {
      start: "justify-start",
      between: "justify-between",
      center: "justify-center",
      end: "justify-end",
    },
    /** Let the row wrap instead of overflowing a narrow container. */
    wrap: { true: "flex-wrap", false: "" },
  },
  defaultVariants: {
    gap: "sm",
    align: "center",
    justify: "start",
    wrap: false,
  },
});

export interface RowProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, "color">,
    VariantProps<typeof rowVariants> {}

/** Horizontal cluster — icon + label, a header's actions, a chip group. */
export const Row = React.forwardRef<HTMLDivElement, RowProps>(
  ({ className, gap, align, justify, wrap, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(rowVariants({ gap, align, justify, wrap }), className)}
      {...props}
    />
  ),
);
Row.displayName = "Row";

/**
 * The page wrapper every in-app screen sits in: one column, one rhythm, one
 * set of edge paddings. Screens describe their content; the frame owns the
 * spacing, so changing the app's page rhythm is a one-line change here rather
 * than a sweep through seventeen routes.
 */
export const Screen = React.forwardRef<
  HTMLDivElement,
  StackProps & { padded?: boolean }
>(({ className, gap = "xl", padded = true, ...props }, ref) => (
  <Stack
    ref={ref}
    gap={gap}
    className={cn("flex-1", padded && "px-4 pt-5 pb-6", className)}
    {...props}
  />
));
Screen.displayName = "Screen";
