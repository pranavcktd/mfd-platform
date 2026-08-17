import { useState, type FormEvent } from "react";
import { UserCircle } from "lucide-react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { useChangePassword, useMe } from "../hooks/useAuth";
import { formatDate } from "../lib/format";
import { ApiError } from "../lib/api-client";

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const changePassword = useChangePassword();

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
      <form onSubmit={handleSubmit} className="max-w-sm space-y-3">
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

export function ProfilePage() {
  const { data: me, isLoading, isError } = useMe();

  if (isLoading) {
    return <p className="text-sm text-ink-secondary">Loading…</p>;
  }
  if (isError || !me) {
    return <p className="text-sm text-status-critical">Could not load your profile.</p>;
  }

  return (
    <div className="space-y-4">
      <PageHeader icon={UserCircle} title="Profile">
        <p className="text-sm text-ink-secondary">Your account details and login settings.</p>
      </PageHeader>

      <Card title="Account Details">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-ink-secondary">Name</p>
            <p className="mt-1 text-sm text-ink">{me.name}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Email</p>
            <p className="mt-1 text-sm text-ink">{me.email}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Account Created</p>
            <p className="mt-1 text-sm text-ink">{formatDate(me.createdAt)}</p>
          </div>
        </div>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}
