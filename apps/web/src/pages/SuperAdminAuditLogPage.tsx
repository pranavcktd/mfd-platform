import { Card } from "../components/ui/Card";
import { useAuditLog } from "../hooks/useSuperAdmin";
import { formatDateTime } from "../lib/format";

export function SuperAdminAuditLogPage() {
  const { data: logs, isLoading } = useAuditLog();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Admin Audit Log</h1>
        <p className="text-sm text-ink-secondary">Every onboarding, enable/disable, password reset, and sync action taken from this panel.</p>
      </div>

      <Card title="Recent Actions (last 200)">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-secondary">
              <th className="py-1.5 pr-4 font-medium">Action</th>
              <th className="py-1.5 pr-4 font-medium">MFD</th>
              <th className="py-1.5 pr-4 font-medium">Detail</th>
              <th className="py-1.5 text-right font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {isLoading && (
              <tr><td colSpan={4} className="py-4 text-center text-ink-muted">Loading…</td></tr>
            )}
            {logs?.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-center text-ink-muted">No actions logged yet.</td></tr>
            )}
            {logs?.map((log) => (
              <tr key={log.id}>
                <td className="py-1.5 pr-4 text-ink">{log.action}</td>
                <td className="py-1.5 pr-4 text-ink-secondary">{log.distributor?.name ?? "—"}</td>
                <td className="max-w-[320px] truncate py-1.5 pr-4 text-xs text-ink-muted" title={JSON.stringify(log.detail)}>
                  {log.detail ? JSON.stringify(log.detail) : "—"}
                </td>
                <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatDateTime(log.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
