"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import { CheckIcon } from "@/components/app/icons";
import { cn } from "@/lib/utils";

/**
 * Read-only field with a copy button. `wrap` shows the whole value, for when
 * someone has to be able to check it. Otherwise a long value is cut off to one line.
 */
export function CopyField({
  label,
  value,
  wrap = false,
}: {
  label: string;
  value: string;
  wrap?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code
          className={cn(
            "min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground",
            wrap ? "break-all" : "truncate",
          )}
        >
          {value}
        </code>
        <Button
          size="sm"
          variant="tonal"
          aria-label={`Copy ${label}`}
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? (
            <>
              <CheckIcon className="size-4" /> Copied
            </>
          ) : (
            "Copy"
          )}
        </Button>
      </div>
    </div>
  );
}
