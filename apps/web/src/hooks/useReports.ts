import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export interface AumRow {
  amcCode: string;
  amcName: string;
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
  isRejection: boolean;
  source: string;
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

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function arnQueryValue(arnProfileIds?: string[]): string | undefined {
  return arnProfileIds && arnProfileIds.length > 0 ? arnProfileIds.join(",") : undefined;
}

export function useAumReport(arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-aum", arnProfileIds],
    queryFn: () => apiClient.get<AumRow[]>(`/reports/aum${buildQuery({ arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export function useTransactionsReport(page: number, type?: string, arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-transactions", page, type, arnProfileIds],
    queryFn: () =>
      apiClient.get<Paginated & { transactions: TransactionRow[] }>(
        `/reports/transactions${buildQuery({ page, type, arnProfileIds: arnQueryValue(arnProfileIds) })}`,
      ),
  });
}

export function useSipReport(page: number, status?: "new" | "active" | "ceased", arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-sip", page, status, arnProfileIds],
    queryFn: () =>
      apiClient.get<Paginated & { sips: SipRow[] }>(
        `/reports/sip${buildQuery({ page, status, arnProfileIds: arnQueryValue(arnProfileIds) })}`,
      ),
  });
}

export function useHoldingsReport(page: number, arnProfileIds?: string[], search?: string) {
  return useQuery({
    queryKey: ["reports-holdings", page, arnProfileIds, search],
    queryFn: () =>
      apiClient.get<Paginated & { holdings: HoldingRow[] }>(
        `/reports/holdings${buildQuery({ page, search, arnProfileIds: arnQueryValue(arnProfileIds) })}`,
      ),
  });
}

export function useNetWorthReport(page: number, arnProfileIds?: string[], search?: string) {
  return useQuery({
    queryKey: ["reports-net-worth", page, arnProfileIds, search],
    queryFn: () =>
      apiClient.get<Paginated & { clients: NetWorthRow[] }>(
        `/reports/net-worth${buildQuery({ page, search, arnProfileIds: arnQueryValue(arnProfileIds) })}`,
      ),
  });
}

export function useValuationReport(page: number, arnProfileIds?: string[], search?: string) {
  return useQuery({
    queryKey: ["reports-valuation", page, arnProfileIds, search],
    queryFn: () =>
      apiClient.get<Paginated & { clients: ValuationClientRow[] }>(
        `/reports/valuation${buildQuery({ page, search, arnProfileIds: arnQueryValue(arnProfileIds) })}`,
      ),
  });
}

export interface FamilyAllocationRow {
  familyId: string | null;
  familyName: string;
  memberCount: number;
  aum: string;
  percentOfTotal: string;
}

export function useFamilyAllocationReport(arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-family-allocation", arnProfileIds],
    queryFn: () =>
      apiClient.get<FamilyAllocationRow[]>(`/reports/client/family-allocation${buildQuery({ arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export interface CasFolioRow {
  id: string;
  clientId: string;
  clientName: string;
  folioNumber: string;
  amcCode: string;
  schemeName: string | null;
  valuationAmount: string | null;
  transactionCount: number;
}

export function useCasReport(page: number, arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-cas", page, arnProfileIds],
    queryFn: () =>
      apiClient.get<Paginated & { folios: CasFolioRow[] }>(`/reports/client/cas${buildQuery({ page, arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export interface CapitalGainRow {
  folioId: string;
  clientId: string;
  clientName: string;
  folioNumber: string;
  schemeName: string | null;
  realizedGain?: string;
  unrealizedGain?: string;
  asOfOrDate: string | null;
}

export function useCapitalGainsReport(type: "realized" | "notional", arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-capital-gains", type, arnProfileIds],
    queryFn: () =>
      apiClient.get<CapitalGainRow[]>(`/reports/client/capital-gains${buildQuery({ type, arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export interface BusinessDevelopmentRow {
  month: string;
  newClients: number;
  newInflowAmount: string;
}

export function useBusinessDevelopmentReport(arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-business-development", arnProfileIds],
    queryFn: () =>
      apiClient.get<BusinessDevelopmentRow[]>(`/reports/distributor/business-development${buildQuery({ arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export interface DividendRow {
  id: string;
  clientName: string;
  folioNumber: string;
  schemeName: string | null;
  transactionType: string;
  transactionDate: string;
  amount: string | null;
  units: string | null;
}

export function useDividendReport(page: number, arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-dividend", page, arnProfileIds],
    queryFn: () =>
      apiClient.get<Paginated & { transactions: DividendRow[] }>(`/reports/distributor/dividend${buildQuery({ page, arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export interface SipDueRow {
  id: string;
  clientName: string;
  folioNumber: string;
  sipAmount: string | null;
  estimatedNextDueDate: string;
}

export function useSipDueReport(arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-sip-due", arnProfileIds],
    queryFn: () => apiClient.get<SipDueRow[]>(`/reports/distributor/sip-due${buildQuery({ arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export interface SipExpiringRow {
  id: string;
  clientName: string;
  folioNumber: string;
  sipAmount: string | null;
  endDate: string | null;
}

export function useSipExpiringReport(arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-sip-expiring", arnProfileIds],
    queryFn: () => apiClient.get<SipExpiringRow[]>(`/reports/distributor/sip-expiring${buildQuery({ arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export interface SwitchTransactionRow {
  id: string;
  clientName: string;
  folioNumber: string;
  schemeName: string | null;
  transactionType: string;
  transactionDate: string;
  amount: string | null;
  units: string | null;
}

export function useStpReport(page: number, arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-stp", page, arnProfileIds],
    queryFn: () =>
      apiClient.get<Paginated & { transactions: SwitchTransactionRow[] }>(`/reports/distributor/stp${buildQuery({ page, arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export function useSwpReport(page: number, arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-swp", page, arnProfileIds],
    queryFn: () =>
      apiClient.get<Paginated & { transactions: SwitchTransactionRow[] }>(`/reports/distributor/swp${buildQuery({ page, arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export interface TransactionSummaryRow {
  transactionType: string;
  count: number;
  totalAmount: string;
}

export function useTransactionSummaryReport(arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-transaction-summary", arnProfileIds],
    queryFn: () =>
      apiClient.get<TransactionSummaryRow[]>(`/reports/distributor/transaction-summary${buildQuery({ arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export interface BrokerageWithheldRow {
  id: string;
  clientId: string | null;
  folioNumber: string;
  investorName: string | null;
  investorPan: string | null;
  amcCode: string | null;
  schemeCode: string | null;
  kycStatusAtWithholding: string | null;
  trailFeeWithheld: string | null;
  transactionIncentiveWithheld: string | null;
  upfrontWithheld: string | null;
  processedDate: string | null;
  reportDate: string;
}

export function useBrokerageWithheldReport(page: number, arnProfileIds?: string[], search?: string) {
  return useQuery({
    queryKey: ["reports-brokerage-withheld", page, arnProfileIds, search],
    queryFn: () =>
      apiClient.get<
        Paginated & {
          rows: BrokerageWithheldRow[];
          totalTrailFeeWithheld: string;
          totalTransactionIncentiveWithheld: string;
          totalUpfrontWithheld: string;
        }
      >(`/reports/distributor/brokerage-withheld${buildQuery({ page, search, arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export interface SipStpExpiringCamsRow {
  id: string;
  clientId: string | null;
  folioNumber: string;
  refNumber: string | null;
  investorName: string | null;
  schemeName: string | null;
  toSchemeName: string | null;
  transactionType: string | null;
  amount: string | null;
  units: string | null;
  expiryDate: string | null;
  taxStatus: string | null;
}

export function useSipStpExpiringCamsReport(page: number, arnProfileIds?: string[], search?: string) {
  return useQuery({
    queryKey: ["reports-sip-stp-expiring-cams", page, arnProfileIds, search],
    queryFn: () =>
      apiClient.get<Paginated & { rows: SipStpExpiringCamsRow[] }>(
        `/reports/distributor/sip-stp-expiring-cams${buildQuery({ page, search, arnProfileIds: arnQueryValue(arnProfileIds) })}`,
      ),
  });
}

export interface ClientReturnRow {
  clientId: string;
  clientName: string;
  xirr: string | null;
  currentValue: string;
  totalInvested: string;
}

export function useClientReturnsReport(arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-client-returns", arnProfileIds],
    queryFn: () =>
      apiClient.get<ClientReturnRow[]>(`/reports/distributor/client-returns${buildQuery({ arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}
