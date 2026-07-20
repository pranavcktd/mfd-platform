import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export interface DashboardSummary {
  totalAum: string;
  totalClients: number;
  nonPanClients: number;
  monthlySipValue: string;
  activeSips: number;
  topAmcs: Array<{ amcCode: string; aum: string }>;
  topClients: Array<{ name: string; aum: string }>;
  recentClients: Array<{ name: string; transactionType: string | null; date: string }>;
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

export function useArnProfiles() {
  return useQuery({
    queryKey: ["arn-profiles"],
    queryFn: () => apiClient.get<ArnProfile[]>("/arn-profiles"),
  });
}
