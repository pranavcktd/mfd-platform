import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export interface AumChange {
  amount: string | null;
  percent: string | null;
  /** The nearest real trading day's NAV on/before the target date that was actually compared against — AMFI doesn't publish on weekends/holidays. */
  asOfDate: string | null;
  /** % of live-NAV-matched AUM that also has historical NAV coverage for this comparison — null when there's no live-NAV-matched AUM at all. */
  coveragePercent: string | null;
}

export interface LastRtaImport {
  rtaType: string;
  receivedAt: string | null;
  /** When the mail actually finished processing to COMPLETED, not when it arrived — the real "data last imported" moment. Null if this RTA type has been seen (e.g. a failed attempt) but never successfully completed. */
  importedAt: string | null;
}

export interface NavStatus {
  /** The NAV's own value date (e.g. the "05-Aug-2026" embedded in AMFI's file) — distinct from when we fetched it. */
  valueDate: string | null;
  /** When the daily NAV sync last completed successfully — platform-wide, not distributor-scoped. */
  syncedAt: string | null;
}

export interface DashboardSummary {
  totalAum: string;
  /** Independently computed from today's real AMFI NAV, not the RTA's own (often weeks-stale) snapshot — null when no folio's scheme has been matched to a live NAV yet. */
  liveAum: string | null;
  /** AUM whose folio has no assetClass captured yet — same definition the Analysis module uses. */
  unclassifiedAum: string;
  dayChangeAum: AumChange;
  monthChangeAum: AumChange;
  /** One entry per RTA type actually seen (CAMS, KFintech, ...) — never a single merged figure, since the two run independently and can fall out of sync with each other. */
  lastRtaImports: LastRtaImport[];
  navStatus: NavStatus;
  totalClients: number;
  nonPanClients: number;
  monthlySipValue: string;
  activeSips: number;
  topAmcs: Array<{ amcCode: string; amcName: string; aum: string }>;
  topClients: Array<{ name: string; aum: string }>;
}

export interface RecentClientRow {
  id: string;
  name: string;
  panNumber: string | null;
  createdAt: string;
  arnNumbers: string[];
}

export interface ArnProfile {
  id: string;
  arnNumber: string;
  arnHolderName: string;
  displayName: string | null;
  parentArnProfileId: string | null;
}

/** arnProfileIds selects which onboarded ARN(s) to scope the summary to — omit (or pass none) for the merged "all ARNs" view. */
export function useDashboardSummary(arnProfileIds: string[]) {
  return useQuery({
    queryKey: ["dashboard-summary", [...arnProfileIds].sort()],
    queryFn: () =>
      apiClient.get<DashboardSummary>(
        arnProfileIds.length > 0 ? `/dashboard/summary?arnProfileIds=${arnProfileIds.join(",")}` : "/dashboard/summary",
      ),
  });
}

export function useRecentClients(arnProfileIds: string[], page: number) {
  return useQuery({
    queryKey: ["dashboard-recent-clients", [...arnProfileIds].sort(), page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (arnProfileIds.length > 0) params.set("arnProfileIds", arnProfileIds.join(","));
      return apiClient.get<{ total: number; page: number; pageSize: number; clients: RecentClientRow[] }>(
        `/dashboard/recent-clients?${params.toString()}`,
      );
    },
  });
}

/** Powers the dashboard's AUM-change date filter beyond the default Day/Month cards — pass any look-back in calendar days. */
export function useAumChange(days: number, arnProfileIds: string[]) {
  return useQuery({
    queryKey: ["dashboard-aum-change", days, [...arnProfileIds].sort()],
    queryFn: () => {
      const params = new URLSearchParams({ days: String(days) });
      if (arnProfileIds.length > 0) params.set("arnProfileIds", arnProfileIds.join(","));
      return apiClient.get<AumChange>(`/dashboard/aum-change?${params.toString()}`);
    },
  });
}

export interface UnclassifiedFolioRow {
  folioId: string;
  clientId: string;
  clientName: string;
  panNumber: string | null;
  folioNumber: string;
  amcCode: string;
  schemeCode: string;
  schemeName: string | null;
  valuationAmount: string;
}

/** Backs the Dashboard's "Unclassified AUM" detail view — PAN/folio/scheme-wise, only fetched when the detail modal is actually opened. */
export function useUnclassifiedFolios(arnProfileIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["dashboard-unclassified-folios", [...arnProfileIds].sort()],
    queryFn: () =>
      apiClient.get<UnclassifiedFolioRow[]>(
        arnProfileIds.length > 0
          ? `/dashboard/unclassified-folios?arnProfileIds=${arnProfileIds.join(",")}`
          : "/dashboard/unclassified-folios",
      ),
    enabled,
  });
}

export function useArnProfiles() {
  return useQuery({
    queryKey: ["arn-profiles"],
    queryFn: () => apiClient.get<ArnProfile[]>("/arn-profiles"),
  });
}
