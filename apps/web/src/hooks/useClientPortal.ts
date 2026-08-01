import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { clearClientToken, clientPortalApiClient, setClientToken } from "../lib/client-portal-api-client";

export interface ClientPortalFolio {
  id: string;
  schemeName: string | null;
  amcCode: string;
  amcName: string;
  folioNumber: string;
  schemeCode: string;
  assetClass: string | null;
  balanceUnits: string | null;
  valuationAmount: string | null;
  investedAmount: string;
  navPerUnit: string | null;
  balanceAsOfDate: string | null;
  activeSips: number;
  source: string;
}

export interface ClientPortalFolioTransaction {
  id: string;
  transactionType: string;
  transactionTypeCode: string | null;
  transactionDescription: string | null;
  transactionDate: string;
  amount: string | null;
  units: string | null;
  navPerUnit: string | null;
  isRejection: boolean;
  source: string;
}

export interface ClientPortalNominee {
  id: string;
  nomineeName: string;
  relation: string | null;
  email: string | null;
  mobile: string | null;
  source: string;
}

export interface ClientPortalBankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string | null;
  branchName: string | null;
  source: string;
}

export interface ClientPortalOtherAsset {
  id: string;
  assetType: string;
  description: string | null;
  value: string;
  asOfDate: string;
  details: Record<string, unknown> | null;
}

export interface ClientPortalTransaction {
  id: string;
  transactionType: string;
  transactionDescription: string | null;
  transactionDate: string;
  amount: string | null;
  units: string | null;
  schemeName: string | null;
  folioNumber: string;
  isRejection: boolean;
  source: string;
}

export interface ClientPortalMe {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  panNumber: string | null;
  dateOfBirth: string | null;
  kycStatus: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  pincode: string | null;
  taxStatus: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankAccounts: ClientPortalBankAccount[];
  nominees: ClientPortalNominee[];
  familyName: string | null;
  isFamilyHead: boolean;
  mustChangePassword: boolean;
  totalAum: string;
  assetAllocation: Array<{ assetClass: string; aum: string; percentOfTotal: string }>;
  folios: ClientPortalFolio[];
  otherAssets: ClientPortalOtherAsset[];
  recentTransactions: ClientPortalTransaction[];
  familyMembers: Array<{ id: string; name: string; totalAum: string; isSelf: boolean }> | null;
}

export interface ClientPortalFamilyMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  panNumber: string | null;
  totalAum: string;
  folios: ClientPortalFolio[];
}

export function useClientPortalLogin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { panNumber: string; password: string }) =>
      clientPortalApiClient.post<{ accessToken: string; mustChangePassword: boolean }>("/client-auth/login", input),
    onSuccess: (data) => {
      setClientToken(data.accessToken);
      queryClient.invalidateQueries({ queryKey: ["client-portal-me"] });
      // Always lands in the portfolio, even on a still-default password —
      // changing it is optional, reachable from the Profile page.
      navigate("/client-portal");
    },
  });
}

export function useClientPortalChangePassword() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      clientPortalApiClient.patch("/client-auth/change-password", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-portal-me"] });
      navigate("/client-portal");
    },
  });
}

export function useClientPortalLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return () => {
    clearClientToken();
    queryClient.clear();
    navigate("/client-portal/login");
  };
}

export function useClientPortalMe() {
  return useQuery({
    queryKey: ["client-portal-me"],
    queryFn: () => clientPortalApiClient.get<ClientPortalMe>("/client/me"),
  });
}

export function useClientPortalFamilyMember(memberId: string | undefined) {
  return useQuery({
    queryKey: ["client-portal-family-member", memberId],
    queryFn: () => clientPortalApiClient.get<ClientPortalFamilyMember>(`/client/family/${memberId}`),
    enabled: Boolean(memberId),
  });
}

export function useClientPortalFolioTransactions(folioId: string | null) {
  return useQuery({
    queryKey: ["client-portal-folio-transactions", folioId],
    queryFn: () => clientPortalApiClient.get<ClientPortalFolioTransaction[]>(`/client/folios/${folioId}/transactions`),
    enabled: Boolean(folioId),
  });
}

export function useClientPortalFamilyMemberFolioTransactions(memberId: string | undefined, folioId: string | null) {
  return useQuery({
    queryKey: ["client-portal-family-folio-transactions", memberId, folioId],
    queryFn: () =>
      clientPortalApiClient.get<ClientPortalFolioTransaction[]>(`/client/family/${memberId}/folios/${folioId}/transactions`),
    enabled: Boolean(memberId && folioId),
  });
}
