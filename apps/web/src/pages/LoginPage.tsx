import { useState, type FormEvent } from "react";
import { useLogin } from "../hooks/useAuth";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    login.mutate({ email, password });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-surface p-8 shadow-sm"
      >
        <h1 className="mb-1 text-lg font-semibold text-ink">MFD Platform</h1>
        <p className="mb-6 text-sm text-ink-secondary">Sign in to your distributor dashboard</p>

        <label className="mb-1 block text-sm font-medium text-ink-secondary" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
        />

        <label className="mb-1 block text-sm font-medium text-ink-secondary" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
        />

        {login.isError && (
          <p className="mb-4 rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
            {login.error instanceof Error ? login.error.message : "Login failed"}
          </p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded-md bg-series-1 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {login.isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
