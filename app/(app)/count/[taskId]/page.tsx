"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { useCelebration } from "@/components/demo/celebration";
import { TapPad } from "@/components/demo/tap-pad";
import { ArrowLeftIcon } from "@/components/demo/icons";

export default function CountPage() {
  const router = useRouter();
  const { taskId } = useParams<{ taskId: string }>();
  const { state, actions } = useMock();
  const { celebrate } = useCelebration();
  const [sound, setSound] = React.useState(true);

  const me = sel.currentUser(state);
  const task = state.tasks.find((t) => t.id === taskId);
  const count = task ? sel.todayCount(state, me.id, task.id) : 0;
  const justCompleted = React.useRef(false);

  if (!task) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center text-muted-foreground">
        <div>
          <p>That task no longer exists.</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => router.push("/today")}
          >
            Back to today
          </Button>
        </div>
      </div>
    );
  }

  const remaining = Math.max(0, task.targetCount - count);

  // Fire the celebration exactly once — on whichever action closes the ring.
  const celebrateIfClosed = (next: number) => {
    if (next >= task.targetCount && !justCompleted.current) {
      justCompleted.current = true;
      celebrate({ title: "Ring closed! 🎉" });
    }
  };

  // Manual taps count one at a time, uncapped (you may go past the target).
  const handleTap = () => {
    actions.increment(task.id, 1);
    celebrateIfClosed(count + 1);
  };

  // The convenience buttons snap *to* the target — never past it.
  const addCapped = (n: number) => {
    const step = Math.min(n, remaining);
    if (step <= 0) return;
    actions.increment(task.id, step);
    celebrateIfClosed(count + step);
  };

  return (
    <div className="flex flex-1 flex-col px-4 pt-4 pb-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<ArrowLeftIcon />}
          onClick={() => router.push("/today")}
        >
          Today
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSound((s) => !s)}>
          {sound ? "🔊 Sound on" : "🔇 Sound off"}
        </Button>
      </div>

      <div className="mt-2 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">
          {task.label}
        </h1>
        {task.subtitle && (
          <p className="mt-1 text-lg text-muted-foreground" dir="rtl" lang="ar">
            {task.subtitle}
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        <TapPad
          value={count}
          max={task.targetCount}
          sound={sound}
          onTap={handleTap}
        />
      </div>

      {remaining === 0 ? (
        // Ring already closed — just a way back.
        <Button
          variant="outline"
          className="w-full"
          onClick={() => router.push("/today")}
        >
          Back to today
        </Button>
      ) : (
        <div
          className={cn(
            "grid gap-2",
            // Only offer +10 when it can't overshoot the target.
            remaining > 10 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {remaining > 10 && (
            <Button variant="outline" onClick={() => addCapped(10)}>
              +10
            </Button>
          )}
          {/* One tap to finish: fill to the target, celebrate, and head back. */}
          <Button
            variant="accent"
            onClick={() => {
              addCapped(remaining);
              router.push("/today");
            }}
          >
            Mark done
          </Button>
        </div>
      )}
    </div>
  );
}
