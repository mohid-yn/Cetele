import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * The card surface. `padding` is a named ladder rather than a free choice —
 * the same treatment had been hand-written at p-3/p-4/p-5/p-6 across eleven
 * call sites, which is how a design system stops looking designed.
 *
 * Exported as `cardVariants` too, so elements that can't be a <div> (a card
 * that is really a link) get the identical surface — the same arrangement
 * `buttonVariants` already has.
 */
const cardVariants = cva(
  "rounded-2xl border border-border bg-card text-card-foreground shadow-sm",
  {
    variants: {
      padding: {
        /** Callers that own their own padding (e.g. Card + CardHeader). */
        none: "",
        /** A dense row: avatar/ring + label. */
        compact: "p-4",
        /** The default content card. */
        md: "p-6",
        /** Emphasis — a card that carries a screen. */
        lg: "p-8",
      },
    },
    defaultVariants: { padding: "none" },
  },
);

interface CardProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

function Card({ className, padding, ...props }: CardProps) {
  return (
    <div className={cn(cardVariants({ padding }), className)} {...props} />
  );
}

function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />
  );
}

function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-display text-lg leading-tight font-semibold tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-3 p-6 pt-0", className)}
      {...props}
    />
  );
}

export {
  Card,
  cardVariants,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
};
export type { CardProps };
