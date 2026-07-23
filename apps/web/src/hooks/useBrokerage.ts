import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export interface BrokerageSummary {
  totalBrokerage: string;
  transactionsWithBrokerage: number;
  byAmc: Array<{ amcCode: string; total: string; count: number }>;
}

export interface BrokerageTransactionRow {
  id: string;
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

export function useBrokerageSummary() {
  return useQuery({
    queryKey: ["brokerage-summary"],
    queryFn: () => apiClient.get<BrokerageSummary>("/reports/brokerage/summary"),
  });
}

export function useBrokerageTransactions(page: number) {
  return useQuery({
    queryKey: ["brokerage-transactions", page],
    queryFn: () =>
      apiClient.get<{ total: number; page: number; pageSize: number; transactions: BrokerageTransactionRow[] }>(
        `/reports/brokerage/transactions?page=${page}`,
      ),
  });
}
