"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui";
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

  const handleTap = () => {
    const next = count + 1;
    actions.increment(task.id, 1);
    // Fire the celebration exactly once, on the tap that closes the ring.
    if (next >= task.targetCount && !justCompleted.current) {
      justCompleted.current = true;
      celebrate({ title: "Ring closed! 🎉" });
    }
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

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => {
            const next = count + 10;
            actions.increment(task.id, 10);
            if (next >= task.targetCount && !justCompleted.current) {
              justCompleted.current = true;
              celebrate({ title: "Ring closed! 🎉" });
            }
          }}
        >
          +10
        </Button>
        <Button variant="accent" onClick={() => router.push("/today")}>
          Done
        </Button>
      </div>
    </div>
  );
}
