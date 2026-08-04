import { useState } from "react";
import { RefreshCw, History } from "lucide-react";
import { Card } from "../components/ui/Card";
import { useNavSyncLogs, useNavCheckNow, useNavBackfillHistory } from "../hooks/useSuperAdmin";
import { formatDateTime, formatCount } from "../lib/format";

const GRANDFATHER_CUTOFF = "2018-01-31";

export function SuperAdminNavSyncPage() {
  const { data: logs, isLoading } = useNavSyncLogs();
  const checkNow = useNavCheckNow();
  const backfill = useNavBackfillHistory();
  const [fromDate, setFromDate] = useState(GRANDFATHER_CUTOFF);
  const [toDate, setToDate] = useState(GRANDFATHER_CUTOFF);

  const latest = logs?.[0];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">NAV Sync Log</h1>
          <p className="text-sm text-ink-secondary">
            Daily AMFI NAV pull (live holding valuation) and on-demand historical NAV backfill (equity Section 112A
            grandfathering, capped at 90 days per AMFI's own limit). Runs automatically every day at 9:30pm — this
            page is a status/audit view, same idea as Mail Sync's log.
          </p>
        </div>
        <button
          onClick={() => checkNow.mutate()}
          disabled={checkNow.isPending}
          className="flex items-center gap-1.5 rounded-md bg-series-1 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw size={14} className={checkNow.isPending ? "animate-spin" : ""} />
          {checkNow.isPending ? "Syncing…" : "Sync Now"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Last Sync</p>
          <p className="mt-1 text-sm font-medium text-ink">
            {isLoading ? "—" : latest ? formatDateTime(latest.triggeredAt) : "Never run"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Status</p>
          <p
            className={`mt-1 text-sm font-medium ${
              latest?.status === "COMPLETED"
                ? "text-status-good"
                : latest?.status === "FAILED"
                  ? "text-status-critical"
                  : "text-ink-muted"
            }`}
          >
            {isLoading ? "—" : latest?.status ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Schemes Matched (last run)</p>
          <p className="mt-1 text-sm font-medium text-ink">
            {isLoading ? "—" : latest?.schemesMatched != null ? formatCount(latest.schemesMatched) : "—"}
          </p>
        </div>
      </div>

      <Card title="Historical NAV Backfill">
        <p className="mb-3 text-xs text-ink-muted">
          Fetches AMFI's historical NAV for a date range (max 90 days) and stores it per scheme ISIN. Used mainly to
          get the real {GRANDFATHER_CUTOFF} NAV that equity capital-gains grandfathering needs — the default range
          below is pre-filled to that exact date.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-secondary">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-secondary">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </div>
          <button
            onClick={() => backfill.mutate({ fromDate, toDate })}
            disabled={backfill.isPending}
            className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-[var(--gridline)]/50 disabled:opacity-50"
          >
            <History size={14} className={backfill.isPending ? "animate-spin" : ""} />
            {backfill.isPending ? "Backfilling…" : "Run Backfill"}
          </button>
          {backfill.isSuccess && <span className="text-xs text-status-good">Enqueued — check the log below.</span>}
          {backfill.isError && (
            <span className="text-xs text-status-critical">
              {backfill.error instanceof Error ? backfill.error.message : "Backfill failed to enqueue."}
            </span>
          )}
        </div>
      </Card>

      <Card title="Sync History (last 50)">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-secondary">
              <th className="py-1.5 pr-4 font-medium">Type</th>
              <th className="py-1.5 pr-4 font-medium">Triggered</th>
              <th className="py-1.5 pr-4 font-medium">Completed</th>
              <th className="py-1.5 pr-4 font-medium">Status</th>
              <th className="py-1.5 pr-4 text-right font-medium">Rows in File</th>
              <th className="py-1.5 pr-4 text-right font-medium">Schemes Matched</th>
              <th className="py-1.5 font-medium">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {isLoading && <tr><td colSpan={7} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
            {logs?.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-ink-muted">No NAV syncs yet.</td></tr>}
            {logs?.map((log) => (
              <tr key={log.id}>
                <td className="py-1.5 pr-4 text-ink-secondary">
                  {log.syncType === "HISTORY_BACKFILL"
                    ? `Backfill${log.fromDate ? ` (${log.fromDate}${log.toDate && log.toDate !== log.fromDate ? ` → ${log.toDate}` : ""})` : ""}`
                    : "Daily"}
                </td>
                <td className="py-1.5 pr-4 text-ink-muted">{formatDateTime(log.triggeredAt)}</td>
                <td className="py-1.5 pr-4 text-ink-muted">{log.completedAt ? formatDateTime(log.completedAt) : "—"}</td>
                <td className="py-1.5 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      log.status === "COMPLETED"
                        ? "bg-status-good/10 text-status-good"
                        : log.status === "FAILED"
                          ? "bg-status-critical/10 text-status-critical"
                          : "bg-[var(--gridline)] text-ink-muted"
                    }`}
                  >
                    {log.status}
                  </span>
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">
                  {log.totalRowsInFile != null ? formatCount(log.totalRowsInFile) : "—"}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">
                  {log.schemesMatched != null ? formatCount(log.schemesMatched) : "—"}
                </td>
                <td className="max-w-[280px] py-1.5 text-xs text-status-critical">
                  {log.errorMessage && <p className="truncate" title={log.errorMessage}>{log.errorMessage}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
