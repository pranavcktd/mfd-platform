import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export interface AnalysisSummary {
  totalAum: string;
  unclassifiedAum: string;
  assetAllocation: Array<{ assetClass: string; aum: string; folioCount: number; percentOfTotal: string }>;
  topConcentration: Array<{ clientName: string; schemeName: string; aum: string; percentOfTotal: string }>;
  activeSipMonthlyValue: string;
  valuedFolioCount: number;
}

export function useAnalysisSummary() {
  return useQuery({
    queryKey: ["analysis-summary"],
    queryFn: () => apiClient.get<AnalysisSummary>("/analysis/summary"),
  });
}
