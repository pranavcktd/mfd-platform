import { useState, type FormEvent } from "react";
import { Card } from "../components/ui/Card";
import { useClientPortalChangePassword, useClientPortalMe } from "../hooks/useClientPortal";
import { formatDate } from "../lib/format";
import { ApiError } from "../lib/api-client";

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const changePassword = useClientPortalChangePassword();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setSuccess(true);
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Could not change password"),
      },
    );
  }

  return (
    <Card title="Change Password">
      <p className="mb-3 text-xs text-ink-secondary">
        Optional — you can keep using the password your distributor gave you for as long as you like.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-secondary">Current Password</label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-secondary">New Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-secondary">Confirm New Password</label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
          />
        </div>
        {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-xs text-status-critical">{error}</p>}
        {success && <p className="rounded-md bg-status-good/10 px-3 py-2 text-xs text-status-good">Password changed.</p>}
        <button
          type="submit"
          disabled={changePassword.isPending}
          className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {changePassword.isPending ? "Saving…" : "Change Password"}
        </button>
      </form>
    </Card>
  );
}

export function ClientPortalProfilePage() {
  const { data, isLoading, isError } = useClientPortalMe();

  if (isLoading) {
    return <p className="text-sm text-ink-secondary">Loading…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-status-critical">Could not load your profile.</p>;
  }

  const address = [data.address1, data.address2, data.city, data.pincode].filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Profile</h1>
        <p className="text-sm text-ink-secondary">Your personal, bank, and nominee details on file.</p>
      </div>

      <Card title="Personal & Bank Details">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-ink-secondary">Name</p>
            <p className="mt-1 text-sm text-ink">{data.name}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">PAN</p>
            <p className="mt-1 text-sm text-ink">{data.panNumber ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Date of Birth</p>
            <p className="mt-1 text-sm text-ink">{data.dateOfBirth ? formatDate(data.dateOfBirth) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Email</p>
            <p className="mt-1 text-sm text-ink">{data.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Phone</p>
            <p className="mt-1 text-sm text-ink">{data.phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">KYC Status</p>
            <p className="mt-1 text-sm text-ink">{data.kycStatus ?? "Not captured by source reports"}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs text-ink-secondary">Address</p>
            <p className="mt-1 text-sm text-ink">{address || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Tax Status</p>
            <p className="mt-1 text-sm text-ink">{data.taxStatus ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Primary Bank</p>
            <p className="mt-1 text-sm text-ink">{data.bankName ?? "—"}</p>
            <p className="text-xs text-ink-muted">{data.bankAccountNumber ?? ""}</p>
          </div>
          {data.bankAccounts.length > 0 && (
            <div>
              <p className="text-xs text-ink-secondary">Other Bank Accounts</p>
              {data.bankAccounts.map((b) => (
                <p key={b.id} className="mt-1 text-sm text-ink">{b.bankName} · {b.accountNumber}</p>
              ))}
            </div>
          )}
          <div>
            <p className="text-xs text-ink-secondary">Nominee{data.nominees.length > 1 ? "s" : ""}</p>
            {data.nominees.length === 0 && <p className="mt-1 text-sm text-ink">Not on file</p>}
            {data.nominees.map((n) => (
              <p key={n.id} className="mt-1 text-sm text-ink">
                {n.nomineeName}{n.relation ? ` (${n.relation})` : ""}
              </p>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Notice something incorrect? Contact your distributor to have it updated.
        </p>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}
