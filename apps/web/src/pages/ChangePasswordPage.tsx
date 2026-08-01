import { useState, type FormEvent } from "react";
import { useChangePassword, useMe } from "../hooks/useAuth";
import { ApiError } from "../lib/api-client";

export function ChangePasswordPage() {
  const { data: me } = useMe();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const changePassword = useChangePassword();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
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
      { onError: (err) => setError(err instanceof ApiError ? err.message : "Could not change password") },
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-surface p-8 shadow-sm"
      >
        <h1 className="mb-1 text-lg font-semibold text-ink">Set a New Password</h1>
        <p className="mb-6 text-sm text-ink-secondary">
          {me?.mustChangePassword
            ? "You're using a temporary password — set your own before continuing."
            : "Change your account password."}
        </p>

        <label className="mb-1 block text-sm font-medium text-ink-secondary">Current Password</label>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
        />

        <label className="mb-1 block text-sm font-medium text-ink-secondary">New Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
        />

        <label className="mb-1 block text-sm font-medium text-ink-secondary">Confirm New Password</label>
        <input
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
        />

        {error && (
          <p className="mb-4 rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>
        )}

        <button
          type="submit"
          disabled={changePassword.isPending}
          className="w-full rounded-md bg-series-1 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {changePassword.isPending ? "Saving…" : "Save New Password"}
        </button>
      </form>
    </div>
  );
}
