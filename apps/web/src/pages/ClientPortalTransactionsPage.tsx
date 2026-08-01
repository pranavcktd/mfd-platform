import { Card } from "../components/ui/Card";
import { Amount } from "../components/ui/Amount";
import { useClientPortalMe } from "../hooks/useClientPortal";
import { formatDate } from "../lib/format";

export function ClientPortalTransactionsPage() {
  const { data, isLoading, isError } = useClientPortalMe();

  if (isLoading) {
    return <p className="text-sm text-ink-secondary">Loading…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-status-critical">Could not load your transactions.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Recent Transactions</h1>
        <p className="text-sm text-ink-secondary">Your last 20 transactions across all folios.</p>
      </div>

      <Card title="Transactions">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-secondary">
              <th className="py-1.5 pr-4 font-medium">Scheme</th>
              <th className="py-1.5 pr-4 font-medium">Folio</th>
              <th className="py-1.5 pr-4 font-medium">Type</th>
              <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
              <th className="py-1.5 pr-4 text-right font-medium">Units</th>
              <th className="py-1.5 text-right font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {data.recentTransactions.length === 0 && (
              <tr><td colSpan={6} className="py-4 text-center text-ink-muted">No transactions yet.</td></tr>
            )}
            {data.recentTransactions.map((t) => (
              <tr key={t.id}>
                <td className="py-1.5 pr-4 text-ink-secondary">{t.schemeName ?? "—"}</td>
                <td className="py-1.5 pr-4 text-ink-secondary">{t.folioNumber}</td>
                <td className="py-1.5 pr-4 text-ink">
                  {t.transactionDescription ?? t.transactionType}
                  {t.isRejection && (
                    <span className="ml-2 rounded bg-status-critical/15 px-1.5 py-0.5 text-[10px] font-medium text-status-critical">
                      Reverted / Failed
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink">
                  <Amount value={t.amount} />
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{t.units ?? "—"}</td>
                <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatDate(t.transactionDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
