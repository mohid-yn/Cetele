import { Screen, Skeleton } from "@/components/ui";

/** Instant shell for /events. */
export default function EventsLoading() {
  return (
    <Screen>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
          >
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </Screen>
  );
}
