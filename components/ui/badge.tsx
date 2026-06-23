import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border font-medium [&_svg]:size-[1em]",
  {
    variants: {
      variant: {
        neutral: "border-transparent bg-muted text-muted-foreground",
        primary: "border-transparent bg-primary-100 text-primary-800",
        accent: "border-transparent bg-accent-100 text-accent-800",
        success: "border-transparent bg-success-500/15 text-success-600",
        warning: "border-transparent bg-warning-500/15 text-warning-600",
        danger: "border-transparent bg-danger-500/15 text-danger-600",
        outline: "border-border bg-transparent text-foreground",
      },
      size: {
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-xs",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
