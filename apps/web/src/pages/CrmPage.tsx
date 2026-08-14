import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { X, Users } from "lucide-react";
import { useClientList } from "../hooks/useCrm";
import { useArnProfiles } from "../hooks/useDashboard";
import { Amount } from "../components/ui/Amount";
import { PageHeader } from "../components/ui/PageHeader";
import { ArnFilter } from "../components/ui/ArnFilter";
import { SearchBox } from "../components/ui/SearchBox";
import { Pager } from "../components/ui/Pager";
import { formatCount, formatDate } from "../lib/format";

export function CrmPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const amcCode = searchParams.get("amcCode") ?? undefined;
  const assetClass = searchParams.get("assetClass") ?? undefined;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [arnIds, setArnIds] = useState<string[]>([]);
  const { data: arnProfiles } = useArnProfiles();
  const { data, isLoading } = useClientList(search, page, { amcCode, assetClass, arnProfileIds: arnIds });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader icon={Users} accent="series-2" title="CRM — Client Master">
          <p className="text-sm text-ink-secondary">
            {data ? `${formatCount(data.total)} clients` : "Loading…"}
          </p>
          {(amcCode || assetClass) && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="rounded-full bg-series-1/10 px-2 py-0.5 text-xs text-series-1">
                Filtered by {amcCode ? `AMC ${amcCode}` : assetClass}
              </span>
              <button
                onClick={() => setSearchParams({})}
                className="text-ink-muted hover:text-ink"
                aria-label="Clear filter"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </PageHeader>
        <div className="flex items-center gap-2">
          {arnProfiles && (
            <ArnFilter
              arnProfiles={arnProfiles}
              selectedIds={arnIds}
              onChange={(ids) => { setArnIds(ids); setPage(1); }}
            />
          )}
          <SearchBox
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search name, PAN, email, mobile…"
            className="w-72"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-ink-secondary">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">PAN</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Mobile</th>
              <th className="px-4 py-2 font-medium">Folios</th>
              <th className="px-4 py-2 text-right font-medium">Invested</th>
              <th className="px-4 py-2 text-right font-medium">Total AUM</th>
              <th className="px-4 py-2 text-right font-medium">Gain</th>
              <th className="px-4 py-2 text-right font-medium">Return %</th>
              <th className="px-4 py-2 text-right font-medium">XIRR</th>
              <th className="px-4 py-2 text-right font-medium" title="Approximate for multi-purchase folios — treats total invested as a lump sum from the first purchase date. Prefer XIRR for accuracy.">CAGR</th>
              <th className="px-4 py-2 font-medium">Onboarded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {!isLoading && data?.clients.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-6 text-center text-ink-muted">
                  No clients found.
                </td>
              </tr>
            )}
            {data?.clients.map((c) => (
              <tr key={c.id} className="hover:bg-[var(--gridline)]/30">
                <td className="px-4 py-2">
                  <Link to={`/crm/${c.id}`} className="text-series-1 hover:underline">
                    {c.name}
                  </Link>
                  {c.needsReview && (
                    <span className="ml-2 rounded bg-status-warning/20 px-1.5 py-0.5 text-[10px] text-status-warning">
                      needs review
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-ink-secondary">{c.panNumber ?? "—"}</td>
                <td className="px-4 py-2 text-ink-secondary">{c.email ?? "—"}</td>
                <td className="px-4 py-2 text-ink-secondary">{c.phone ?? "—"}</td>
                <td className="px-4 py-2 text-ink-secondary">{c.folioCount}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-secondary"><Amount value={c.totalInvested} /></td>
                <td className="px-4 py-2 text-right tabular-nums text-ink"><Amount value={c.totalAum} /></td>
                <td className={`px-4 py-2 text-right tabular-nums ${Number(c.gain) >= 0 ? "text-status-good" : "text-status-critical"}`}>
                  {Number(c.gain) >= 0 ? "+" : ""}<Amount value={c.gain} />
                </td>
                <td className={`px-4 py-2 text-right tabular-nums ${c.absoluteReturnPercent === null ? "text-ink-muted" : Number(c.absoluteReturnPercent) >= 0 ? "text-status-good" : "text-status-critical"}`}>
                  {c.absoluteReturnPercent !== null ? `${Number(c.absoluteReturnPercent) >= 0 ? "+" : ""}${Number(c.absoluteReturnPercent).toFixed(2)}%` : "—"}
                </td>
                <td className={`px-4 py-2 text-right tabular-nums ${c.xirr === null ? "text-ink-muted" : Number(c.xirr) >= 0 ? "text-status-good" : "text-status-critical"}`}>
                  {c.xirr !== null ? `${Number(c.xirr) >= 0 ? "+" : ""}${Number(c.xirr).toFixed(2)}%` : "—"}
                </td>
                <td className={`px-4 py-2 text-right tabular-nums ${c.cagr === null ? "text-ink-muted" : Number(c.cagr) >= 0 ? "text-status-good" : "text-status-critical"}`}>
                  {c.cagr !== null ? `${Number(c.cagr) >= 0 ? "+" : ""}${Number(c.cagr).toFixed(2)}%` : "—"}
                </td>
                <td className="px-4 py-2 text-ink-muted">{formatDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </div>
  );
}
