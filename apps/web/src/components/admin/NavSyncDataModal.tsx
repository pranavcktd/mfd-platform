import { useState } from "react";
import { X, Download } from "lucide-react";
import { useNavSyncLogData } from "../../hooks/useSuperAdmin";
import { SearchBox } from "../ui/SearchBox";
import { Pager } from "../ui/Pager";
import { formatDate } from "../../lib/format";
import { downloadCsv } from "../../lib/export";

/**
 * The real scheme/NAV rows one NAV sync run wrote — lets a super admin
 * confirm "did this actually pull today's live NAV" against real scheme
 * names/ISINs instead of just trusting the schemesMatched count on the log
 * row. Search matches ISIN or scheme name.
 */
export function NavSyncDataModal({ logId, title, subtitle, onClose }: { logId: string; title: string; subtitle?: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useNavSyncLogData(logId, page, search, true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle && <p className="text-xs text-ink-secondary">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-2">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search scheme name or ISIN…" />
          {data && data.rows.length > 0 && (
            <button
              onClick={() =>
                downloadCsv(
                  "nav-sync-run.csv",
                  ["ISIN", "Scheme", "AMC", "NAV", "NAV Date"],
                  data.rows.map((r) => [r.isin, r.schemeName ?? "", r.amcName ?? r.amcCode ?? "", r.nav, formatDate(r.navDate)]),
                )
              }
              className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50"
            >
              <Download size={13} /> CSV
            </button>
          )}
        </div>

        <div className="overflow-y-auto px-5 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-secondary">
                <th className="py-1.5 pr-4 font-medium">Scheme</th>
                <th className="py-1.5 pr-4 font-medium">AMC</th>
                <th className="py-1.5 pr-4 font-medium">ISIN</th>
                <th className="py-1.5 pr-4 text-right font-medium">NAV</th>
                <th className="py-1.5 text-right font-medium">NAV Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gridline)]">
              {isLoading && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
              {data?.rows.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-ink-muted">No rows matched for this run{search ? " and search" : ""}.</td></tr>
              )}
              {data?.rows.map((r) => (
                <tr key={r.isin}>
                  <td className="py-1.5 pr-4 text-ink">{r.schemeName ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-ink-secondary">{r.amcName ?? r.amcCode ?? "—"}</td>
                  <td className="py-1.5 pr-4 font-mono text-xs text-ink-secondary">{r.isin}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{r.nav}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatDate(r.navDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
        </div>
      </div>
    </div>
  );
}
