import { useState, type FormEvent } from "react";
import { Card } from "../components/ui/Card";
import { useAdminChangePassword, useAdminResetToDefault } from "../hooks/useAdminAuth";
import { ApiError } from "../lib/api-client";

export function SuperAdminSettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const changePassword = useAdminChangePassword();
  const resetToDefault = useAdminResetToDefault();

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
    <div className="max-w-md space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Super Admin Settings</h1>
        <p className="text-sm text-ink-secondary">Manage the username/password login for this Super Admin panel.</p>
      </div>

      <Card title="Change Password">
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

      <Card title="Reset to Default">
        <p className="mb-3 text-xs text-ink-secondary">
          Forgot your custom password? This resets the login back to username "Admin" / password "Admin@123" — you
          can change it again afterward, or keep using the default.
        </p>
        <button
          onClick={() => resetToDefault.mutate()}
          disabled={resetToDefault.isPending}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-ink-secondary hover:bg-[var(--gridline)]/50 disabled:opacity-50"
        >
          {resetToDefault.isPending ? "Resetting…" : "Reset to Default"}
        </button>
        {resetToDefault.data && (
          <p className="mt-2 rounded-md bg-status-good/10 px-3 py-2 text-xs text-status-good">
            Reset — username "{resetToDefault.data.username}", password "{resetToDefault.data.password}".
          </p>
        )}
      </Card>
    </div>
  );
}
