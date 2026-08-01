import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getAccessToken } from "../../lib/api-client";
import { useMe } from "../../hooks/useAuth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { data: me } = useMe();

  if (!getAccessToken()) {
    return <Navigate to="/login" replace />;
  }
  // Force the change-password flow before anything else — except on the
  // change-password route itself, which would otherwise redirect to itself.
  if (me?.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}
