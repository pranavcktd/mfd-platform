import { useState } from "react";
import { Link } from "react-router-dom";
import { LineChart, BarChart3, PieChart as PieChartIcon, Maximize2, X } from "lucide-react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { ArnFilter } from "../components/ui/ArnFilter";
import { Amount } from "../components/ui/Amount";
import { PrintableModal } from "../components/ui/PrintableModal";
import { ChartTypeToggle, type ChartTypeOption } from "../components/ui/ChartTypeToggle";
import { LineSeriesChart, type LineSeriesChartSeries } from "../components/charts/LineSeriesChart";
import { PieChart } from "../components/charts/PieChart";
import {
  useAnalysisSummary,
  useMonthlyVolume,
  useMonthlyVolumeDrilldown,
  type MonthlyVolumeRow,
  type MonthlyVolumeType,
} from "../hooks/useAnalysis";
import { useArnProfiles } from "../hooks/useDashboard";
import { formatCount, formatInrCompact, formatInrExact, formatMonthYear } from "../lib/format";

// Fixed categorical order — validated palette tokens already established in
// index.css (see dataviz skill). Assigned by position, never regenerated or
// cycled; a 7th+ asset class would need folding into "Other" rather than a
// new color, though in practice mutual funds have well under 6 asset classes.
const SERIES_CLASSES = ["bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4", "bg-series-5", "bg-series-6"];

function AllocationBar({
  rows,
  linkTo,
}: {
  rows: Array<{ label: string; aum: string; count: number; percentOfTotal: string; linkParam: string }>;
  linkTo: (param: string) => string;
}) {
  const max = Math.max(...rows.map((r) => Number(r.aum)), 1);
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <Link key={r.label} to={linkTo(r.linkParam)} className="block">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-ink hover:underline">{r.label}</span>
            <span className="tabular-nums text-ink-secondary">
              {formatInrCompact(r.aum)} · {r.percentOfTotal}% · {r.count} folios
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--gridline)]">
            <div
              className={`h-full rounded-full ${SERIES_CLASSES[i % SERIES_CLASSES.length]}`}
              style={{ width: `${(Number(r.aum) / max) * 100}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

type VolumeChartType = "bar" | "line" | "pie";
const MONTH_RANGE_OPTIONS = [3, 6, 12, 24, 36] as const;
const VOLUME_CHART_OPTIONS: Array<ChartTypeOption<VolumeChartType>> = [
  { value: "bar", label: "Bar", icon: BarChart3 },
  { value: "line", label: "Line", icon: LineChart },
  { value: "pie", label: "Pie", icon: PieChartIcon },
];

function MonthlyVolumeChart({
  data,
  chartType,
  height,
  onDrilldown,
}: {
  data: MonthlyVolumeRow[];
  chartType: VolumeChartType;
  height: number;
  onDrilldown: (month: string, type: MonthlyVolumeType) => void;
}) {
  const labels = data.map((m) => formatMonthYear(m.month));

  if (chartType === "pie") {
    const totals = data.reduce(
      (acc, m) => ({
        purchase: acc.purchase + Number(m.purchaseTotal),
        redemption: acc.redemption + Number(m.redemptionTotal),
        other: acc.other + Number(m.otherTotal),
      }),
      { purchase: 0, redemption: 0, other: 0 },
    );
    return (
      <PieChart
        slices={[
          { id: "purchase", label: "Purchase", value: totals.purchase, colorVar: "--series-1" },
          { id: "redemption", label: "Redemption", value: totals.redemption, colorVar: "--series-2" },
          { id: "other", label: "Other (switches, dividends, etc.)", value: totals.other, colorVar: "--gridline" },
        ]}
        size={height}
        formatValue={formatInrCompact}
      />
    );
  }

  if (chartType === "line") {
    const series: LineSeriesChartSeries[] = [
      { id: "purchase", label: "Purchase", colorVar: "--series-1", values: data.map((m) => Number(m.purchaseTotal)) },
      { id: "redemption", label: "Redemption", colorVar: "--series-2", values: data.map((m) => Number(m.redemptionTotal)) },
      { id: "other", label: "Other", colorVar: "--gridline", values: data.map((m) => Number(m.otherTotal)) },
    ];
    return (
      <LineSeriesChart
        labels={labels}
        series={series}
        height={height}
        formatValue={formatInrCompact}
        onPointClick={(index, seriesId) => onDrilldown(data[index].month, seriesId as MonthlyVolumeType)}
      />
    );
  }

  const barAreaHeight = height - 24;
  const maxMonthlyVolume = Math.max(...data.map((m) => Number(m.total)), 1);
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((m) => {
        const purchaseH = Math.max((Number(m.purchaseTotal) / maxMonthlyVolume) * barAreaHeight, Number(m.purchaseTotal) > 0 ? 2 : 0);
        const redemptionH = Math.max((Number(m.redemptionTotal) / maxMonthlyVolume) * barAreaHeight, Number(m.redemptionTotal) > 0 ? 2 : 0);
        const otherH = Math.max((Number(m.otherTotal) / maxMonthlyVolume) * barAreaHeight, Number(m.otherTotal) > 0 ? 2 : 0);
        return (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full flex-col-reverse gap-0.5" style={{ height: barAreaHeight }}>
              <div
                className="w-full cursor-pointer rounded-b bg-series-1"
                style={{ height: `${purchaseH}px` }}
                title={`Purchase: ${formatInrExact(m.purchaseTotal)} — click for client breakdown`}
                onClick={() => onDrilldown(m.month, "purchase")}
              />
              <div
                className="w-full cursor-pointer bg-series-2"
                style={{ height: `${redemptionH}px` }}
                title={`Redemption: ${formatInrExact(m.redemptionTotal)} — click for client breakdown`}
                onClick={() => onDrilldown(m.month, "redemption")}
              />
              <div
                className="w-full cursor-pointer rounded-t bg-[var(--gridline)]"
                style={{ height: `${otherH}px` }}
                title={`Other: ${formatInrExact(m.otherTotal)} · ${m.count} transactions total — click for client breakdown`}
                onClick={() => onDrilldown(m.month, "other")}
              />
            </div>
            <span
              className="cursor-pointer text-[10px] text-ink-muted hover:text-series-1"
              onClick={() => onDrilldown(m.month, "all")}
            >
              {formatMonthYear(m.month)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function VolumeDrilldownPanel({
  month,
  type,
  arnIds,
  onClose,
}: {
  month: string;
  type: MonthlyVolumeType;
  arnIds: string[];
  onClose: () => void;
}) {
  const { data, isLoading } = useMonthlyVolumeDrilldown(month, type, arnIds);
  const typeLabel = type === "purchase" ? "Purchase" : type === "redemption" ? "Redemption" : type === "other" ? "Other" : "All";

  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] bg-page p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-ink">
            {typeLabel} — {formatMonthYear(month)}
          </h4>
          {data && (
            <p className="text-xs text-ink-secondary">
              {data.clients.length} client{data.clients.length === 1 ? "" : "s"} · {formatInrExact(data.totalAmount)} ·{" "}
              {data.totalCount} transactions
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-ink-muted hover:bg-[var(--gridline)]/30 hover:text-ink print:hidden"
          aria-label="Close client breakdown"
        >
          <X size={15} />
        </button>
      </div>
      {isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : !data || data.clients.length === 0 ? (
        <p className="text-sm text-ink-muted">No client-level transactions found for this selection.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-ink-secondary">
              <tr>
                <th className="pb-1.5 font-medium">Client</th>
                <th className="pb-1.5 text-right font-medium">Amount</th>
                <th className="pb-1.5 text-right font-medium">Transactions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gridline)]">
              {data.clients.map((c) => (
                <tr key={c.clientId}>
                  <td className="py-1.5">
                    <Link to={`/crm/${c.clientId}`} className="text-series-1 hover:underline">
                      {c.clientName}
                    </Link>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={c.amount} /></td>
                  <td className="py-1.5 text-right tabular-nums text-ink-secondary">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MonthlyVolumeCard({ arnIds }: { arnIds: string[] }) {
  const [months, setMonths] = useState<number>(12);
  const [chartType, setChartType] = useState<VolumeChartType>("bar");
  const [drilldown, setDrilldown] = useState<{ month: string; type: MonthlyVolumeType } | null>(null);
  const [fullView, setFullView] = useState(false);
  const { data, isLoading } = useMonthlyVolume(months, arnIds);

  const rangeLabel = `Last ${months} months`;

  function renderBody(height: number) {
    if (!data || data.length === 0) {
      return <p className="text-sm text-ink-muted">No transactions in the selected period.</p>;
    }
    return (
      <>
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-ink-secondary">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-series-1" />Purchase</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-series-2" />Redemption</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--gridline)]" />Other (switches, dividends, etc.)</span>
        </div>
        <MonthlyVolumeChart data={data} chartType={chartType} height={height} onDrilldown={(m, t) => setDrilldown({ month: m, type: t })} />
        <p className="mt-2 text-[11px] text-ink-muted print:hidden">
          {chartType === "pie"
            ? "Aggregate mix across the selected period — not drillable to a single month."
            : "Click a bar segment, line point, or month label to see which clients made up that value."}
        </p>
        {drilldown && (
          <VolumeDrilldownPanel month={drilldown.month} type={drilldown.type} arnIds={arnIds} onClose={() => setDrilldown(null)} />
        )}
      </>
    );
  }

  return (
    <Card title={`Monthly Transaction Volume (${rangeLabel})`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="inline-flex items-center rounded-md border border-[var(--border)] p-0.5">
          {MONTH_RANGE_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => {
                setMonths(m);
                setDrilldown(null);
              }}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                months === m ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"
              }`}
            >
              {m}m
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ChartTypeToggle value={chartType} onChange={setChartType} options={VOLUME_CHART_OPTIONS} />
          <button
            onClick={() => setFullView(true)}
            disabled={!data || data.length === 0}
            className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-ink hover:bg-[var(--gridline)]/30 disabled:opacity-40"
          >
            <Maximize2 size={13} /> Full View / Print
          </button>
        </div>
      </div>

      {isLoading ? <p className="text-sm text-ink-muted">Loading…</p> : renderBody(140)}

      {fullView && (
        <PrintableModal
          title="Monthly Transaction Volume"
          subtitle={rangeLabel}
          onClose={() => setFullView(false)}
          toolbar={<ChartTypeToggle value={chartType} onChange={setChartType} options={VOLUME_CHART_OPTIONS} />}
        >
          <div className="space-y-6">
            {renderBody(260)}
            {data && data.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">Data Metrics</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-ink-secondary">
                      <tr>
                        <th className="pb-2 font-medium">Month</th>
                        <th className="pb-2 text-right font-medium">Purchase</th>
                        <th className="pb-2 text-right font-medium">Redemption</th>
                        <th className="pb-2 text-right font-medium">Other</th>
                        <th className="pb-2 text-right font-medium">Total</th>
                        <th className="pb-2 text-right font-medium">Transactions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--gridline)]">
                      {data.map((m) => (
                        <tr key={m.month}>
                          <td className="py-1.5 text-ink">{formatMonthYear(m.month)}</td>
                          <td className="py-1.5 text-right tabular-nums text-ink-secondary"><Amount value={m.purchaseTotal} /></td>
                          <td className="py-1.5 text-right tabular-nums text-ink-secondary"><Amount value={m.redemptionTotal} /></td>
                          <td className="py-1.5 text-right tabular-nums text-ink-secondary"><Amount value={m.otherTotal} /></td>
                          <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={m.total} /></td>
                          <td className="py-1.5 text-right tabular-nums text-ink-secondary">{m.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </PrintableModal>
      )}
    </Card>
  );
}

export function AnalysisPage() {
  const [selectedArnIds, setSelectedArnIds] = useState<string[]>([]);
  const { data: arnProfiles } = useArnProfiles();
  const { data, isLoading, isError } = useAnalysisSummary(selectedArnIds);

  if (isLoading) {
    return <p className="text-sm text-ink-secondary">Loading…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-status-critical">Could not load analysis data.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader icon={LineChart} accent="series-6" title="Analysis">
          <p className="text-sm text-ink-secondary">
            Portfolio composition from current holdings — real asset-class, AMC, client, and ARN breakdowns. Rolling
            returns and benchmark comparison still aren't possible: we only store each folio's latest balance
            snapshot, not a NAV history or benchmark index feed. Click any row below to drill into its clients.
          </p>
        </PageHeader>
        {arnProfiles && <ArnFilter arnProfiles={arnProfiles} selectedIds={selectedArnIds} onChange={setSelectedArnIds} />}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Total AUM</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatInrCompact(data.totalAum)}</p>
          <p className="text-xs text-ink-muted">{formatInrExact(data.totalAum)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Valued Folios</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatCount(data.valuedFolioCount)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Active SIP Value</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatInrCompact(data.activeSipMonthlyValue)}</p>
          <p className="text-xs text-ink-muted">{formatInrExact(data.activeSipMonthlyValue)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Unclassified AUM</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatInrCompact(data.unclassifiedAum)}</p>
          <p className="text-xs text-ink-muted">{formatInrExact(data.unclassifiedAum)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Asset Allocation">
          {data.assetAllocation.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No asset-class data yet — this comes from the transaction report's SCHEME_TYP/AssetType field.
            </p>
          ) : (
            <AllocationBar
              rows={data.assetAllocation.map((a) => ({
                label: a.assetClass,
                aum: a.aum,
                count: a.folioCount,
                percentOfTotal: a.percentOfTotal,
                linkParam: a.assetClass,
              }))}
              linkTo={(assetClass) => `/crm?assetClass=${encodeURIComponent(assetClass)}`}
            />
          )}
        </Card>

        <Card title="AMC Allocation">
          {data.amcAllocation.length === 0 ? (
            <p className="text-sm text-ink-muted">No AMC data yet.</p>
          ) : (
            <AllocationBar
              rows={data.amcAllocation.map((a) => ({
                label: a.amcName,
                aum: a.aum,
                count: a.folioCount,
                percentOfTotal: a.percentOfTotal,
                linkParam: a.amcCode,
              }))}
              linkTo={(amcCode) => `/crm?amcCode=${encodeURIComponent(amcCode)}`}
            />
          )}
        </Card>
      </div>

      {data.arnSplit.length > 1 && (
        <Card title="AUM Split by ARN">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {data.arnSplit.map((arn) => (
              <div key={arn.arnProfileId ?? "unknown"} className="rounded-md border border-[var(--border)] p-3">
                <p className="text-xs text-ink-secondary">
                  ARN-{arn.arnNumber}
                  {arn.isChild ? " (child)" : " (parent)"}
                </p>
                <p className="mt-1 text-lg font-semibold text-ink">{formatInrCompact(arn.aum)}</p>
                <p className="text-[11px] text-ink-muted">{formatInrExact(arn.aum)}</p>
                <p className="text-xs text-ink-muted">{arn.percentOfTotal}% of total AUM</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <MonthlyVolumeCard arnIds={selectedArnIds} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Top 10 Clients by AUM">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-secondary">
                <th className="py-1.5 pr-4 font-medium">Client</th>
                <th className="py-1.5 pr-4 text-right font-medium">AUM</th>
                <th className="py-1.5 text-right font-medium">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gridline)]">
              {data.topClients.map((c) => (
                <tr key={c.clientId}>
                  <td className="py-1.5 pr-4">
                    <Link to={`/crm/${c.clientId}`} className="text-series-1 hover:underline">
                      {c.clientName}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={c.aum} /></td>
                  <td className="py-1.5 text-right tabular-nums text-ink-secondary">{c.percentOfTotal}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Top 10 Holdings by Concentration">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-secondary">
                <th className="py-1.5 pr-4 font-medium">Client</th>
                <th className="py-1.5 pr-4 font-medium">Scheme</th>
                <th className="py-1.5 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gridline)]">
              {data.topConcentration.map((c, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-4">
                    <Link to={`/crm/${c.clientId}`} className="text-series-1 hover:underline">
                      {c.clientName}
                    </Link>
                  </td>
                  <td className="max-w-[160px] truncate py-1.5 pr-4 text-ink-secondary" title={c.schemeName}>
                    {c.schemeName}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={c.aum} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
