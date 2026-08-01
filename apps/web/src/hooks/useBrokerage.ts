import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export interface BrokerageFilters {
  from?: string;
  to?: string;
  amcCode?: string;
  clientId?: string;
  arnProfileIds?: string[];
}

export interface BrokerageSummary {
  totalBrokerage: string;
  transactionsWithBrokerage: number;
  byAmc: Array<{ amcCode: string; amcName: string; total: string; count: number }>;
}

export interface BrokerageTransactionRow {
  id: string;
  clientId: string;
  clientName: string;
  folioNumber: string;
  amcCode: string;
  schemeName: string | null;
  transactionDescription: string;
  transactionDate: string;
  amount: string | null;
  brokeragePercent: string | null;
  brokerageAmount: string | null;
}

function buildParams(filters: BrokerageFilters, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.amcCode) params.set("amcCode", filters.amcCode);
  if (filters.clientId) params.set("clientId", filters.clientId);
  if (filters.arnProfileIds && filters.arnProfileIds.length > 0) params.set("arnProfileIds", filters.arnProfileIds.join(","));
  return params.toString();
}

export function useBrokerageSummary(filters: BrokerageFilters) {
  return useQuery({
    queryKey: ["brokerage-summary", filters],
    queryFn: () => apiClient.get<BrokerageSummary>(`/reports/brokerage/summary?${buildParams(filters)}`),
  });
}

export function useBrokerageTransactions(page: number, filters: BrokerageFilters) {
  return useQuery({
    queryKey: ["brokerage-transactions", page, filters],
    queryFn: () =>
      apiClient.get<{ total: number; page: number; pageSize: number; transactions: BrokerageTransactionRow[] }>(
        `/reports/brokerage/transactions?${buildParams(filters, { page: String(page) })}`,
      ),
  });
}
