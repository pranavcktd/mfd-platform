export interface LineSeriesChartSeries {
  id: string;
  label: string;
  /** CSS custom-property name, e.g. "--series-1" — resolved via var() so it tracks the app's light/dark palette automatically. */
  colorVar: string;
  values: number[];
}

/**
 * Hand-rolled SVG multi-series line chart — this app has no charting
 * library dependency (see AnalysisPage's stacked-bar chart, built the same
 * way), so this follows the same convention rather than introducing one.
 * Axis labels are drawn as SVG <text> in the same coordinate space as the
 * data points so they can never drift out of alignment with them.
 */
export function LineSeriesChart({
  labels,
  series,
  height = 160,
  formatValue = (v: number) => String(v),
  onPointClick,
}: {
  labels: string[];
  series: LineSeriesChartSeries[];
  height?: number;
  formatValue?: (v: number) => string;
  onPointClick?: (index: number, seriesId: string) => void;
}) {
  const width = Math.max(labels.length * 56, 280);
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const stepX = labels.length > 1 ? width / (labels.length - 1) : width / 2;
  const padTop = 8;
  const padBottom = 16;
  const plotHeight = height - padTop - padBottom;

  function y(v: number) {
    return padTop + plotHeight - (v / max) * plotHeight;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-ink-secondary">
        {series.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: `var(${s.colorVar})` }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
        <line
          x1={0}
          y1={padTop + plotHeight}
          x2={width}
          y2={padTop + plotHeight}
          stroke="var(--gridline)"
          strokeWidth={1}
        />
        {series.map((s) => (
          <polyline
            key={s.id}
            points={s.values.map((v, i) => `${i * stepX},${y(v)}`).join(" ")}
            fill="none"
            stroke={`var(${s.colorVar})`}
            strokeWidth={2}
          />
        ))}
        {series.flatMap((s) =>
          s.values.map((v, i) => (
            <circle
              key={`${s.id}-${i}`}
              cx={i * stepX}
              cy={y(v)}
              r={3.5}
              fill={`var(${s.colorVar})`}
              style={onPointClick ? { cursor: "pointer" } : undefined}
              onClick={onPointClick ? () => onPointClick(i, s.id) : undefined}
            >
              <title>{`${s.label} · ${labels[i]}: ${formatValue(v)}`}</title>
            </circle>
          )),
        )}
        {labels.map((l, i) => (
          <text key={l} x={i * stepX} y={height - 2} fontSize={9} textAnchor="middle" fill="var(--text-muted)">
            {l}
          </text>
        ))}
      </svg>
    </div>
  );
}
