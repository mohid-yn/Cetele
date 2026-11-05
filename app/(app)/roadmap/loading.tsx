import { Screen, Skeleton } from "@/components/ui";

/** Instant shell for /roadmap while the server resolves the group + timezone. */
export default function RoadmapLoading() {
  return (
    <Screen>
      {/* Header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Progress hero */}
      <div className="flex items-center gap-4 rounded-2xl bg-primary p-5">
        <Skeleton className="size-16 shrink-0 rounded-full bg-primary-foreground/20" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-16 bg-primary-foreground/20" />
          <Skeleton className="h-3.5 w-28 bg-primary-foreground/20" />
        </div>
      </div>

      {/* Reward ladder */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-2 w-full" />
        <div className="mt-5 flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Item list */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="size-10 shrink-0 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="mt-4 h-1.5 w-full" />
          </div>
        ))}
      </div>
    </Screen>
  );
}
