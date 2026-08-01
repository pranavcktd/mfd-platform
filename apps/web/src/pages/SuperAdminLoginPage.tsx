import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { adminApiClient, setAdminKey } from "../lib/admin-api-client";
import { ApiError } from "../lib/api-client";

export function SuperAdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      // The login itself doesn't need the admin key attached, but
      // adminApiClient always attaches whatever's in storage — harmless
      // here since the backend route ignores it (public login endpoint).
      const { adminKey } = await adminApiClient.post<{ adminKey: string }>("/admin-auth/login", {
        username,
        password,
      });
      setAdminKey(adminKey);
      navigate("/super-admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-surface p-8 shadow-sm"
      >
        <h1 className="mb-1 text-lg font-semibold text-ink">Super Admin</h1>
        <p className="mb-6 text-sm text-ink-secondary">Platform administration — MFD onboarding and mail sync.</p>

        <label className="mb-1 block text-sm font-medium text-ink-secondary" htmlFor="admin-username">
          Username
        </label>
        <input
          id="admin-username"
          type="text"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-4 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
        />

        <label className="mb-1 block text-sm font-medium text-ink-secondary" htmlFor="admin-password">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
        />

        {error && (
          <p className="mb-4 rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-series-1 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
