import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { CrmPage } from "./pages/CrmPage";
import { ClientDetailPage } from "./pages/ClientDetailPage";
import { MisPage } from "./pages/MisPage";
import { ReportsPage } from "./pages/ReportsPage";
import { OtherAssetsPage } from "./pages/OtherAssetsPage";
import { BrokeragePage } from "./pages/BrokeragePage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { ToolsPage } from "./pages/ToolsPage";
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
                <Route path="/analysis" element={<AnalysisPage />} />
                <Route path="/brokerage" element={<BrokeragePage />} />
                <Route path="/crm" element={<CrmPage />} />
                <Route path="/crm/:clientId" element={<ClientDetailPage />} />
                <Route path="/mis" element={<MisPage />} />
                <Route path="/other-assets" element={<OtherAssetsPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/tools" element={<ToolsPage />} />
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
