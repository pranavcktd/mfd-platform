import { useState } from "react";
import { Link } from "react-router-dom";
import { Percent } from "lucide-react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { ClientPicker } from "../components/ui/ClientPicker";
import { ArnFilter } from "../components/ui/ArnFilter";
import { Pager } from "../components/ui/Pager";
import { useBrokerageSummary, useBrokerageTransactions } from "../hooks/useBrokerage";
import { useArnProfiles } from "../hooks/useDashboard";
import { Amount } from "../components/ui/Amount";
import { formatCount, formatDate, formatInrCompact, formatInrExact } from "../lib/format";

export function BrokeragePage() {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amcCode, setAmcCode] = useState("");
  const [clientId, setClientId] = useState<string | undefined>();
  const [clientName, setClientName] = useState<string | undefined>();
  const [arnIds, setArnIds] = useState<string[]>([]);
  const { data: arnProfiles } = useArnProfiles();

  const filters = { from: from || undefined, to: to || undefined, amcCode: amcCode || undefined, clientId, arnProfileIds: arnIds };
  const { data: summary, isLoading: summaryLoading } = useBrokerageSummary(filters);
  const { data: txns, isLoading: txnsLoading } = useBrokerageTransactions(page, filters);

  function clearFilters() {
    setFrom("");
    setTo("");
    setAmcCode("");
    setClientId(undefined);
    setClientName(undefined);
    setArnIds([]);
    setPage(1);
  }

  const hasFilters = Boolean(from || to || amcCode || clientId || arnIds.length > 0);

  return (
    <div className="space-y-4">
      <PageHeader icon={Percent} accent="series-4" title="Brokerage">
        <p className="text-sm text-ink-secondary">
          Real commission data from CAMS's transaction report (BROKPERC/BROKCOMM). KFintech's report layout has the
          same columns but they were blank in the data ingested so far — so KFintech transactions won't show a
          brokerage amount here; that's a gap in the source data, not this report.
        </p>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm text-ink-secondary">
          <span>From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm text-ink"
          />
          <span>To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </div>
        <select
          value={amcCode}
          onChange={(e) => { setAmcCode(e.target.value); setPage(1); }}
          className="rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm text-ink"
        >
          <option value="">All AMCs</option>
          {summary?.byAmc.map((r) => (
            <option key={r.amcCode} value={r.amcCode}>{r.amcName}</option>
          ))}
        </select>
        <ClientPicker
          selectedClientId={clientId}
          selectedClientName={clientName}
          onSelect={(id, name) => { setClientId(id); setClientName(name); setPage(1); }}
        />
        {arnProfiles && (
          <ArnFilter arnProfiles={arnProfiles} selectedIds={arnIds} onChange={(ids) => { setArnIds(ids); setPage(1); }} />
        )}
        {hasFilters && (
          <button onClick={clearFilters} className="text-sm text-ink-secondary hover:underline">
            Clear filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Total Brokerage Earned</p>
          <p className="mt-1 text-xl font-semibold text-ink">
            {summaryLoading || !summary ? "—" : formatInrCompact(summary.totalBrokerage)}
          </p>
          {!summaryLoading && summary && (
            <p className="text-xs text-ink-muted">{formatInrExact(summary.totalBrokerage)}</p>
          )}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Transactions With Brokerage</p>
          <p className="mt-1 text-xl font-semibold text-ink">
            {summaryLoading || !summary ? "—" : formatCount(summary.transactionsWithBrokerage)}
          </p>
        </div>
      </div>

      <Card title="Brokerage by AMC">
        <p className="mb-2 text-xs text-ink-muted">Click a row to filter the transaction list below by that AMC.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-secondary">
              <th className="py-1.5 font-medium">AMC</th>
              <th className="py-1.5 text-right font-medium">Transactions</th>
              <th className="py-1.5 text-right font-medium">Brokerage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {summaryLoading && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-ink-muted">Loading…</td>
              </tr>
            )}
            {summary?.byAmc.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-ink-muted">No brokerage data yet.</td>
              </tr>
            )}
            {summary?.byAmc.map((r) => (
              <tr
                key={r.amcCode}
                onClick={() => { setAmcCode(r.amcCode); setPage(1); }}
                className="cursor-pointer hover:bg-[var(--gridline)]/30"
              >
                <td className="py-1.5 text-ink">{r.amcName}</td>
                <td className="py-1.5 text-right tabular-nums text-ink-secondary">{r.count}</td>
                <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={r.total} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Brokerage Transactions">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-secondary">
              <th className="py-1.5 pr-4 font-medium">Client</th>
              <th className="py-1.5 pr-4 font-medium">Scheme</th>
              <th className="py-1.5 pr-4 font-medium">Type</th>
              <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
              <th className="py-1.5 pr-4 text-right font-medium">Brokerage %</th>
              <th className="py-1.5 pr-4 text-right font-medium">Brokerage</th>
              <th className="py-1.5 text-right font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {txnsLoading && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-ink-muted">Loading…</td>
              </tr>
            )}
            {txns?.transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-ink-muted">No transactions match this filter.</td>
              </tr>
            )}
            {txns?.transactions.map((t) => (
              <tr key={t.id}>
                <td className="py-1.5 pr-4">
                  <Link to={`/crm/${t.clientId}`} className="text-series-1 hover:underline">
                    {t.clientName}
                  </Link>
                </td>
                <td className="py-1.5 pr-4 text-ink-secondary">{t.schemeName ?? t.amcCode}</td>
                <td className="py-1.5 pr-4 text-ink-secondary">{t.transactionDescription}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink">
                  {t.amount ? <Amount value={t.amount} /> : "—"}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">
                  {t.brokeragePercent ?? "—"}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink">
                  {t.brokerageAmount ? <Amount value={t.brokerageAmount} /> : "—"}
                </td>
                <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatDate(t.transactionDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {txns && <Pager page={page} setPage={setPage} total={txns.total} pageSize={txns.pageSize} />}
      </Card>
    </div>
  );
}
