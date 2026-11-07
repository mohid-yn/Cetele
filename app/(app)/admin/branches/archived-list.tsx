import Link from "next/link";
import { BranchesIcon, ChevronRightIcon } from "@/components/app/icons";

/**
 * Archived branches (D87), kept out of the folders but one tap away, so
 * restoring one never means hunting. Collapsed by default: a native
 * <details>, which needs no client code and reads correctly to a screen reader.
 */
export function ArchivedList({
  branches,
}: {
  branches: { id: string; name: string }[];
}) {
  if (branches.length === 0) return null;
  return (
    <details className="group rounded-2xl border border-border bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium text-muted-foreground">
        Archived ({branches.length})
        <ChevronRightIcon
          aria-hidden
          className="size-4 transition-transform duration-[var(--duration-fast)] group-open:rotate-90"
        />
      </summary>
      <ul className="flex flex-col divide-y divide-border border-t border-border">
        {branches.map((b) => (
          <li key={b.id}>
            <Link
              href={`/admin/branches/${b.id}`}
              className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm text-muted-foreground hover:bg-surface-hover"
            >
              <BranchesIcon aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
              <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
