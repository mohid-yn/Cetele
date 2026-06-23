"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const avatarVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 font-medium text-primary-800 select-none",
  {
    variants: {
      size: {
        sm: "size-8 text-xs",
        md: "size-10 text-sm",
        lg: "size-14 text-base",
        xl: "size-20 text-xl",
      },
    },
    defaultVariants: { size: "md" },
  },
);

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export interface AvatarProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof avatarVariants> {
  src?: string;
  /** Full name — used for the initials fallback and alt text. */
  name: string;
}

function Avatar({ className, size, src, name, ...props }: AvatarProps) {
  const [failed, setFailed] = React.useState(false);
  const showImg = src && !failed;

  return (
    <span className={cn(avatarVariants({ size }), className)} {...props}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote avatars; Image not needed here
        <img
          src={src}
          alt={name}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}

export { Avatar, avatarVariants };
