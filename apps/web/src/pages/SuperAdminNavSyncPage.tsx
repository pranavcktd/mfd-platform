import { useRef, useState } from "react";
import { RefreshCw, History, Eye, Upload, Download } from "lucide-react";
import { Card } from "../components/ui/Card";
import { NavSyncDataModal } from "../components/admin/NavSyncDataModal";
import { useNavSyncLogs, useNavCheckNow, useNavBackfillHistory, useNavManualUpload, type NavSyncLogRow } from "../hooks/useSuperAdmin";
import { formatDateTime, formatCount } from "../lib/format";
import { downloadCsv, downloadXlsx } from "../lib/export";
import { ApiError } from "../lib/api-client";

const GRANDFATHER_CUTOFF = "2018-01-31";
const TEMPLATE_HEADERS = ["ISIN", "Scheme Name", "NAV", "NAV Date"];
const TEMPLATE_SAMPLE_ROW = ["INF204KC1097", "Nippon India Flexi Cap Fund - Regular Plan - Growth (for reference only, not used)", "17.0213", "2026-08-07"];

function syncTypeLabel(log: NavSyncLogRow): string {
  if (log.syncType === "HISTORY_BACKFILL") {
    return `Backfill${log.fromDate ? ` (${log.fromDate}${log.toDate && log.toDate !== log.fromDate ? ` → ${log.toDate}` : ""})` : ""}`;
  }
  if (log.syncType === "MANUAL_UPLOAD") return "Manual Upload";
  return "Daily";
}

function ManualNavUploadCard() {
  const upload = useNavManualUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ totalDataRows: number; matched: number; rowErrors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after fixing it
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const res = await upload.mutateAsync(file);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    }
  }

  return (
    <Card title="Manual NAV Upload">
      <p className="mb-3 text-xs text-ink-muted">
        Fallback for when AMFI's site is down or has changed shape and the automated daily sync can't run. Download
        the template, fill in ISIN / NAV / NAV Date for whichever schemes you have fresh NAVs for, and upload it as
        CSV — it writes through the exact same path as the automated sync (visible in the log below with a
        "View" button), so nothing downstream needs to know the NAV came from a file instead of AMFI.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => downloadCsv("nav-upload-template.csv", TEMPLATE_HEADERS, [TEMPLATE_SAMPLE_ROW])}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-[var(--gridline)]/50"
        >
          <Download size={14} /> Template (CSV)
        </button>
        <button
          onClick={() => downloadXlsx("nav-upload-template.xlsx", "NAV Upload", TEMPLATE_HEADERS, [TEMPLATE_SAMPLE_ROW])}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-[var(--gridline)]/50"
        >
          <Download size={14} /> Template (Excel)
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
          className="flex items-center gap-1.5 rounded-md bg-series-1 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Upload size={14} className={upload.isPending ? "animate-pulse" : ""} />
          {upload.isPending ? "Uploading…" : "Upload CSV"}
        </button>
        <span className="text-xs text-ink-muted">
          Upload only accepts .csv — the Excel template is for filling in, then save/export as CSV before uploading.
        </span>
      </div>
      {error && <p className="mt-2 text-xs text-status-critical">{error}</p>}
      {result && (
        <p className="mt-2 text-xs text-status-good">
          Matched {formatCount(result.matched)} of {formatCount(result.totalDataRows)} rows to known schemes.
          {result.rowErrors.length > 0 && ` ${result.rowErrors.length} row(s) skipped — see the Error column below.`}
        </p>
      )}
    </Card>
  );
}

export function SuperAdminNavSyncPage() {
  const { data: logs, isLoading } = useNavSyncLogs();
  const checkNow = useNavCheckNow();
  const backfill = useNavBackfillHistory();
  const [fromDate, setFromDate] = useState(GRANDFATHER_CUTOFF);
  const [toDate, setToDate] = useState(GRANDFATHER_CUTOFF);
  const [viewLog, setViewLog] = useState<NavSyncLogRow | null>(null);

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

      <ManualNavUploadCard />

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
              <th className="py-1.5 pr-4 font-medium">Error</th>
              <th className="py-1.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {isLoading && <tr><td colSpan={8} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
            {logs?.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-ink-muted">No NAV syncs yet.</td></tr>}
            {logs?.map((log) => (
              <tr key={log.id}>
                <td className="py-1.5 pr-4 text-ink-secondary">{syncTypeLabel(log)}</td>
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
                <td className="py-1.5 text-right">
                  {log.status === "COMPLETED" && (
                    <button
                      onClick={() => setViewLog(log)}
                      className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50"
                    >
                      <Eye size={12} /> View
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {viewLog && (
        <NavSyncDataModal
          logId={viewLog.id}
          title={`NAV Sync Run — ${syncTypeLabel(viewLog)}`}
          subtitle={`${formatDateTime(viewLog.triggeredAt)} · ${viewLog.schemesMatched != null ? formatCount(viewLog.schemesMatched) : "—"} schemes matched`}
          onClose={() => setViewLog(null)}
        />
      )}
    </div>
  );
}
