import { Screen, Skeleton } from "@/components/ui";

/** Instant shell for /group while the server reads the circle's fortnight. */
export default function GroupLoading() {
  return (
    <Screen>
      {/* Header: group name + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      {/* Segmented control */}
      <Skeleton className="h-10 w-full rounded-xl" />

      {/* Collective hero */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="mt-2 h-9 w-20" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>

      {/* Collective progress bars */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-2.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </Screen>
  );
}
