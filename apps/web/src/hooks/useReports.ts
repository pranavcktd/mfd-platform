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

export function useTransactionsReport(page: number, type?: string, arnProfileIds?: string[], from?: string, to?: string) {
  return useQuery({
    queryKey: ["reports-transactions", page, type, arnProfileIds, from, to],
    queryFn: () =>
      apiClient.get<Paginated & { transactions: TransactionRow[] }>(
        `/reports/transactions${buildQuery({ page, type, from, to, arnProfileIds: arnQueryValue(arnProfileIds) })}`,
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
  taxCategory: "EQUITY" | "DEBT_OR_OTHER";
  stcgGain: string;
  ltcgGain: string;
  /** Null when the correct rate depends on the investor's income slab (debt-fund gains) rather than a flat statutory rate. */
  estimatedTax: string | null;
  /** Sum of gain where estimatedTax couldn't be computed (taxed at the investor's own slab rate). */
  taxNotComputableGain: string;
  /** True if any lot was purchased before Jan 31, 2018 and is eligible for equity grandfathering (Section 112A cost-basis floor). */
  grandfatheringNote: boolean;
  /** True if grandfathering was actually applied using a real backfilled Jan 31, 2018 NAV — false means the eligible lot's gain is still overstated pending a NAV backfill. */
  grandfatheringApplied: boolean;
  /** Only meaningful for the unrealized report — whether currentValue used today's live AMFI NAV or fell back to the RTA's own snapshot. */
  valuationSource?: "RTA" | "LIVE_NAV";
  asOfOrDate: string | null;
}

export interface CapitalGainsFilters {
  type: "realized" | "notional";
  arnProfileIds?: string[];
  clientId?: string;
  /** ISO date strings, April 1 - March 31 — only meaningful for realized (filters by sale date); ignored for notional. */
  fyStartDate?: string;
  fyEndDate?: string;
}

/**
 * `enabled: false` until a clientId is chosen — this report is only
 * generated on demand (client picked, financial year picked, "Generate"
 * clicked), not auto-fetched for the whole book on tab load like it used
 * to be.
 */
export function useCapitalGainsReport(filters: CapitalGainsFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["reports-capital-gains", filters],
    queryFn: () =>
      apiClient.get<CapitalGainRow[]>(
        `/reports/client/capital-gains${buildQuery({
          type: filters.type,
          arnProfileIds: arnQueryValue(filters.arnProfileIds),
          clientId: filters.clientId,
          fyStartDate: filters.fyStartDate,
          fyEndDate: filters.fyEndDate,
        })}`,
      ),
    enabled,
  });
}

export interface CapitalGainLotRow {
  folioId: string;
  clientId: string;
  clientName: string;
  folioNumber: string;
  schemeName: string | null;
  taxCategory: "EQUITY" | "DEBT_OR_OTHER";
  purchaseDate: string;
  /** Null for the notional (unrealized) report — a still-held lot has no sale date. */
  saleDate: string | null;
  units: string;
  costBasis: string;
  saleProceeds: string;
  gain: string;
  holdingDays: number;
  classification: "STCG" | "LTCG";
  estimatedTax: string | null;
  grandfatheringApplicable: boolean;
  grandfatheringApplied: boolean;
}

/**
 * One row per FIFO lot (not per folio) — the actual line-by-line breakdown
 * needed for ITR Schedule 112A/CG filing, where the folio-aggregated
 * `useCapitalGainsReport` only gives a quick overview.
 */
export function useCapitalGainsDetailReport(filters: CapitalGainsFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["reports-capital-gains-detail", filters],
    queryFn: () =>
      apiClient.get<CapitalGainLotRow[]>(
        `/reports/client/capital-gains/detail${buildQuery({
          type: filters.type,
          arnProfileIds: arnQueryValue(filters.arnProfileIds),
          clientId: filters.clientId,
          fyStartDate: filters.fyStartDate,
          fyEndDate: filters.fyEndDate,
        })}`,
      ),
    enabled,
  });
}

export interface ClientTransactionDateRange {
  minDate: string | null;
  maxDate: string | null;
}

export function useClientTransactionDateRange(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-transaction-date-range", clientId],
    queryFn: () => apiClient.get<ClientTransactionDateRange>(`/reports/client/${clientId}/transaction-date-range`),
    enabled: !!clientId,
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

export function useSipDueReport(arnProfileIds?: string[], withinDays?: number) {
  return useQuery({
    queryKey: ["reports-sip-due", arnProfileIds, withinDays],
    queryFn: () => apiClient.get<SipDueRow[]>(`/reports/distributor/sip-due${buildQuery({ withinDays, arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export interface SipExpiringRow {
  id: string;
  clientName: string;
  folioNumber: string;
  sipAmount: string | null;
  endDate: string | null;
}

export function useSipExpiringReport(arnProfileIds?: string[], withinDays?: number) {
  return useQuery({
    queryKey: ["reports-sip-expiring", arnProfileIds, withinDays],
    queryFn: () => apiClient.get<SipExpiringRow[]>(`/reports/distributor/sip-expiring${buildQuery({ withinDays, arnProfileIds: arnQueryValue(arnProfileIds) })}`),
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

export interface ClientReturnFolioRow {
  folioId: string;
  folioNumber: string;
  schemeName: string | null;
  amcCode: string;
  schemeCode: string;
  xirr: string | null;
  currentValue: string;
  invested: string;
  dayChangeAmount: string | null;
  dayChangePercent: string | null;
}

export interface ClientReturnRow {
  clientId: string;
  clientName: string;
  xirr: string | null;
  currentValue: string;
  totalInvested: string;
  /** Sum of scheme-wise day-changes — null until at least 2 days of real AMFI NAV history have accumulated for this client's schemes. */
  dayChangeAmount: string | null;
  folios: ClientReturnFolioRow[];
}

export function useClientReturnsReport(arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["reports-client-returns", arnProfileIds],
    queryFn: () =>
      apiClient.get<ClientReturnRow[]>(`/reports/distributor/client-returns${buildQuery({ arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}
