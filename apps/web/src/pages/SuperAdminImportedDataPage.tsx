import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Eye } from "lucide-react";
import { InsertedDataModal } from "../components/admin/InsertedDataModal";
import { useDistributorList, useMailReportTypes, type MailReportTypeSummaryRow, type MailSourceFilter } from "../hooks/useSuperAdmin";
import { formatCount } from "../lib/format";
import { rtaNativeReportLabel } from "../lib/rta-report-labels";

const RTAS = ["CAMS", "KFINTECH"];

/**
 * RTA -> report-type -> real inserted data, with a date range — built for
 * cross-checking/matching what this platform actually captured against the
 * RTA's own reports, report-type by report-type, rather than eyeballing the
 * flat file-wise log (Mail Sync page) or the daily summary bucketed by ARN.
 */
export function SuperAdminImportedDataPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const distributorId = searchParams.get("distributorId") ?? "";
  const arnProfileId = searchParams.get("arnProfileId") ?? "";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState<MailSourceFilter | "">("");
  const [expandedRta, setExpandedRta] = useState<string | null>(null);
  const [viewReportType, setViewReportType] = useState<{ rtaType: string; reportCode: string | null } | null>(null);

  const { data: distributors } = useDistributorList();
  const { data: reportTypes, isLoading } = useMailReportTypes({
    from: from || undefined,
    to: to || undefined,
    distributorId: distributorId || undefined,
    arnProfileId: arnProfileId || undefined,
    source: source || undefined,
  });

  const selectedDistributor = distributors?.find((d) => d.id === distributorId);
  const arnOptions = (selectedDistributor ? [selectedDistributor] : distributors ?? []).flatMap((d) =>
    d.arnProfiles.map((a) => ({ ...a, mfdName: d.name })),
  );

  function updateDistributor(value: string) {
    const next: Record<string, string> = {};
    if (value) next.distributorId = value;
    setSearchParams(next);
  }
  function updateArn(value: string) {
    const next: Record<string, string> = {};
    if (distributorId) next.distributorId = distributorId;
    if (value) next.arnProfileId = value;
    setSearchParams(next);
  }

  const byRta = new Map<string, MailReportTypeSummaryRow[]>();
  for (const rta of RTAS) byRta.set(rta, []);
  for (const r of reportTypes ?? []) {
    const arr = byRta.get(r.rtaType) ?? [];
    arr.push(r);
    byRta.set(r.rtaType, arr);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Imported Data Explorer</h1>
        <p className="text-sm text-ink-secondary">
          Expand an RTA to see its report types, then a report type to see the actual client/folio/transaction data
          that report put into the CRM — for cross-checking against the RTA's own reports. Use the date range below
          to scope to the exact window you're matching.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={distributorId}
          onChange={(e) => updateDistributor(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm text-ink"
        >
          <option value="">All MFDs</option>
          {distributors?.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          value={arnProfileId}
          onChange={(e) => updateArn(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm text-ink"
        >
          <option value="">All ARNs</option>
          {arnOptions.map((a) => (
            <option key={a.id} value={a.id}>
              ARN-{a.arnNumber}{a.parentArnProfileId ? " (child)" : " (parent)"} — {a.mfdName}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 text-sm text-ink-secondary">
          <span>From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm text-ink"
          />
          <span>To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm text-ink"
          />
          {(from || to) && (
            <button onClick={() => { setFrom(""); setTo(""); }} className="text-ink-muted hover:text-ink">Clear</button>
          )}
        </div>
        <div className="flex gap-1 rounded-md border border-[var(--border)] p-0.5 text-sm">
          {(
            [
              { value: "", label: "All Sources" },
              { value: "live", label: "Live Mail" },
              { value: "folder-import", label: "Since-Inception Import" },
            ] as const
          ).map((s) => (
            <button
              key={s.value}
              onClick={() => setSource(s.value)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                source === s.value ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {RTAS.map((rta) => {
          const rows = byRta.get(rta) ?? [];
          const totals = rows.reduce(
            (acc, r) => ({ seen: acc.seen + r.seen, completed: acc.completed + r.completed, failed: acc.failed + r.failed, rowsInserted: acc.rowsInserted + r.rowsInserted }),
            { seen: 0, completed: 0, failed: 0, rowsInserted: 0 },
          );
          const expanded = expandedRta === rta;
          return (
            <div key={rta} className="rounded-lg border border-[var(--border)] bg-surface p-4">
              <button
                onClick={() => setExpandedRta(expanded ? null : rta)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-2">
                  {expanded ? <ChevronDown size={16} className="text-ink-muted" /> : <ChevronRight size={16} className="text-ink-muted" />}
                  <span className="text-base font-semibold text-ink">{rta === "KFINTECH" ? "KFintech" : rta}</span>
                  <span className="text-xs text-ink-muted">
                    {isLoading ? "loading…" : `${rows.length} report type${rows.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="flex gap-4 text-right text-xs text-ink-secondary">
                  <span>Seen <span className="font-medium text-ink">{formatCount(totals.seen)}</span></span>
                  <span>Completed <span className="font-medium text-status-good">{formatCount(totals.completed)}</span></span>
                  <span>Failed <span className="font-medium text-status-critical">{formatCount(totals.failed)}</span></span>
                  <span>Rows <span className="font-medium text-ink">{formatCount(totals.rowsInserted)}</span></span>
                </div>
              </button>

              {expanded && (
                <div className="mt-3 overflow-x-auto border-t border-[var(--border)] pt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-ink-secondary">
                        <th className="py-1.5 pr-4 font-medium">Report Type</th>
                        <th className="py-1.5 pr-4 text-right font-medium">Seen</th>
                        <th className="py-1.5 pr-4 text-right font-medium">Completed</th>
                        <th className="py-1.5 pr-4 text-right font-medium">Failed</th>
                        <th className="py-1.5 pr-4 text-right font-medium">Rows Inserted</th>
                        <th className="py-1.5 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--gridline)]">
                      {rows.length === 0 && (
                        <tr><td colSpan={6} className="py-3 text-center text-ink-muted">No mail seen for this RTA in this filter.</td></tr>
                      )}
                      {rows.map((r) => (
                        <tr key={r.reportCode ?? "unresolved"}>
                          <td className="py-1.5 pr-4 text-ink" title={r.reportCode ? `Internal code: ${r.reportCode}` : undefined}>
                            {rtaNativeReportLabel(rta, r.reportCode)}
                          </td>
                          <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{formatCount(r.seen)}</td>
                          <td className="py-1.5 pr-4 text-right tabular-nums text-status-good">{formatCount(r.completed)}</td>
                          <td className="py-1.5 pr-4 text-right tabular-nums text-status-critical">{formatCount(r.failed)}</td>
                          <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{formatCount(r.rowsInserted)}</td>
                          <td className="py-1.5 text-right">
                            {r.completed > 0 && (
                              <button
                                onClick={() => setViewReportType({ rtaType: rta, reportCode: r.reportCode })}
                                className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50"
                              >
                                <Eye size={12} /> View Data
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {viewReportType && (
        <InsertedDataModal
          title={`Inserted Data — ${viewReportType.rtaType === "KFINTECH" ? "KFintech" : viewReportType.rtaType} · ${rtaNativeReportLabel(viewReportType.rtaType, viewReportType.reportCode)}`}
          subtitle={`${from || to ? `${from || "inception"} to ${to || "today"}` : "All available data"}${source ? ` · ${source === "folder-import" ? "Since-Inception Import only" : "Live Mail only"}` : ""}`}
          filters={{
            rtaType: viewReportType.rtaType,
            reportCode: viewReportType.reportCode ?? undefined,
            from: from || undefined,
            to: to || undefined,
            distributorId: distributorId || undefined,
            arnProfileId: arnProfileId || undefined,
            source: source || undefined,
          }}
          onClose={() => setViewReportType(null)}
        />
      )}
    </div>
  );
}
