import { useState } from "react";
import { Card } from "../components/ui/Card";
import { Amount } from "../components/ui/Amount";
import { Pager } from "../components/ui/Pager";
import { SearchBox } from "../components/ui/SearchBox";
import { useClientPortalTransactions } from "../hooks/useClientPortal";
import { formatDate } from "../lib/format";

export function ClientPortalTransactionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading, isError } = useClientPortalTransactions(page, search);

  if (isError) {
    return <p className="text-sm text-status-critical">Could not load your transactions.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Transactions</h1>
        <p className="text-sm text-ink-secondary">Every transaction across every folio, newest first.</p>
      </div>

      <Card title="Transactions">
        <div className="mb-2 flex items-center justify-end">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search scheme, description…"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-secondary">
                <th className="py-1.5 pr-4 font-medium">Scheme</th>
                <th className="py-1.5 pr-4 font-medium">Folio</th>
                <th className="py-1.5 pr-4 font-medium">Type</th>
                <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
                <th className="py-1.5 pr-4 text-right font-medium">Units</th>
                <th className="py-1.5 pr-4 text-right font-medium">NAV</th>
                <th className="py-1.5 text-right font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gridline)]">
              {isLoading && <tr><td colSpan={7} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
              {data?.transactions.length === 0 && (
                <tr><td colSpan={7} className="py-4 text-center text-ink-muted">No transactions yet.</td></tr>
              )}
              {data?.transactions.map((t) => (
                <tr key={t.id} className={t.isRejection ? "bg-status-critical/5" : undefined}>
                  <td className="max-w-[220px] truncate py-1.5 pr-4 text-ink" title={t.schemeName ?? undefined}>
                    {t.schemeName ?? `${t.amcCode}/${t.schemeCode}`}
                  </td>
                  <td className="py-1.5 pr-4 text-ink-secondary">{t.folioNumber}</td>
                  <td className="py-1.5 pr-4 text-ink-secondary">
                    {t.transactionDescription ?? t.transactionType}
                    {t.isRejection && (
                      <span className="ml-2 rounded bg-status-critical/15 px-1.5 py-0.5 text-[10px] font-medium text-status-critical">
                        Reverted / Failed
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={t.amount} /></td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{t.units ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{t.navPerUnit ?? "—"}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatDate(t.transactionDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
      </Card>
    </div>
  );
}
