import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { usePlatformStatus, useSyncHealth } from "../hooks/useSuperAdmin";
import { formatDateTime } from "../lib/format";

function StatusPill({ ok, error }: { ok: boolean; error?: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 size={16} className="text-status-good" /> : <XCircle size={16} className="text-status-critical" />}
      <span className={ok ? "text-status-good" : "text-status-critical"}>{ok ? "OK" : error ?? "Error"}</span>
    </div>
  );
}

export function SuperAdminStatusPage() {
  const { data: status, isLoading } = usePlatformStatus();
  const { data: syncHealth } = useSyncHealth();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Platform Status</h1>
        <p className="text-sm text-ink-secondary">Auto-refreshes every 30 seconds.</p>
      </div>

      <Card title="Sync Health">
        {!syncHealth ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : syncHealth.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-status-good">
            <CheckCircle2 size={16} />
            All MFDs syncing normally.
          </p>
        ) : (
          <div className="space-y-2">
            {syncHealth.map((row) => (
              <div
                key={`${row.distributorId}-${row.rtaType}`}
                className="flex items-start gap-3 rounded-md bg-status-warning/10 px-3 py-2 text-sm"
              >
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-status-warning" />
                <div>
                  <p className="text-ink">
                    <Link to={`/super-admin/mail-sync?distributorId=${row.distributorId}`} className="font-medium text-series-1 hover:underline">
                      {row.distributorName}
                    </Link>{" "}
                    — {row.rtaType}
                  </p>
                  <p className="text-xs text-ink-secondary">
                    {row.staleCredential &&
                      `Last ${row.consecutiveDecryptFailures} sync attempts failed to decrypt — the stored zip password may be stale. `}
                    {row.noRecentSync &&
                      (row.lastSuccessAt
                        ? `No successful sync since ${formatDateTime(row.lastSuccessAt)}.`
                        : "No successful sync recorded yet.")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      {status && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
              <p className="mb-1 text-xs text-ink-secondary">Redis</p>
              <StatusPill ok={status.redis.ok} error={status.redis.error} />
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
              <p className="mb-1 text-xs text-ink-secondary">Postgres</p>
              <StatusPill ok={status.postgres.ok} error={status.postgres.error} />
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
              <p className="text-xs text-ink-secondary">Mail Last Checked</p>
              <p className="mt-1 text-sm text-ink">
                {status.lastMailCheckedAt ? formatDateTime(status.lastMailCheckedAt) : "Never"}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
              <p className="text-xs text-ink-secondary">Last Successful Ingest</p>
              <p className="mt-1 text-sm text-ink">
                {status.lastSuccessfulIngestAt ? formatDateTime(status.lastSuccessfulIngestAt) : "Never"}
              </p>
            </div>
          </div>

          <Card title="Queue Depths">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-secondary">
                  <th className="py-1.5 pr-4 font-medium">Queue</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Waiting</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Active</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Completed</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Failed</th>
                  <th className="py-1.5 text-right font-medium">Delayed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--gridline)]">
                {Object.entries(status.queueDepths).map(([name, counts]) => (
                  <tr key={name}>
                    <td className="py-1.5 pr-4 text-ink">{name}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{counts.waiting}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{counts.active}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{counts.completed}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-status-critical">{counts.failed}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink-secondary">{counts.delayed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
