import { Skeleton } from "@/components/ui";

/** Instant shell for /count while the server reads the task + my fortnight. */
export default function CountLoading() {
  return (
    <div className="flex flex-1 flex-col px-5 pt-5 pb-8">
      {/* Back / sound row */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>

      {/* Task title */}
      <div className="mt-2 flex flex-col items-center gap-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-5 w-32" />
      </div>

      {/* Day strip */}
      <div className="mt-3 flex gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-12 flex-1 rounded-xl" />
        ))}
      </div>

      {/* Tap pad ring */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-8">
        <Skeleton className="size-[260px] rounded-full" />
        <Skeleton className="h-4 w-28" />
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}
