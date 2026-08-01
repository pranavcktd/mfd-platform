import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getClientToken } from "../../lib/client-portal-api-client";

/**
 * Deliberately does NOT force a change-password redirect even when the
 * account is still on its default password (unlike ProtectedRoute for the
 * MFD's own login) — per explicit design (2026-07-24), the client should
 * land straight in their portfolio and change their password only if/when
 * they choose to, via the Profile page.
 */
export function ClientPortalGuard({ children }: { children: ReactNode }) {
  if (!getClientToken()) {
    return <Navigate to="/client-portal/login" replace />;
  }
  return <>{children}</>;
}
