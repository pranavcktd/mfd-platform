import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export interface ClientListItem {
  id: string;
  name: string;
  panNumber: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  folioCount: number;
  totalAum: string;
  totalInvested: string;
  needsReview: boolean;
}

export interface ClientNominee {
  id: string;
  nomineeName: string;
  relation: string | null;
  email: string | null;
  mobile: string | null;
  source: string;
}

export interface ClientBankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string | null;
  branchName: string | null;
  source: string;
}

export interface ClientListResponse {
  total: number;
  page: number;
  pageSize: number;
  clients: ClientListItem[];
}

export interface SourceMailInfo {
  subject: string | null;
  fromAddress: string;
  receivedAt: string | null;
  rtaType: string;
}

export interface ClientFolio {
  id: string;
  amcCode: string;
  amcName: string;
  folioNumber: string;
  schemeCode: string;
  schemeName: string | null;
  assetClass: string | null;
  balanceUnits: string | null;
  /** RTA-reported snapshot — only as fresh as the last balance report for this folio. */
  valuationAmount: string | null;
  investedAmount: string;
  navPerUnit: string | null;
  balanceAsOfDate: string | null;
  /** Independently computed from today's real AMFI NAV — null when this scheme hasn't been matched to a live NAV yet. */
  liveNav: string | null;
  liveNavDate: string | null;
  liveValue: string | null;
  activeSips: number;
  source: string;
  transactionCount: number;
  /** Which real mail/file the current balance snapshot came from — null for CAS-imported folios and balances last touched before this field existed. */
  balanceSourceMail: SourceMailInfo | null;
}

export interface ClientOtherAsset {
  id: string;
  assetType: string;
  description: string | null;
  value: string;
  asOfDate: string;
  details: Record<string, unknown> | null;
}

export interface ClientTransaction {
  id: string;
  schemeName: string | null;
  folioNumber: string;
  amcCode: string;
  schemeCode: string;
  transactionType: string;
  transactionDescription: string | null;
  transactionDate: string;
  amount: string | null;
  units: string | null;
  navPerUnit: string | null;
  brokerageAmount: string | null;
  isRejection: boolean;
  rejectionReason?: string | null;
  source: string;
  sourceMail?: SourceMailInfo | null;
}

export interface FolioTransaction {
  id: string;
  transactionType: string;
  transactionTypeCode: string | null;
  transactionDescription: string | null;
  transactionDate: string;
  amount: string | null;
  units: string | null;
  navPerUnit: string | null;
  isRejection: boolean;
  rejectionReason?: string | null;
  source: string;
  sourceMail?: SourceMailInfo | null;
}

export interface ClientDetail {
  id: string;
  name: string;
  panNumber: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  kycStatus: string | null;
  familyId: string | null;
  familyName: string | null;
  isFamilyHead: boolean;
  address1: string | null;
  address2: string | null;
  city: string | null;
  pincode: string | null;
  taxStatus: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankAccounts: ClientBankAccount[];
  nominees: ClientNominee[];
  needsReview: boolean;
  reviewReason: string | null;
  portalEnabled: boolean;
  createdAt: string;
  folios: ClientFolio[];
  otherAssets: ClientOtherAsset[];
}

export interface Family {
  id: string;
  familyName: string;
  headClientId: string | null;
  members: Array<{ id: string; name: string }>;
}

export function useClientList(
  search: string,
  page: number,
  filters?: { amcCode?: string; assetClass?: string; arnProfileIds?: string[] },
) {
  return useQuery({
    queryKey: ["crm-clients", search, page, filters],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      if (filters?.amcCode) params.set("amcCode", filters.amcCode);
      if (filters?.assetClass) params.set("assetClass", filters.assetClass);
      if (filters?.arnProfileIds && filters.arnProfileIds.length > 0) params.set("arnProfileIds", filters.arnProfileIds.join(","));
      return apiClient.get<ClientListResponse>(`/crm/clients?${params.toString()}`);
    },
  });
}

export function useClientDetail(clientId: string | undefined) {
  return useQuery({
    queryKey: ["crm-client", clientId],
    queryFn: () => apiClient.get<ClientDetail>(`/crm/clients/${clientId}`),
    enabled: Boolean(clientId),
  });
}

export function useClientTransactions(clientId: string | undefined, page: number, search?: string) {
  return useQuery({
    queryKey: ["crm-client-transactions", clientId, page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      return apiClient.get<{ total: number; page: number; pageSize: number; transactions: ClientTransaction[] }>(
        `/crm/clients/${clientId}/transactions?${params.toString()}`,
      );
    },
    enabled: Boolean(clientId),
  });
}

export function useFolioTransactions(clientId: string | undefined, folioId: string | null) {
  return useQuery({
    queryKey: ["crm-folio-transactions", clientId, folioId],
    queryFn: () => apiClient.get<FolioTransaction[]>(`/crm/clients/${clientId}/folios/${folioId}/transactions`),
    enabled: Boolean(clientId && folioId),
  });
}

export function useAddNominee(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { nomineeName: string; relation?: string; email?: string; mobile?: string }) =>
      apiClient.post(`/crm/clients/${clientId}/nominees`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-client", clientId] }),
  });
}

export function useRemoveNominee(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nomineeId: string) => apiClient.delete(`/crm/clients/${clientId}/nominees/${nomineeId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-client", clientId] }),
  });
}

export function useAddBankAccount(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { bankName: string; accountNumber: string; ifscCode?: string; branchName?: string }) =>
      apiClient.post(`/crm/clients/${clientId}/bank-accounts`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-client", clientId] }),
  });
}

export function useRemoveBankAccount(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bankAccountId: string) => apiClient.delete(`/crm/clients/${clientId}/bank-accounts/${bankAccountId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-client", clientId] }),
  });
}

export function useMarkReviewed(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.patch(`/crm/clients/${clientId}/mark-reviewed`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-client", clientId] });
      queryClient.invalidateQueries({ queryKey: ["crm-clients"] });
      queryClient.invalidateQueries({ queryKey: ["mis-summary"] });
    },
  });
}

export function useMergeClients() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { sourceClientId: string; targetClientId: string }) =>
      apiClient.post("/crm/clients/merge", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-clients"] }),
  });
}

export function useCreatePortalLogin(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ loginId: string; initialPassword: string; welcomeEmailSent: boolean; welcomeEmailError?: string }>(
        `/crm/clients/${clientId}/portal-login`,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-client", clientId] }),
  });
}

export function useDisablePortalLogin(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.patch(`/crm/clients/${clientId}/portal-login/disable`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-client", clientId] }),
  });
}

export function useResetClientPortalPassword(clientId: string) {
  return useMutation({
    mutationFn: () =>
      apiClient.patch<{ loginId: string; newPassword: string }>(`/crm/clients/${clientId}/portal-login/reset-password`),
  });
}

export function useFamilies() {
  return useQuery({
    queryKey: ["crm-families"],
    queryFn: () => apiClient.get<Family[]>("/crm/families"),
  });
}

export function useCreateFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { familyName: string; headClientId: string; memberClientIds: string[] }) =>
      apiClient.post<Family>("/crm/families", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-families"] }),
  });
}

export function useUpdateFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ familyId, familyName }: { familyId: string; familyName: string }) =>
      apiClient.patch(`/crm/families/${familyId}`, { familyName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-families"] }),
  });
}

export function useRemoveFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (familyId: string) => apiClient.delete(`/crm/families/${familyId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-families"] }),
  });
}

export function useAddFamilyMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ familyId, clientId }: { familyId: string; clientId: string }) =>
      apiClient.post(`/crm/families/${familyId}/members`, { clientId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-families"] }),
  });
}

export function useSetFamilyHead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ familyId, clientId }: { familyId: string; clientId: string }) =>
      apiClient.patch(`/crm/families/${familyId}/head`, { clientId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-families"] }),
  });
}

export function useRemoveFamilyMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => apiClient.patch(`/crm/clients/${clientId}/remove-from-family`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-families"] }),
  });
}
