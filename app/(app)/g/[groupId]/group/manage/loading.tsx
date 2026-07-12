import { Skeleton } from "@/components/ui";

/** Instant shell for /group/manage while the server reads members + tasks + invites. */
export default function ManageLoading() {
  return (
    <div className="flex flex-col gap-6 px-4 pt-4 pb-6">
      {/* Back + title */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-56" />
      </div>

      {/* Tasks + members + invites: three stacked sections of rows */}
      {Array.from({ length: 3 }).map((_, section) => (
        <div key={section} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 3 }).map((_, row) => (
            <div
              key={row}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-8 w-16 rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
