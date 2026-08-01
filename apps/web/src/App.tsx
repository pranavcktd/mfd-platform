import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { SuperAdminGuard } from "./components/layout/SuperAdminGuard";
import { SuperAdminShell } from "./components/layout/SuperAdminShell";
import { LoginPage } from "./pages/LoginPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { CrmPage } from "./pages/CrmPage";
import { ClientDetailPage } from "./pages/ClientDetailPage";
import { FamilyMasterPage } from "./pages/FamilyMasterPage";
import { MisPage } from "./pages/MisPage";
import { ReportsPage } from "./pages/ReportsPage";
import { OtherAssetsPage } from "./pages/OtherAssetsPage";
import { BrokeragePage } from "./pages/BrokeragePage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { ToolsPage } from "./pages/ToolsPage";
import { RtaSyncSettingsPage } from "./pages/RtaSyncSettingsPage";
import { ImportExternalDataPage } from "./pages/ImportExternalDataPage";
import { SuperAdminLoginPage } from "./pages/SuperAdminLoginPage";
import { SuperAdminMfdListPage } from "./pages/SuperAdminMfdListPage";
import { SuperAdminOnboardPage } from "./pages/SuperAdminOnboardPage";
import { SuperAdminMailSyncPage } from "./pages/SuperAdminMailSyncPage";
import { SuperAdminFolderImportPage } from "./pages/SuperAdminFolderImportPage";
import { SuperAdminEquityMasterPage } from "./pages/SuperAdminEquityMasterPage";
import { SuperAdminStatusPage } from "./pages/SuperAdminStatusPage";
import { SuperAdminAuditLogPage } from "./pages/SuperAdminAuditLogPage";
import { SuperAdminSettingsPage } from "./pages/SuperAdminSettingsPage";
import { ClientPortalGuard } from "./components/layout/ClientPortalGuard";
import { ClientPortalShell } from "./components/layout/ClientPortalShell";
import { ClientPortalLoginPage } from "./pages/ClientPortalLoginPage";
import { ClientPortalDashboardPage } from "./pages/ClientPortalDashboardPage";
import { ClientPortalHoldingsPage } from "./pages/ClientPortalHoldingsPage";
import { ClientPortalTransactionsPage } from "./pages/ClientPortalTransactionsPage";
import { ClientPortalProfilePage } from "./pages/ClientPortalProfilePage";
import { ClientPortalFamilyMemberPage } from "./pages/ClientPortalFamilyMemberPage";
import { NAV_ITEMS } from "./lib/nav-config";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePasswordPage />
          </ProtectedRoute>
        }
      />
      <Route path="/super-admin/login" element={<SuperAdminLoginPage />} />
      <Route
        path="/super-admin/*"
        element={
          <SuperAdminGuard>
            <SuperAdminShell>
              <Routes>
                <Route path="/" element={<SuperAdminMfdListPage />} />
                <Route path="/onboard" element={<SuperAdminOnboardPage />} />
                <Route path="/mail-sync" element={<SuperAdminMailSyncPage />} />
                <Route path="/folder-import" element={<SuperAdminFolderImportPage />} />
                <Route path="/equity-master" element={<SuperAdminEquityMasterPage />} />
                <Route path="/status" element={<SuperAdminStatusPage />} />
                <Route path="/audit-log" element={<SuperAdminAuditLogPage />} />
                <Route path="/settings" element={<SuperAdminSettingsPage />} />
              </Routes>
            </SuperAdminShell>
          </SuperAdminGuard>
        }
      />
      <Route path="/client-portal/login" element={<ClientPortalLoginPage />} />
      <Route
        path="/client-portal/*"
        element={
          <ClientPortalGuard>
            <ClientPortalShell>
              <Routes>
                <Route path="/" element={<ClientPortalDashboardPage />} />
                <Route path="/holdings" element={<ClientPortalHoldingsPage />} />
                <Route path="/transactions" element={<ClientPortalTransactionsPage />} />
                <Route path="/profile" element={<ClientPortalProfilePage />} />
                <Route path="/family/:memberId" element={<ClientPortalFamilyMemberPage />} />
              </Routes>
            </ClientPortalShell>
          </ClientPortalGuard>
        }
      />
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
                <Route path="/crm/families" element={<FamilyMasterPage />} />
                <Route path="/crm/:clientId" element={<ClientDetailPage />} />
                <Route path="/mis" element={<MisPage />} />
                <Route path="/other-assets" element={<OtherAssetsPage />} />
                <Route path="/import-external-data" element={<ImportExternalDataPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/tools" element={<ToolsPage />} />
                <Route path="/settings/rta-sync" element={<RtaSyncSettingsPage />} />
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
