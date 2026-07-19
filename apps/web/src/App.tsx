import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { NAV_ITEMS } from "./lib/nav-config";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                {NAV_ITEMS.filter((item) => item.comingSoon).map((item) => (
                  <Route key={item.path} path={item.path} element={<ComingSoonPage title={item.label} />} />
                ))}
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
