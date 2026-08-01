import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getAdminKey } from "../../lib/admin-api-client";

export function SuperAdminGuard({ children }: { children: ReactNode }) {
  if (!getAdminKey()) {
    return <Navigate to="/super-admin/login" replace />;
  }
  return <>{children}</>;
}
