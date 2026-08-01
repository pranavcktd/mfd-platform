import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Card } from "../components/ui/Card";
import { useCheckNow, useDistributorList, useMailLogSummary, useMailLogs } from "../hooks/useSuperAdmin";
import { formatCount, formatDateTime, gmailSearchLink } from "../lib/format";

const STATUS_OPTIONS = ["", "NO_LINK", "ENQUEUED", "DOWNLOAD_FAILED", "DECRYPT_FAILED", "PARSE_FAILED", "COMPLETED"];
const RTA_TABS = [
  { value: "", label: "All RTAs" },
  { value: "CAMS", label: "CAMS" },
  { value: "KFINTECH", label: "KFintech" },
];

export function SuperAdminMailSyncPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const distributorId = searchParams.get("distributorId") ?? "";
  const arnProfileId = searchParams.get("arnProfileId") ?? "";
  const [rtaType, setRtaType] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: distributors } = useDistributorList();
  const { data: summary, isLoading: summaryLoading } = useMailLogSummary({
    distributorId: distributorId || undefined,
    arnProfileId: arnProfileId || undefined,
    from: from || undefined,
    to: to || undefined,
  });
  const { data: logs, isLoading: logsLoading } = useMailLogs({
    distributorId: distributorId || undefined,
    arnProfileId: arnProfileId || undefined,
    status: status || undefined,
    rtaType: rtaType || undefined,
    from: from || undefined,
    to: to || undefined,
  });
  const checkNow = useCheckNow();

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
              <th className="py-1.5 font-medium">Failure Reasons</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {summaryLoading && (
              <tr><td colSpan={8} className="py-4 text-center text-ink-muted">Loading…</td></tr>
            )}
            {visibleSummary?.length === 0 && (
              <tr><td colSpan={8} className="py-4 text-center text-ink-muted">No data for this filter.</td></tr>
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
                <td className="py-1.5 text-xs text-ink-muted">
                  {Object.entries(r.failureReasons)
                    .map(([reason, count]) => `${reason} (${count})`)
                    .join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="File-Wise Status (last 200)">
        <p className="mb-2 text-xs text-ink-muted">
          One row per RTA file. "Report" is which report type it resolved to (blank until schema-mapping
          identifies it), "Rows" is how much data it actually added to the CRM — 0 on a re-processed file is
          normal (already-seen data, not a failure). Failed rows show the full error and, where the sender email
          was captured, a link straight to that exact message in Gmail.
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
                <td className="py-1.5 pr-4 text-ink-secondary">{log.reportCode ?? "—"}</td>
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
                    <a
                      href={gmailSearchLink(log.messageId)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-series-1 hover:underline"
                    >
                      Open source email in Gmail
                    </a>
                  )}
                  {failed && !log.messageId && <span className="italic">No message-id captured for this row</span>}
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
