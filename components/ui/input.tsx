import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        // 16px on phones, 14px from `md` up. Not cosmetic: iOS Safari
        // auto-zooms the page when you focus an input under 16px, and it never
        // zooms back out. Capping the viewport scale is the usual "fix" for
        // that, but capping scale breaks pinch-zoom for everyone (WCAG 1.4.4) —
        // so the type size is the honest fix and the cap stayed off.
        "flex h-11 w-full rounded-lg border border-input bg-background px-3.5",
        "text-base md:text-sm",
        "text-foreground placeholder:text-muted-foreground",
        "transition-[border-color,box-shadow] duration-[var(--duration-fast)]",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
        // Disabled is a TOKEN PAIR, never opacity — the same rule the Button
        // primitive states at the top of its own file, which this one had been
        // quietly breaking. `opacity-50` fades the fill, the text AND the
        // placeholder together toward whatever happens to be behind, so the
        // result depends on the surface rather than on a measured value.
        "disabled:cursor-not-allowed disabled:border-border",
        "disabled:bg-disabled-fill disabled:text-disabled-foreground",
        "disabled:placeholder:text-disabled-foreground",
        "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/30",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<"label">>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "text-sm font-medium text-foreground select-none",
        "peer-disabled:cursor-not-allowed peer-disabled:text-disabled-foreground",
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = "Label";

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Composed form field: label + control + hint/error, wired for accessibility.
 * Pass the control as children with a matching `id`.
 */
function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export { Input, Label, Field };
