import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export interface AnalysisSummary {
  totalAum: string;
  unclassifiedAum: string;
  assetAllocation: Array<{ assetClass: string; aum: string; folioCount: number; percentOfTotal: string }>;
  amcAllocation: Array<{ amcCode: string; amcName: string; aum: string; folioCount: number; percentOfTotal: string }>;
  topConcentration: Array<{
    clientId: string;
    clientName: string;
    schemeName: string;
    aum: string;
    percentOfTotal: string;
  }>;
  topClients: Array<{ clientId: string; clientName: string; aum: string; percentOfTotal: string }>;
  arnSplit: Array<{
    arnProfileId: string | null;
    arnNumber: string;
    isChild: boolean;
    aum: string;
    percentOfTotal: string;
  }>;
  activeSipMonthlyValue: string;
  valuedFolioCount: number;
}

/** arnProfileIds selects which onboarded ARN(s) to scope the summary to — omit (or pass none) for the merged "all ARNs" view. */
export function useAnalysisSummary(arnProfileIds: string[] = []) {
  return useQuery({
    queryKey: ["analysis-summary", [...arnProfileIds].sort()],
    queryFn: () =>
      apiClient.get<AnalysisSummary>(
        arnProfileIds.length > 0 ? `/analysis/summary?arnProfileIds=${arnProfileIds.join(",")}` : "/analysis/summary",
      ),
  });
}

export interface MonthlyVolumeRow {
  month: string;
  purchaseTotal: string;
  redemptionTotal: string;
  otherTotal: string;
  total: string;
  count: number;
}

export type MonthlyVolumeType = "purchase" | "redemption" | "other" | "all";

export interface MonthlyVolumeDrilldown {
  month: string;
  type: MonthlyVolumeType;
  clients: Array<{ clientId: string; clientName: string; amount: string; count: number }>;
  totalAmount: string;
  totalCount: number;
}

/** months should be one of [3, 6, 12, 24, 36] — the backend clamps anything else to 12. */
export function useMonthlyVolume(months: number, arnProfileIds: string[] = []) {
  return useQuery({
    queryKey: ["analysis-monthly-volume", months, [...arnProfileIds].sort()],
    queryFn: () => {
      const params = new URLSearchParams({ months: String(months) });
      if (arnProfileIds.length > 0) params.set("arnProfileIds", arnProfileIds.join(","));
      return apiClient.get<MonthlyVolumeRow[]>(`/analysis/monthly-volume?${params.toString()}`);
    },
  });
}

/** Enabled only while a drilldown target (month+type) is actually selected — pass month=null to disable. */
export function useMonthlyVolumeDrilldown(month: string | null, type: MonthlyVolumeType, arnProfileIds: string[] = []) {
  return useQuery({
    queryKey: ["analysis-monthly-volume-drilldown", month, type, [...arnProfileIds].sort()],
    queryFn: () => {
      const params = new URLSearchParams({ month: month!, type });
      if (arnProfileIds.length > 0) params.set("arnProfileIds", arnProfileIds.join(","));
      return apiClient.get<MonthlyVolumeDrilldown>(`/analysis/monthly-volume/drilldown?${params.toString()}`);
    },
    enabled: month !== null,
  });
}
