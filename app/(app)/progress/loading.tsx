import { Skeleton } from "@/components/ui";

/** Instant shell for /progress while the server reads streak + the 14-day grid. */
export default function ProgressLoading() {
  return (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Streak hero */}
      <div className="flex items-center gap-4 rounded-2xl bg-primary p-5">
        <Skeleton className="size-16 shrink-0 rounded-full bg-primary-foreground/20" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-12 bg-primary-foreground/20" />
          <Skeleton className="h-3.5 w-20 bg-primary-foreground/20" />
        </div>
      </div>

      {/* Never miss twice */}
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>

      {/* 14-day grid card */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <Skeleton className="h-4 w-44" />
        <div className="mt-4 flex flex-col gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
