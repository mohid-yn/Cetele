import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

const buttonVariants = cva(
  // base — shared by every variant
  // Disabled is a TOKEN PAIR, never opacity: `opacity-50` over a coloured fill
  // put a white label on a washed-out primary at 2.16:1 — illegible on every
  // disabled primary and destructive button. Filled variants add the fill; the
  // label and the killed shadow are shared here so ghost/link degrade correctly.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium " +
    "transition-[background-color,border-color,box-shadow,transform] duration-[var(--duration-fast)] " +
    "ease-[var(--ease-brand)] active:translate-y-px " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
    "disabled:pointer-events-none disabled:text-disabled-foreground disabled:shadow-none " +
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-[1.1em]",
  {
    variants: {
      // hover/active are the precomputed M3 state layers (8% / 12% of the `on-`
      // colour). Contrast falls toward the label on every filled variant, so a
      // new one must be checked at ACTIVE, not at rest.
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover " +
          "active:bg-primary-active disabled:bg-disabled-fill",
        accent:
          "bg-accent text-accent-foreground shadow-sm hover:bg-accent-hover " +
          "active:bg-accent-active disabled:bg-disabled-fill",
        // Transparent, not `bg-background`: a cream fill on a card reads as a
        // stray box. The boundary is --outline (>=3:1), not the decorative
        // hairline — v1's `border-border` measured 1.31:1 and failed 1.4.11.
        outline:
          "border border-outline bg-transparent text-foreground " +
          "hover:bg-surface-hover active:bg-surface-active disabled:border-border",
        // Ghost is the quiet tier, but it must still LOOK like a control the
        // moment you reach for it. The border is transparent at rest (so it
        // stays quiet beside a filled primary — a dialog's Cancel) and resolves
        // to --outline on hover/focus. Declared at rest rather than added on
        // hover so the box never changes size; `border-box` means the edge
        // costs no layout either way.
        ghost:
          "border border-transparent text-foreground hover:border-outline " +
          "hover:bg-surface-hover active:bg-surface-active",
        subtle:
          "bg-muted text-foreground hover:bg-surface-active " +
          "active:bg-chrome disabled:bg-disabled-fill",
        link: "text-primary underline-offset-4 hover:underline",
        destructive:
          "bg-danger text-danger-foreground shadow-sm hover:bg-danger-hover " +
          "active:bg-danger-active disabled:bg-disabled-fill",
        // A destructive action that is NOT the screen's main event — "Leave
        // this circle" sits in a quiet informational box, and a filled red
        // button there reads as a warning about a decision the member has not
        // made yet. Outline shell, danger label: unmistakably destructive,
        // without shouting. `destructive` stays for confirmed, primary
        // destruction (a dialog's final Delete).
        "destructive-outline":
          "border border-outline bg-transparent text-danger " +
          "hover:border-danger hover:bg-surface-hover active:bg-surface-active " +
          "disabled:border-border",
      },
      // TWO weights, each with the icon-only square that matches its PAINTED
      // height — and they must stay paired. `icon` (44) beside `sm` (36) was
      // the app's most visible size defect: an 8px step between two controls
      // in the same header row. Reach for `icon-sm` next to `sm`, `icon` next
      // to `md`.
      //
      // There was a third rung, `lg` (52px). It was used **zero** times in the
      // app — only in the /designsystem gallery — so it was not a size, it was
      // an unused option, and an unused LARGER option is "some buttons are too
      // big" waiting for the next person to reach for it. Two weights cover
      // every real context here: `sm` for dense rows and headers, `md` for
      // dialog actions and page CTAs. If a screen ever genuinely needs a
      // heavier primary action, add the rung back deliberately and USE it —
      // don't leave it lying around for someone to discover.
      size: {
        // 36px painted, 44px tappable — see `tap-area-44` in globals.css.
        sm: "h-9 px-3 text-sm tap-area-44",
        md: "h-11 px-5 text-sm",
        // `tap-area-44-box`, not `tap-area-44`: the latter only stretches the
        // element's own width, which leaves a 36px square 36px wide.
        "icon-sm": "size-9 tap-area-44-box",
        icon: "size-11",
        // For a control that sits INSIDE a sentence — "· back to today". Every
        // other size imposes a height and horizontal padding, which is why the
        // `link` variant could not actually be used inline and those controls
        // were all hand-rolled `<button>`s instead. Pair it with `link`; it
        // inherits the surrounding type size, and it is the one size that
        // deliberately does not carry a 44px target, because a word inside a
        // paragraph cannot have one without shifting the line.
        inline: "h-auto p-0 text-[length:inherit]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Show a spinner and disable interaction. */
  loading?: boolean;
  /** Icon rendered before the label. */
  leadingIcon?: React.ReactNode;
  /** Icon rendered after the label. */
  trailingIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      loading = false,
      disabled,
      leadingIcon,
      trailingIcon,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-[1.1em]" /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
