import { Card } from "../components/ui/Card";
import { useAnalysisSummary } from "../hooks/useAnalysis";
import { formatCount, formatInrCompact } from "../lib/format";

// Fixed categorical order — validated palette tokens already established in
// index.css (see dataviz skill). Assigned by position, never regenerated or
// cycled; a 7th+ asset class would need folding into "Other" rather than a
// new color, though in practice mutual funds have well under 6 asset classes.
const SERIES_CLASSES = ["bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4", "bg-series-5", "bg-series-6"];

export function AnalysisPage() {
  const { data, isLoading, isError } = useAnalysisSummary();

  if (isLoading) {
    return <p className="text-sm text-ink-secondary">Loading…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-status-critical">Could not load analysis data.</p>;
  }

  const maxAllocation = Math.max(...data.assetAllocation.map((a) => Number(a.aum)), 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Analysis</h1>
        <p className="text-sm text-ink-secondary">
          Portfolio composition from current holdings — real asset-class and concentration data. Rolling returns and
          benchmark comparison still aren't possible: we only store each folio's latest balance snapshot, not a NAV
          history or benchmark index feed.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Total AUM</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatInrCompact(data.totalAum)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Valued Folios</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatCount(data.valuedFolioCount)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Active SIP Value</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatInrCompact(data.activeSipMonthlyValue)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Unclassified AUM</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatInrCompact(data.unclassifiedAum)}</p>
        </div>
      </div>

      <Card title="Asset Allocation">
        {data.assetAllocation.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No asset-class data yet — this comes from the transaction report's SCHEME_TYP/AssetType field, populated
            as new transactions are ingested.
          </p>
        ) : (
          <div className="space-y-3">
            {data.assetAllocation.map((a, i) => (
              <div key={a.assetClass}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-ink">{a.assetClass}</span>
                  <span className="tabular-nums text-ink-secondary">
                    {formatInrCompact(a.aum)} · {a.percentOfTotal}% · {a.folioCount} folios
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--gridline)]">
                  <div
                    className={`h-full rounded-full ${SERIES_CLASSES[i % SERIES_CLASSES.length]}`}
                    style={{ width: `${(Number(a.aum) / maxAllocation) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Top 10 Holdings by Concentration">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-secondary">
              <th className="py-1.5 pr-4 font-medium">Client</th>
              <th className="py-1.5 pr-4 font-medium">Scheme</th>
              <th className="py-1.5 pr-4 text-right font-medium">Value</th>
              <th className="py-1.5 text-right font-medium">% of Total AUM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {data.topConcentration.map((c, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-4 text-ink">{c.clientName}</td>
                <td className="py-1.5 pr-4 text-ink-secondary">{c.schemeName}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{formatInrCompact(c.aum)}</td>
                <td className="py-1.5 text-right tabular-nums text-ink-secondary">{c.percentOfTotal}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
