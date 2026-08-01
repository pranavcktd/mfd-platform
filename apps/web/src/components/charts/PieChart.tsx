export interface PieChartSlice {
  id: string;
  label: string;
  value: number;
  /** CSS custom-property name, e.g. "--series-1". */
  colorVar: string;
}

/**
 * Plain conic-gradient pie — no arc-path math needed, and it inherits the
 * palette's CSS custom properties automatically for light/dark/print. A
 * legend with a swatch + label + value is always rendered (never
 * color-alone identity), per this app's established dataviz convention.
 */
export function PieChart({
  slices,
  size = 160,
  formatValue = (v: number) => String(v),
}: {
  slices: PieChartSlice[];
  size?: number;
  formatValue?: (v: number) => string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  let cumulative = 0;
  const stops =
    total > 0
      ? slices
          .map((s) => {
            const start = (cumulative / total) * 360;
            cumulative += s.value;
            const end = (cumulative / total) * 360;
            return `var(${s.colorVar}) ${start}deg ${end}deg`;
          })
          .join(", ")
      : null;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        className="shrink-0 rounded-full"
        style={{ width: size, height: size, background: stops ? `conic-gradient(${stops})` : "var(--gridline)" }}
        role="img"
        aria-label="Pie chart"
      />
      <div className="space-y-1.5 text-xs">
        {slices.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 text-ink-secondary">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: `var(${s.colorVar})` }} />
            <span className="text-ink">{s.label}</span>
            <span className="tabular-nums">
              {total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : "0%"} · {formatValue(s.value)}
            </span>
          </div>
        ))}
        {total === 0 && <p className="text-ink-muted">No data for this period.</p>}
      </div>
    </div>
  );
}
