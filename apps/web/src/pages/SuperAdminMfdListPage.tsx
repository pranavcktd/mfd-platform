import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Pause, Play } from "lucide-react";
import {
  useCheckNow,
  useDeleteDistributor,
  useDistributorList,
  useResetDistributorPassword,
  useScheduleStatus,
  useSetDistributorActive,
  useSetSchedulePaused,
  type DistributorSummary,
} from "../hooks/useSuperAdmin";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { ArnCredentialsModal } from "../components/admin/ArnCredentialsModal";
import { formatCount, formatDateTime } from "../lib/format";

export function SuperAdminMfdListPage() {
  const { data: distributors, isLoading } = useDistributorList();
  const checkNow = useCheckNow();
  const { data: schedule } = useScheduleStatus();
  const setSchedulePaused = useSetSchedulePaused();
  const setActive = useSetDistributorActive();
  const resetPassword = useResetDistributorPassword();
  const deleteDistributor = useDeleteDistributor();
  const [resetResult, setResetResult] = useState<{ name: string; newPassword: string } | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<{ id: string; name: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ id: string; name: string } | null>(null);
  const [credentialsFor, setCredentialsFor] = useState<DistributorSummary | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Onboarded MFDs</h1>
          <p className="text-sm text-ink-secondary">
            {distributors ? `${formatCount(distributors.length)} distributors` : "Loading…"} · all MFDs share one
            backend mailbox, so "sync" always checks everyone's mail at once — there's no selective per-MFD fetch.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSchedulePaused.mutate(!schedule?.paused)}
            className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-ink-secondary hover:bg-[var(--gridline)]/50"
          >
            {schedule?.paused ? <Play size={14} /> : <Pause size={14} />}
            {schedule?.paused ? "Resume scheduled sync" : "Pause scheduled sync"}
          </button>
          <button
            onClick={() => checkNow.mutate()}
            disabled={checkNow.isPending}
            className="flex items-center gap-1.5 rounded-md bg-series-1 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw size={14} className={checkNow.isPending ? "animate-spin" : ""} />
            {checkNow.isPending ? "Syncing…" : "Sync All MFD RTA Data"}
          </button>
        </div>
      </div>

      {checkNow.isSuccess && (
        <p className="rounded-md bg-status-good/10 px-3 py-2 text-sm text-status-good">
          Sync triggered (job {checkNow.data?.jobId}). Check the Mail Sync page in a minute for results.
        </p>
      )}
      {resetResult && (
        <p className="rounded-md bg-status-good/10 px-3 py-2 text-sm text-status-good">
          Password reset for <strong>{resetResult.name}</strong> — new password:{" "}
          <span className="font-mono">{resetResult.newPassword}</span>. They can keep using it or change it, their
          choice.
        </p>
      )}
      {schedule && (
        <p className="text-xs text-ink-muted">
          Scheduled poll: {schedule.paused ? "paused" : `active (${schedule.pattern})`}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-ink-secondary">
              <th className="px-4 py-2 font-medium">MFD</th>
              <th className="px-4 py-2 font-medium">Login Email</th>
              <th className="px-4 py-2 font-medium">ARNs</th>
              <th className="px-4 py-2 text-right font-medium">Clients</th>
              <th className="px-4 py-2 text-right font-medium">Folios</th>
              <th className="px-4 py-2 text-right font-medium">Transactions</th>
              <th className="px-4 py-2 font-medium">Last Sync</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-ink-muted">Loading…</td>
              </tr>
            )}
            {distributors?.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-ink-muted">No MFDs onboarded yet.</td>
              </tr>
            )}
            {distributors?.map((d) => (
              <tr key={d.id} className="hover:bg-[var(--gridline)]/30">
                <td className="px-4 py-2 text-ink">{d.name}</td>
                <td className="px-4 py-2 text-ink-secondary">{d.email}</td>
                <td className="px-4 py-2 text-ink-secondary">
                  {d.arnProfiles.map((a) => (
                    <div key={a.id}>
                      ARN-{a.arnNumber}
                      {a.parentArnProfileId ? " (child)" : ""}
                    </div>
                  ))}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-secondary">{formatCount(d.clientCount)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-secondary">{formatCount(d.folioCount)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-secondary">{formatCount(d.transactionCount)}</td>
                <td className="px-4 py-2 text-ink-muted">{d.lastSyncAt ? formatDateTime(d.lastSyncAt) : "Never"}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-col gap-1">
                    <span
                      className={`w-fit rounded-full px-2 py-0.5 text-xs ${
                        d.isActive ? "bg-status-good/10 text-status-good" : "bg-status-critical/10 text-status-critical"
                      }`}
                    >
                      {d.isActive ? "Active" : "Disabled"}
                    </span>
                    {d.mustChangePassword && (
                      <span className="w-fit rounded-full bg-status-warning/10 px-2 py-0.5 text-xs text-status-warning">
                        Temp password
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <Link to={`/super-admin/mail-sync?distributorId=${d.id}`} className="text-xs text-series-1 hover:underline">
                      View sync log
                    </Link>
                    <button
                      onClick={() => setActive.mutate({ distributorId: d.id, isActive: !d.isActive })}
                      className="text-xs text-ink-secondary hover:underline"
                    >
                      {d.isActive ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => setCredentialsFor(d)}
                      className="text-xs text-ink-secondary hover:underline"
                    >
                      Credentials
                    </button>
                    <button
                      onClick={() => setConfirmResetId({ id: d.id, name: d.name })}
                      disabled={resetPassword.isPending}
                      className="text-xs text-ink-secondary hover:underline"
                    >
                      Reset Password
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId({ id: d.id, name: d.name })}
                      disabled={deleteDistributor.isPending}
                      className="text-xs text-status-critical hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmResetId && (
        <ConfirmModal
          title="Reset password?"
          message={`This immediately replaces ${confirmResetId.name}'s current password with a new temporary one. They'll need to change it on next login.`}
          confirmLabel="Reset Password"
          destructive={false}
          isPending={resetPassword.isPending}
          onCancel={() => setConfirmResetId(null)}
          onConfirm={async () => {
            const result = await resetPassword.mutateAsync(confirmResetId.id);
            setResetResult({ name: confirmResetId.name, newPassword: result.newPassword });
            setConfirmResetId(null);
          }}
        />
      )}

      {confirmDeleteId && (
        <ConfirmModal
          title="Delete this MFD?"
          message={`This hides ${confirmDeleteId.name} from the roster and blocks their login immediately. Their clients, folios, and transactions are NOT erased — this can be reversed by a database administrator if needed.`}
          confirmLabel="Delete"
          destructive
          isPending={deleteDistributor.isPending}
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={async () => {
            await deleteDistributor.mutateAsync(confirmDeleteId.id);
            setConfirmDeleteId(null);
          }}
        />
      )}

      {credentialsFor && (
        <ArnCredentialsModal
          distributorId={credentialsFor.id}
          distributorName={credentialsFor.name}
          arnProfiles={credentialsFor.arnProfiles}
          onClose={() => setCredentialsFor(null)}
        />
      )}
    </div>
  );
}
