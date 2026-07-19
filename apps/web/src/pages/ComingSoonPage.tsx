export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      <p className="max-w-sm text-sm text-ink-secondary">
        This module isn't built yet. It's reserved in the navigation to match the planned product structure.
      </p>
    </div>
  );
}
