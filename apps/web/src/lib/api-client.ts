// Relative "/api" works locally via vite.config.ts's dev proxy and in any
// deployment where the frontend and API share an origin. When they're on
// separate hosts (e.g. Vercel + Railway), set VITE_API_BASE_URL at build
// time to the API's full origin instead.
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

const TOKEN_STORAGE_KEY = "mfd.accessToken";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    // An expired/invalid token (401) previously left the app showing a
    // vague "Could not load live data" forever with a stale token still
    // sitting in localStorage — real 12h-token-expiry case caught live: the
    // dashboard just silently failed instead of ever prompting a re-login.
    // Hard redirect (not react-router) so it interrupts whatever was
    // mid-fetch regardless of which component triggered it.
    if (response.status === 401) {
      clearAccessToken();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    throw new ApiError(response.status, body.message ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
};
