import { ApiError, API_BASE } from "./api-client";

const ADMIN_KEY_STORAGE_KEY = "mfd.adminKey";

export function getAdminKey(): string | null {
  return localStorage.getItem(ADMIN_KEY_STORAGE_KEY);
}

export function setAdminKey(key: string): void {
  localStorage.setItem(ADMIN_KEY_STORAGE_KEY, key);
}

export function clearAdminKey(): void {
  localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getAdminKey();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-admin-key": key } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    // Same "don't fail silently forever" fix as api-client.ts — a
    // missing/invalid admin key should bounce to the admin login, not leave
    // every super-admin page showing a vague load error.
    if (response.status === 401) {
      clearAdminKey();
      if (typeof window !== "undefined" && window.location.pathname !== "/super-admin/login") {
        window.location.href = "/super-admin/login";
      }
    }
    throw new ApiError(response.status, body.message ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const adminApiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
};
