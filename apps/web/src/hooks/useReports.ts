import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export interface AumRow {
  amcCode: string;
  sampleSchemeName: string | null;
  folioCount: number;
  aum: string;
}

export interface TransactionRow {
  id: string;
  clientName: string;
  folioNumber: string;
  amcCode: string;
  schemeCode: string;
  schemeName: string | null;
  transactionType: string;
  transactionDescription: string | null;
  transactionDate: string;
  amount: string | null;
  units: string | null;
  brokerageAmount: string | null;
}

export interface SipRow {
  id: string;
  clientName: string;
  folioNumber: string;
  amcCode: string;
  schemeCode: string | null;
  sipAmount: string | null;
  frequency: string | null;
  registrationDate: string;
  startDate: string | null;
  endDate: string | null;
  ceaseDate: string | null;
  isActive: boolean;
}

export interface HoldingRow {
  id: string;
  clientName: string;
  folioNumber: string;
  amcCode: string;
  schemeCode: string;
  schemeName: string | null;
  assetClass: string | null;
  balanceUnits: string | null;
  navPerUnit: string | null;
  valuationAmount: string | null;
  balanceAsOfDate: string | null;
}

export interface NetWorthRow {
  id: string;
  name: string;
  mfAum: string;
  otherAssetsTotal: string;
  netWorth: string;
}

export interface ValuationClientRow {
  id: string;
  name: string;
  subtotal: string;
  folios: Array<{
    folioNumber: string;
    amcCode: string;
    schemeCode: string;
    schemeName: string | null;
    balanceUnits: string | null;
    navPerUnit: string | null;
    valuationAmount: string | null;
    balanceAsOfDate: string | null;
  }>;
}

interface Paginated {
  total: number;
  page: number;
  pageSize: number;
}

export function useAumReport() {
  return useQuery({ queryKey: ["reports-aum"], queryFn: () => apiClient.get<AumRow[]>("/reports/aum") });
}

export function useTransactionsReport(page: number, type?: string) {
  return useQuery({
    queryKey: ["reports-transactions", page, type],
    queryFn: () =>
      apiClient.get<Paginated & { transactions: TransactionRow[] }>(
        `/reports/transactions?page=${page}${type ? `&type=${encodeURIComponent(type)}` : ""}`,
      ),
  });
}

export function useSipReport(page: number, status?: "new" | "active" | "ceased") {
  return useQuery({
    queryKey: ["reports-sip", page, status],
    queryFn: () =>
      apiClient.get<Paginated & { sips: SipRow[] }>(
        `/reports/sip?page=${page}${status ? `&status=${status}` : ""}`,
      ),
  });
}

export function useHoldingsReport(page: number) {
  return useQuery({
    queryKey: ["reports-holdings", page],
    queryFn: () => apiClient.get<Paginated & { holdings: HoldingRow[] }>(`/reports/holdings?page=${page}`),
  });
}

export function useNetWorthReport(page: number) {
  return useQuery({
    queryKey: ["reports-net-worth", page],
    queryFn: () =>
      apiClient.get<Paginated & { clients: NetWorthRow[] }>(`/reports/net-worth?page=${page}`),
  });
}

export function useValuationReport(page: number) {
  return useQuery({
    queryKey: ["reports-valuation", page],
    queryFn: () =>
      apiClient.get<Paginated & { clients: ValuationClientRow[] }>(`/reports/valuation?page=${page}`),
  });
}
