export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div
        aria-hidden
        className="size-20 rounded-full border-8 border-brand"
        style={{ borderTopColor: "transparent" }}
      />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-brand">Cetele</h1>
        <p className="max-w-xs text-balance text-sm text-foreground/70">
          Track your daily dhikr together. A shared tally that makes remembrance
          a habit.
        </p>
      </div>
      <p className="text-xs text-foreground/40">Setup in progress · v1</p>
    </main>
  );
}
