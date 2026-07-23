import { useState } from "react";
import { Card } from "../components/ui/Card";
import { useBrokerageSummary, useBrokerageTransactions } from "../hooks/useBrokerage";
import { formatCount, formatDate, formatInrCompact } from "../lib/format";

export function BrokeragePage() {
  const [page, setPage] = useState(1);
  const { data: summary, isLoading: summaryLoading } = useBrokerageSummary();
  const { data: txns, isLoading: txnsLoading } = useBrokerageTransactions(page);

  const totalPages = txns ? Math.max(1, Math.ceil(txns.total / txns.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Brokerage</h1>
        <p className="text-sm text-ink-secondary">
          Real commission data from CAMS's transaction report (BROKPERC/BROKCOMM). KFintech's report layout has the
          same columns but they were blank in the data ingested so far — so KFintech transactions won't show a
          brokerage amount here; that's a gap in the source data, not this report.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Total Brokerage Earned</p>
          <p className="mt-1 text-xl font-semibold text-ink">
            {summaryLoading || !summary ? "—" : formatInrCompact(summary.totalBrokerage)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Transactions With Brokerage</p>
          <p className="mt-1 text-xl font-semibold text-ink">
            {summaryLoading || !summary ? "—" : formatCount(summary.transactionsWithBrokerage)}
          </p>
        </div>
      </div>

      <Card title="Brokerage by AMC">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-secondary">
              <th className="py-1.5 font-medium">AMC Code</th>
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
              <tr key={r.amcCode}>
                <td className="py-1.5 text-ink">{r.amcCode}</td>
                <td className="py-1.5 text-right tabular-nums text-ink-secondary">{r.count}</td>
                <td className="py-1.5 text-right tabular-nums text-ink">{formatInrCompact(r.total)}</td>
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
            {txns?.transactions.map((t) => (
              <tr key={t.id}>
                <td className="py-1.5 pr-4 text-ink">{t.clientName}</td>
                <td className="py-1.5 pr-4 text-ink-secondary">{t.schemeName ?? t.amcCode}</td>
                <td className="py-1.5 pr-4 text-ink-secondary">{t.transactionDescription}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink">
                  {t.amount ? formatInrCompact(t.amount) : "—"}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">
                  {t.brokeragePercent ?? "—"}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink">
                  {t.brokerageAmount ? formatInrCompact(t.brokerageAmount) : "—"}
                </td>
                <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatDate(t.transactionDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {txns && txns.total > txns.pageSize && (
          <div className="mt-3 flex items-center justify-between text-sm text-ink-secondary">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
