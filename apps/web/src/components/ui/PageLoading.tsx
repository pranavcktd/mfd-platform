/** A page-level loading placeholder — a few pulsing skeleton bars instead of a bare "Loading…" string, so a slow connection reads as "working" rather than "did this break". */
export function PageLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-lg border border-[var(--border)] bg-surface p-4">
            <div className="h-3 w-2/3 rounded bg-[var(--gridline)]" />
            <div className="mt-3 h-5 w-1/2 rounded bg-[var(--gridline)]" />
          </div>
        ))}
      </div>
      <div className="animate-pulse space-y-2 rounded-lg border border-[var(--border)] bg-surface p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-4 rounded bg-[var(--gridline)]" style={{ width: `${85 - i * 15}%` }} />
        ))}
      </div>
    </div>
  );
}
