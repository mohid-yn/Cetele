import { Screen, Skeleton } from "@/components/ui";

/** Instant shell for /today while the server reads rings + streak + circle. */
export default function TodayLoading() {
  return (
    <Screen>
      {/* Header: greeting + streak chip */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>

      {/* Day strip */}
      <div className="flex gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-12 flex-1 rounded-xl" />
        ))}
      </div>

      {/* Primary CTA */}
      <Skeleton className="h-11 w-full rounded-xl" />

      {/* Rings */}
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3"
            >
              <Skeleton className="size-[60px] shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  );
}
