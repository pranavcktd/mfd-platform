import { ApiError, API_BASE } from "./api-client";

const CLIENT_TOKEN_STORAGE_KEY = "mfd.clientToken";

export function getClientToken(): string | null {
  return localStorage.getItem(CLIENT_TOKEN_STORAGE_KEY);
}

export function setClientToken(token: string): void {
  localStorage.setItem(CLIENT_TOKEN_STORAGE_KEY, token);
}

export function clearClientToken(): void {
  localStorage.removeItem(CLIENT_TOKEN_STORAGE_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getClientToken();
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
    // Same "don't fail silently forever" fix as api-client.ts — an expired
    // client-portal token should bounce to the client login, not leave the
    // portal showing a vague load error indefinitely.
    if (response.status === 401) {
      clearClientToken();
      if (typeof window !== "undefined" && window.location.pathname !== "/client-portal/login") {
        window.location.href = "/client-portal/login";
      }
    }
    throw new ApiError(response.status, body.message ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const clientPortalApiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
};
