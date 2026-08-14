import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw, Copy, Check, Download, FileSpreadsheet, FileText, Eye } from "lucide-react";
import { Card } from "../components/ui/Card";
import { useCheckNow, useDistributorList, useMailLastSync, useMailLogSummary, useMailLogs, type MailLogRow, type MailSourceFilter } from "../hooks/useSuperAdmin";
import { formatCount, formatDateTime, gmailSearchLink, gmailMessageIdSearchText, gmailFallbackSearchText } from "../lib/format";
import { downloadCsv, downloadXlsx, downloadTxt } from "../lib/export";
import { InsertedDataModal } from "../components/admin/InsertedDataModal";
import { rtaNativeReportLabel } from "../lib/rta-report-labels";

const STATUS_OPTIONS = ["", "NO_LINK", "ENQUEUED", "DOWNLOAD_FAILED", "DECRYPT_FAILED", "PARSE_FAILED", "COMPLETED"];
const RTA_TABS = [
  { value: "", label: "All RTAs" },
  { value: "CAMS", label: "CAMS" },
  { value: "KFINTECH", label: "KFintech" },
];

/** Small clipboard-copy button — used for the failed-mail search text so an admin can paste it straight into their mailbox's own search box, not just click through. */
function CopyButton({ text, title }: { text: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      title={title}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center text-ink-muted hover:text-ink"
    >
      {copied ? <Check size={12} className="text-status-good" /> : <Copy size={12} />}
    </button>
  );
}

function exportRows(logs: MailLogRow[]) {
  const headers = ["RTA", "From", "Subject", "MFD", "ARN", "Report", "Rows", "Status", "Error", "Received", "Processed"];
  const rows = logs.map((log) => [
    log.rtaType,
    log.fromAddress,
    log.subject ?? "",
    log.distributor?.name ?? "",
    log.arnProfile?.arnNumber ?? "",
    rtaNativeReportLabel(log.rtaType, log.reportCode),
    log.rowsInserted ?? "",
    log.status,
    log.errorMessage ?? "",
    log.receivedAt ? formatDateTime(log.receivedAt) : formatDateTime(log.createdAt),
    log.status === "COMPLETED" || log.status.endsWith("FAILED") ? formatDateTime(log.updatedAt) : "",
  ]);
  return { headers, rows };
}

export function SuperAdminMailSyncPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const distributorId = searchParams.get("distributorId") ?? "";
  const arnProfileId = searchParams.get("arnProfileId") ?? "";
  const [rtaType, setRtaType] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState<MailSourceFilter | "">("");

  const { data: distributors } = useDistributorList();
  const { data: lastSync, isLoading: lastSyncLoading } = useMailLastSync();
  const { data: summary, isLoading: summaryLoading } = useMailLogSummary({
    distributorId: distributorId || undefined,
    arnProfileId: arnProfileId || undefined,
    from: from || undefined,
    to: to || undefined,
    source: source || undefined,
  });
  const { data: logs, isLoading: logsLoading } = useMailLogs({
    distributorId: distributorId || undefined,
    arnProfileId: arnProfileId || undefined,
    status: status || undefined,
    rtaType: rtaType || undefined,
    from: from || undefined,
    to: to || undefined,
    source: source || undefined,
  });
  const checkNow = useCheckNow();
  const [viewBucket, setViewBucket] = useState<{ date: string; rtaType: string; arnProfileId: string | null } | null>(null);

  const visibleSummary = summary?.filter((r) => !rtaType || r.rtaType === rtaType);

  const totals = visibleSummary?.reduce(
    (acc, r) => ({ seen: acc.seen + r.seen, completed: acc.completed + r.completed, failed: acc.failed + r.failed }),
    { seen: 0, completed: 0, failed: 0 },
  );

  // Every ARN across every MFD, flattened for a single "filter by ARN" dropdown — filtering by
  // distributor alone can't distinguish a parent ARN's data from its child's.
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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Mail Sync Log — RTA File-Wise Status</h1>
          <p className="text-sm text-ink-secondary">
            Every RTA file (CAMS or KFintech) seen through the pipeline — which report it was, how many rows it
            extracted, and exactly what failed and why. Filter by RTA and date to see one side at a time.
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {lastSyncLoading && (
          <>
            <div className="rounded-lg border border-[var(--border)] bg-surface p-4"><p className="text-xs text-ink-secondary">Loading…</p></div>
            <div className="rounded-lg border border-[var(--border)] bg-surface p-4"><p className="text-xs text-ink-secondary">Loading…</p></div>
          </>
        )}
        {!lastSyncLoading && lastSync?.length === 0 && (
          <div className="rounded-lg border border-[var(--border)] bg-surface p-4 sm:col-span-2">
            <p className="text-sm text-ink-muted">No RTA mail seen yet on any onboarded mailbox.</p>
          </div>
        )}
        {lastSync?.map((s) => (
          <div key={s.rtaType} className="rounded-lg border border-[var(--border)] bg-surface p-4">
            <p className="text-xs font-medium text-ink-secondary">{s.rtaType} — Last Sync</p>
            <p className="mt-1 text-sm font-medium text-ink">
              {s.lastCompletedAt ? formatDateTime(s.lastCompletedAt) : "Never completed"}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Last attempt: {s.lastAttemptAt ? formatDateTime(s.lastAttemptAt) : "—"}
              {s.lastAttemptStatus && (
                <span className={s.lastAttemptStatus === "COMPLETED" ? " text-status-good" : s.lastAttemptStatus.endsWith("FAILED") ? " text-status-critical" : ""}>
                  {" "}({s.lastAttemptStatus})
                </span>
              )}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {RTA_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setRtaType(t.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                rtaType === t.value ? "bg-series-1 text-white" : "border border-[var(--border)] text-ink-secondary hover:bg-[var(--gridline)]/50"
              }`}
            >
              {t.label}
            </button>
          ))}
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
              className={`rounded px-2.5 py-1 font-medium ${
                source === s.value ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
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
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm text-ink"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s || "All statuses"}</option>
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
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Mails Seen</p>
          <p className="mt-1 text-xl font-semibold text-ink">{summaryLoading ? "—" : formatCount(totals?.seen ?? 0)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Processed</p>
          <p className="mt-1 text-xl font-semibold text-status-good">
            {summaryLoading ? "—" : formatCount(totals?.completed ?? 0)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Failed</p>
          <p className="mt-1 text-xl font-semibold text-status-critical">
            {summaryLoading ? "—" : formatCount(totals?.failed ?? 0)}
          </p>
        </div>
      </div>

      <Card title="Daily Summary by RTA + ARN">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-secondary">
              <th className="py-1.5 pr-4 font-medium">Date</th>
              <th className="py-1.5 pr-4 font-medium">RTA</th>
              <th className="py-1.5 pr-4 font-medium">ARN</th>
              <th className="py-1.5 pr-4 text-right font-medium">Seen</th>
              <th className="py-1.5 pr-4 text-right font-medium">Completed</th>
              <th className="py-1.5 pr-4 text-right font-medium">Failed</th>
              <th className="py-1.5 pr-4 text-right font-medium">Rows Inserted</th>
              <th className="py-1.5 pr-4 font-medium">Failure Reasons</th>
              <th className="py-1.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {summaryLoading && (
              <tr><td colSpan={9} className="py-4 text-center text-ink-muted">Loading…</td></tr>
            )}
            {visibleSummary?.length === 0 && (
              <tr><td colSpan={9} className="py-4 text-center text-ink-muted">No data for this filter.</td></tr>
            )}
            {visibleSummary?.map((r) => (
              <tr key={`${r.date}-${r.rtaType}-${r.arnProfileId ?? "none"}`}>
                <td className="py-1.5 pr-4 text-ink-muted">{r.date}</td>
                <td className="py-1.5 pr-4 text-ink">{r.rtaType}</td>
                <td className="py-1.5 pr-4 text-ink-secondary">{r.arnNumber ? `ARN-${r.arnNumber}` : "Not yet attributed"}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{r.seen}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-status-good">{r.completed}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-status-critical">{r.failed}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{r.rowsInserted}</td>
                <td className="py-1.5 pr-4 text-xs text-ink-muted">
                  {Object.entries(r.failureReasons)
                    .map(([reason, count]) => `${reason} (${count})`)
                    .join(", ") || "—"}
                </td>
                <td className="py-1.5 text-right">
                  {r.completed > 0 && (
                    <button
                      onClick={() => setViewBucket({ date: r.date, rtaType: r.rtaType, arnProfileId: r.arnProfileId })}
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

      {viewBucket && (
        <InsertedDataModal
          title={`Inserted Data — ${viewBucket.rtaType}, ${viewBucket.date}`}
          subtitle={viewBucket.arnProfileId ? "Scoped to one ARN's mail on this day" : "All unattributed mail on this day for this RTA"}
          filters={{
            date: viewBucket.date,
            rtaType: viewBucket.rtaType,
            arnProfileId: viewBucket.arnProfileId ?? undefined,
            distributorId: distributorId || undefined,
          }}
          onClose={() => setViewBucket(null)}
        />
      )}

      <Card
        title="File-Wise Status (last 200)"
        action={
          logs && logs.length > 0 ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const { headers, rows } = exportRows(logs); downloadCsv("mail-sync-log.csv", headers, rows); }}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50"
              >
                <Download size={13} /> CSV
              </button>
              <button
                onClick={() => { const { headers, rows } = exportRows(logs); downloadXlsx("mail-sync-log.xlsx", "Mail Sync Log", headers, rows); }}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50"
              >
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button
                onClick={() => { const { headers, rows } = exportRows(logs); downloadTxt("mail-sync-log.txt", headers, rows); }}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50"
              >
                <FileText size={13} /> TXT
              </button>
            </div>
          ) : undefined
        }
      >
        <p className="mb-2 text-xs text-ink-muted">
          One row per RTA file. "Report" is which report type it resolved to (blank until schema-mapping
          identifies it), "Rows" is how much data it actually added to the CRM — 0 on a re-processed file is
          normal (already-seen data, not a failure). Failed rows show the full error and, where the sender email
          was captured, a link straight to that exact message in Gmail — plus a copy button for pasting the same
          search into an already-open Gmail tab. Export reflects the current filter, up to the same 200-row cap.
        </p>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-secondary">
              <th className="py-1.5 pr-4 font-medium">RTA</th>
              <th className="py-1.5 pr-4 font-medium">From</th>
              <th className="py-1.5 pr-4 font-medium">Subject / File</th>
              <th className="py-1.5 pr-4 font-medium">MFD / ARN</th>
              <th className="py-1.5 pr-4 font-medium">Report</th>
              <th className="py-1.5 pr-4 text-right font-medium">Rows</th>
              <th className="py-1.5 pr-4 font-medium">Status</th>
              <th className="py-1.5 pr-4 font-medium">Error / Detail</th>
              <th className="py-1.5 pr-4 text-right font-medium">Received (exact)</th>
              <th className="py-1.5 text-right font-medium">Processed (exact)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {logsLoading && (
              <tr><td colSpan={10} className="py-4 text-center text-ink-muted">Loading…</td></tr>
            )}
            {logs?.length === 0 && (
              <tr><td colSpan={10} className="py-4 text-center text-ink-muted">No mail logs match this filter.</td></tr>
            )}
            {logs?.map((log) => {
              const failed = log.status.endsWith("FAILED");
              return (
              <tr key={log.id}>
                <td className="py-1.5 pr-4 text-ink">{log.rtaType}</td>
                <td className="max-w-[160px] truncate py-1.5 pr-4 text-ink-secondary" title={log.fromAddress}>
                  {log.fromAddress}
                </td>
                <td className="max-w-[200px] truncate py-1.5 pr-4 text-ink-secondary" title={log.subject ?? undefined}>
                  {log.subject ?? "—"}
                </td>
                <td className="py-1.5 pr-4 text-ink-secondary">
                  {log.distributor?.name ?? "—"}
                  {log.arnProfile ? ` · ARN-${log.arnProfile.arnNumber}` : ""}
                </td>
                <td className="py-1.5 pr-4 text-ink-secondary" title={log.reportCode ? `Internal code: ${log.reportCode}` : undefined}>
                  {rtaNativeReportLabel(log.rtaType, log.reportCode)}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{log.rowsInserted ?? "—"}</td>
                <td className="py-1.5 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      log.status === "COMPLETED"
                        ? "bg-status-good/10 text-status-good"
                        : failed
                          ? "bg-status-critical/10 text-status-critical"
                          : "bg-[var(--gridline)] text-ink-muted"
                    }`}
                  >
                    {log.status}
                  </span>
                </td>
                <td className="max-w-[220px] py-1.5 pr-4 text-xs text-ink-muted">
                  {log.errorMessage && <p className="truncate" title={log.errorMessage}>{log.errorMessage}</p>}
                  {failed && log.messageId && (
                    <div className="flex items-center gap-1.5">
                      <a
                        href={gmailSearchLink(log.messageId)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-series-1 hover:underline"
                      >
                        Open in Gmail
                      </a>
                      <CopyButton text={gmailMessageIdSearchText(log.messageId)} title="Copy Gmail search text to paste in your mailbox" />
                    </div>
                  )}
                  {failed && !log.messageId && (
                    <div className="flex items-center gap-1.5">
                      <span className="italic">No message-id — search by sender/subject/date instead</span>
                      <CopyButton
                        text={gmailFallbackSearchText(log.fromAddress, log.subject, log.receivedAt ?? log.createdAt)}
                        title="Copy a best-effort Gmail search (sender + subject + date) to paste in your mailbox"
                      />
                    </div>
                  )}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink-muted">
                  {log.receivedAt ? formatDateTime(log.receivedAt) : formatDateTime(log.createdAt)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-ink-muted">
                  {log.status === "COMPLETED" || failed ? formatDateTime(log.updatedAt) : "—"}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
