import { useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, Users, UserX, Repeat, TrendingUp, TrendingDown, Newspaper, ExternalLink, LayoutDashboard, Activity, CalendarClock, Mail, LineChart, HelpCircle, X, Download, FileSpreadsheet } from "lucide-react";
import { StatTile } from "../components/ui/StatTile";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { ArnFilter } from "../components/ui/ArnFilter";
import { Amount } from "../components/ui/Amount";
import { Pager } from "../components/ui/Pager";
import {
  useArnProfiles,
  useDashboardSummary,
  useRecentClients,
  useAumChange,
  useUnclassifiedFolios,
  type AumChange,
  type LastRtaImport,
  type NavStatus,
} from "../hooks/useDashboard";
import { useSipBreakdown } from "../hooks/useReports";
import { useMarketSnapshot, type MarketQuote } from "../hooks/useMarketData";
import { formatCount, formatDate, formatDateTime, formatInrCompact, formatInrExact } from "../lib/format";
import { downloadCsv, downloadXlsx } from "../lib/export";
import { mockNotices } from "../lib/mock-dashboard-data";
import { FREQUENCY_LABELS } from "../lib/sip-frequency-labels";

/**
 * Frequency-wise breakdown of active SIP/STP registrations, with a genuine
 * monthly-equivalent figure alongside the raw per-frequency sum — the old
 * "Active SIP Value" tile above just sums every active registration's
 * amount regardless of cadence, so a quarterly SIP's full installment gets
 * counted as if it were monthly. Also flags the real current limitation:
 * WBR49/MFSD243 registrations aren't distinguished as SIP vs STP in the
 * data captured so far, so this covers both together.
 */
function SipBreakdownCard({ arnIds }: { arnIds: string[] }) {
  const { data, isLoading } = useSipBreakdown(arnIds);
  return (
    <Card title="Active SIP/STP Registrations — Frequency Breakdown">
      <p className="mb-2 text-xs text-ink-muted">
        "Monthly Equivalent" normalizes every frequency onto a comparable monthly basis (a quarterly SIP's amount ÷3,
        weekly ×4.33, etc) — the raw total just adds every active registration's installment amount regardless of
        how often it actually recurs. Note: SIP and STP registrations aren't currently distinguished in the data
        captured from WBR49/MFSD243, so this covers both together.
      </p>
      {isLoading && <p className="py-4 text-center text-sm text-ink-muted">Loading…</p>}
      {!isLoading && data && (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-secondary">
                <th className="py-1.5 pr-4 font-medium">Frequency</th>
                <th className="py-1.5 pr-4 text-right font-medium">Count</th>
                <th className="py-1.5 pr-4 text-right font-medium">Raw Total</th>
                <th className="py-1.5 text-right font-medium">Monthly Equivalent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gridline)]">
              {data.byFrequency.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-ink-muted">No active SIP/STP registrations.</td></tr>
              )}
              {data.byFrequency.map((b) => (
                <tr key={b.frequency}>
                  <td className="py-1.5 pr-4 text-ink">{FREQUENCY_LABELS[b.frequency] ?? b.frequency}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{formatCount(b.count)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary"><Amount value={b.totalAmount} /></td>
                  <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={b.monthlyEquivalent} /></td>
                </tr>
              ))}
            </tbody>
            {data.byFrequency.length > 0 && (
              <tfoot>
                <tr className="border-t border-[var(--border)] font-medium">
                  <td className="py-1.5 pr-4 text-ink">Overall</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{formatCount(data.totalCount)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={data.totalRawAmount} /></td>
                  <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={data.totalMonthlyEquivalent} /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </>
      )}
    </Card>
  );
}

/** Small "last synced" status strip — the RTA mail-import side (one entry per RTA type, since CAMS/KFintech run independently) and the (platform-wide) NAV-sync side. */
function SyncStatusBar({ lastRtaImports, navStatus }: { lastRtaImports: LastRtaImport[]; navStatus: NavStatus }) {
  return (
    <div className="flex flex-wrap gap-4 rounded-lg border border-[var(--border)] bg-surface px-4 py-2.5 text-xs text-ink-secondary">
      {lastRtaImports.length === 0 && (
        <span className="inline-flex items-center gap-1.5">
          <Mail size={13} className="text-ink-muted" />
          No RTA data imported yet.
        </span>
      )}
      {lastRtaImports.map((imp) => (
        <span key={imp.rtaType} className="inline-flex items-center gap-1.5">
          <Mail size={13} className="text-ink-muted" />
          <span className="font-medium text-ink">{imp.rtaType}</span>{" "}
          {imp.importedAt ? (
            <>last imported at <span className="font-medium text-ink">{formatDateTime(imp.importedAt)}</span></>
          ) : (
            <span className="text-status-critical">seen, but never successfully imported</span>
          )}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <LineChart size={13} className="text-ink-muted" />
        {navStatus.valueDate ? (
          <>
            NAV value date: <span className="font-medium text-ink">{formatDate(navStatus.valueDate)}</span>
            {navStatus.syncedAt && <> · synced at <span className="font-medium text-ink">{formatDateTime(navStatus.syncedAt)}</span></>}
          </>
        ) : (
          "NAV not synced yet."
        )}
      </span>
    </div>
  );
}

/** "+₹1.2 L" / "-₹1.2 L" style — sign goes before the ₹ symbol, unlike formatInrCompact's own negative-number formatting. */
function formatSignedInrCompact(amount: string): string {
  const n = Number(amount);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${formatInrCompact(Math.abs(n))}`;
}

function AumChangeTile({ label, change, icon }: { label: string; change: AumChange; icon: typeof Wallet }) {
  if (change.amount === null) {
    return (
      <StatTile label={label} value="N/A" subValue="Not enough NAV history yet" icon={icon} accent="series-4" />
    );
  }
  const positive = Number(change.amount) >= 0;
  const pctText = change.percent !== null ? `${positive ? "+" : ""}${change.percent}%` : "";
  const asOfText = change.asOfDate ? ` vs ${formatDate(change.asOfDate)}` : "";
  return (
    <StatTile
      label={label}
      value={formatSignedInrCompact(change.amount)}
      subValue={`${pctText}${asOfText}`}
      icon={positive ? TrendingUp : TrendingDown}
      accent={positive ? "series-6" : "series-4"}
      trend={positive ? "up" : "down"}
    />
  );
}

/** Bonus over the two default Day/Month cards — lets the distributor pick any look-back window to see the AUM change. */
function AumChangeFilterCard({ arnIds }: { arnIds: string[] }) {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useAumChange(days, arnIds);

  return (
    <Card title="AUM Change (Custom Range)" action={<CalendarClock size={15} className="text-ink-muted" />}>
      <label className="mb-3 flex items-center gap-2 text-xs text-ink-secondary">
        Compare current AUM to
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-xs text-ink"
        >
          <option value={1}>Yesterday</option>
          <option value={7}>7 days ago</option>
          <option value={15}>15 days ago</option>
          <option value={30}>30 days ago</option>
          <option value={90}>90 days ago</option>
          <option value={180}>6 months ago</option>
          <option value={365}>1 year ago</option>
        </select>
      </label>
      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {!isLoading && data && data.amount === null && (
        <p className="text-sm text-ink-muted">Not enough historical NAV data backfilled for this range yet.</p>
      )}
      {!isLoading && data && data.amount !== null && (
        <div>
          <p className={`text-xl font-semibold tabular-nums ${Number(data.amount) >= 0 ? "text-status-good" : "text-status-critical"}`}>
            {formatSignedInrCompact(data.amount)}
            {data.percent !== null && (
              <span className="ml-2 text-sm font-normal text-ink-secondary">
                ({Number(data.amount) >= 0 ? "+" : ""}{data.percent}%)
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {data.asOfDate ? `vs ${formatDate(data.asOfDate)}` : ""}
            {data.coveragePercent && ` · based on ${data.coveragePercent}% of live-NAV-matched AUM`}
          </p>
        </div>
      )}
    </Card>
  );
}

/** PAN/folio/scheme-wise breakdown behind the "Unclassified AUM" tile, with CSV/Excel export — fetched only once opened. */
function UnclassifiedFoliosModal({ arnIds, onClose }: { arnIds: string[]; onClose: () => void }) {
  const { data, isLoading } = useUnclassifiedFolios(arnIds, true);

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      "unclassified-aum.csv",
      ["Client", "PAN", "Folio", "AMC", "Scheme", "Value"],
      data.map((f) => [f.clientName, f.panNumber ?? "", f.folioNumber, f.amcCode, f.schemeName ?? `${f.amcCode}/${f.schemeCode}`, f.valuationAmount]),
    );
  }
  function exportXlsx() {
    if (!data) return;
    downloadXlsx(
      "unclassified-aum.xlsx",
      "Unclassified AUM",
      ["Client", "PAN", "Folio", "AMC", "Scheme", "Value"],
      data.map((f) => [f.clientName, f.panNumber ?? "", f.folioNumber, f.amcCode, f.schemeName ?? `${f.amcCode}/${f.schemeCode}`, f.valuationAmount]),
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Unclassified AUM — Detail</h2>
            <p className="text-xs text-ink-secondary">
              Folios where the RTA never reported an asset class. Already counted inside Total AUM above — this is a
              breakdown of that subset, not additional AUM.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
              <Download size={13} /> CSV
            </button>
            <button onClick={exportXlsx} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
              <FileSpreadsheet size={13} /> Excel
            </button>
            <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-5 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-secondary">
                <th className="py-1.5 pr-4 font-medium">Client</th>
                <th className="py-1.5 pr-4 font-medium">PAN</th>
                <th className="py-1.5 pr-4 font-medium">Folio</th>
                <th className="py-1.5 pr-4 font-medium">Scheme</th>
                <th className="py-1.5 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gridline)]">
              {isLoading && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
              {!isLoading && data?.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-ink-muted">Nothing unclassified — every folio has an asset class.</td></tr>
              )}
              {data?.map((f) => (
                <tr key={f.folioId}>
                  <td className="py-1.5 pr-4"><Link to={`/crm/${f.clientId}`} className="text-series-1 hover:underline">{f.clientName}</Link></td>
                  <td className="py-1.5 pr-4 text-ink-secondary">{f.panNumber ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-ink-secondary">{f.folioNumber}</td>
                  <td className="py-1.5 pr-4 text-ink-secondary">{f.schemeName ?? `${f.amcCode}/${f.schemeCode}`}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={f.valuationAmount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UnclassifiedAumTile({ value, isLoading, arnIds }: { value: string; isLoading: boolean; arnIds: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-start justify-between rounded-lg border border-[var(--border)] bg-surface p-4 text-left transition-colors hover:border-[color:var(--baseline)]"
      >
        <div>
          <p className="text-xs font-medium text-ink-secondary">Unclassified AUM</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{isLoading ? "—" : formatInrCompact(value)}</p>
          {!isLoading && <p className="mt-0.5 text-xs tabular-nums text-ink-muted">{formatInrExact(value)} · included in Total AUM · click for detail</p>}
        </div>
        <div className="rounded-md bg-series-4/10 p-2">
          <HelpCircle size={18} className="text-series-4" strokeWidth={2} />
        </div>
      </button>
      {open && <UnclassifiedFoliosModal arnIds={arnIds} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * NIFTY/SENSEX/USD-INR — general market context, not fund-specific data, so
 * deliberately NOT scoped by the ARN filter above it. Source is an
 * unofficial API (see market-data.service.ts's doc comment) — shown as a
 * quiet ticker strip, not a KPI tile, since it's context rather than a
 * number this platform is authoritative on.
 */
function MarketTickerQuote({ quote }: { quote: MarketQuote | null }) {
  if (!quote) {
    return <span className="text-ink-muted">—</span>;
  }
  const isUp = quote.change > 0.005;
  const isDown = quote.change < -0.005;
  const colorClass = isUp ? "text-status-good" : isDown ? "text-status-critical" : "text-ink-secondary";
  const arrow = isUp ? "▲" : isDown ? "▼" : "•";
  const isCurrency = quote.symbol === "USDINR=X";
  const priceText = isCurrency
    ? `₹${quote.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : quote.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="font-medium text-ink-secondary">{quote.label}</span>
      <span className="tabular-nums font-semibold text-ink">{priceText}</span>
      <span className={`tabular-nums text-xs ${colorClass}`}>
        {arrow} {quote.change >= 0 ? "+" : ""}
        {quote.change.toFixed(2)} ({quote.changePercent >= 0 ? "+" : ""}
        {quote.changePercent.toFixed(2)}%)
      </span>
    </span>
  );
}

function MarketTickerBar() {
  const { data, isLoading } = useMarketSnapshot();
  if (isLoading && !data) {
    return <div className="rounded-lg border border-[var(--border)] bg-surface px-4 py-2.5 text-sm text-ink-muted">Loading market data…</div>;
  }
  if (!data) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-[var(--border)] bg-surface px-4 py-2.5">
      <MarketTickerQuote quote={data.nifty} />
      <MarketTickerQuote quote={data.sensex} />
      <MarketTickerQuote quote={data.usdInr} />
    </div>
  );
}

export function DashboardPage() {
  const [selectedArnIds, setSelectedArnIds] = useState<string[]>([]);
  const [recentPage, setRecentPage] = useState(1);
  const { data: arnProfiles } = useArnProfiles();
  const { data, isLoading, isError } = useDashboardSummary(selectedArnIds);
  const { data: recentClients, isLoading: recentLoading } = useRecentClients(selectedArnIds, recentPage);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader icon={LayoutDashboard} accent="series-1" title="Dashboard">
          <p className="text-sm text-ink-secondary">
            {isError ? "Could not load live data." : "Live data from your onboarded RTA feeds."}
          </p>
        </PageHeader>
        {arnProfiles && (
          <ArnFilter arnProfiles={arnProfiles} selectedIds={selectedArnIds} onChange={setSelectedArnIds} />
        )}
      </div>

      <MarketTickerBar />

      {data && <SyncStatusBar lastRtaImports={data.lastRtaImports} navStatus={data.navStatus} />}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Total AUM"
          value={isLoading || !data ? "—" : formatInrCompact(data.totalAum)}
          subValue={isLoading || !data ? undefined : formatInrExact(data.totalAum)}
          icon={Wallet}
          accent="series-1"
          href="/reports"
        />
        <StatTile
          label="Live AUM (today's NAV)"
          value={isLoading || !data ? "—" : data.liveAum === null ? "N/A" : formatInrCompact(data.liveAum)}
          subValue={isLoading || !data || data.liveAum === null ? undefined : formatInrExact(data.liveAum)}
          icon={Activity}
          accent="series-6"
          href="/reports"
        />
        <UnclassifiedAumTile value={data?.unclassifiedAum ?? "0"} isLoading={isLoading || !data} arnIds={selectedArnIds} />
        {isLoading || !data ? (
          <StatTile label="Day Change (AUM)" value="—" icon={TrendingUp} accent="series-6" />
        ) : (
          <AumChangeTile label="Day Change (AUM)" change={data.dayChangeAum} icon={TrendingUp} />
        )}
        {isLoading || !data ? (
          <StatTile label="Month Change (AUM)" value="—" icon={TrendingUp} accent="series-6" />
        ) : (
          <AumChangeTile label="Month Change (AUM)" change={data.monthChangeAum} icon={TrendingUp} />
        )}
        <StatTile
          label="Total Clients"
          value={isLoading || !data ? "—" : formatCount(data.totalClients)}
          icon={Users}
          accent="series-2"
          href="/crm"
        />
        <StatTile
          label="Non-PAN Clients"
          value={isLoading || !data ? "—" : formatCount(data.nonPanClients)}
          icon={UserX}
          accent="series-4"
          href="/mis"
        />
        <StatTile
          label="Active SIP Value"
          value={isLoading || !data ? "—" : formatInrCompact(data.monthlySipValue)}
          subValue={isLoading || !data ? undefined : formatInrExact(data.monthlySipValue)}
          icon={TrendingUp}
          accent="series-5"
          href="/reports"
        />
        <StatTile
          label="Active SIPs"
          value={isLoading || !data ? "—" : formatCount(data.activeSips)}
          icon={Repeat}
          accent="series-1"
          href="/reports"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Top AMCs by AUM">
            <ul className="divide-y divide-[var(--gridline)]">
              {data?.topAmcs.length ? (
                data.topAmcs.map((amc) => (
                  <li key={amc.amcCode} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-ink">{amc.amcName}</span>
                    <Amount value={amc.aum} className="tabular-nums text-ink-secondary" />
                  </li>
                ))
              ) : (
                <li className="py-2 text-sm text-ink-muted">{isLoading ? "Loading…" : "No data yet."}</li>
              )}
            </ul>
          </Card>

          <Card title="Top Clients by AUM">
            <ul className="divide-y divide-[var(--gridline)]">
              {data?.topClients.length ? (
                data.topClients.map((client) => (
                  <li key={client.name} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-ink">{client.name}</span>
                    <Amount value={client.aum} className="tabular-nums text-ink-secondary" />
                  </li>
                ))
              ) : (
                <li className="py-2 text-sm text-ink-muted">{isLoading ? "Loading…" : "No data yet."}</li>
              )}
            </ul>
          </Card>

          <SipBreakdownCard arnIds={selectedArnIds} />

          <Card title="Newly Added Clients">
            <p className="mb-2 text-xs text-ink-muted">Sorted by onboarding date, newest first — which ARN(s) each client's folios belong to.</p>
            <ul className="divide-y divide-[var(--gridline)]">
              {recentLoading && <li className="py-2 text-sm text-ink-muted">Loading…</li>}
              {recentClients?.clients.length === 0 && <li className="py-2 text-sm text-ink-muted">No data yet.</li>}
              {recentClients?.clients.map((client) => (
                <li key={client.id} className="flex items-center justify-between py-2 text-sm">
                  <Link to={`/crm/${client.id}`} className="text-series-1 hover:underline">{client.name}</Link>
                  <span className="text-ink-secondary">
                    {client.arnNumbers.length > 0 ? client.arnNumbers.map((a) => `ARN-${a}`).join(", ") : "Not yet attributed"}
                  </span>
                  <span className="tabular-nums text-ink-muted">{formatDate(client.createdAt)}</span>
                </li>
              ))}
            </ul>
            {recentClients && <Pager page={recentPage} setPage={setRecentPage} total={recentClients.total} pageSize={recentClients.pageSize} />}
          </Card>
        </div>

        <div className="space-y-4">
          <AumChangeFilterCard arnIds={selectedArnIds} />

          <Card
            title="Notices & Market Buzz"
            action={<Newspaper size={15} className="text-ink-muted" />}
          >
            <ul className="space-y-3">
              {mockNotices.map((notice) => (
                <li key={notice.title} className="text-sm">
                  <p className="text-ink">{notice.title}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{notice.date}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Quick Links">
            <ul className="space-y-2">
              {["Add New Client", "Upload Other Assets", "Financial Calculators", "Scheduler"].map((link) => (
                <li key={link}>
                  <a href="#" className="flex items-center gap-1.5 text-sm text-series-1 hover:underline">
                    {link}
                    <ExternalLink size={12} />
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
