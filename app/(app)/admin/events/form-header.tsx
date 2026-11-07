import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/app/icons";
import type { BranchOption } from "./camp-form";

/** The one-level way back to the branch an event lives in (D85). */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon aria-hidden className="size-4" />
      {label}
    </Link>
  );
}

/**
 * The title, and where it goes in plain words: "For Melbourne · reaches 5
 * circles". This line is the whole of the branch question on a form (D85).
 */
export function FormHeader({
  title,
  branch,
  action,
}: {
  title: string;
  branch: BranchOption;
  action?: ReactNode;
}) {
  return (
    <div className="-mt-2 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold wrap-anywhere text-foreground">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">
          For {branch.name} · reaches {branch.circles}{" "}
          {branch.circles === 1 ? "circle" : "circles"}
        </p>
      </div>
      {action}
    </div>
  );
}
