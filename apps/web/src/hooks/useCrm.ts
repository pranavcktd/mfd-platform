import { useQuery } from "@tanstack/react-query";
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
}

export interface ClientListResponse {
  total: number;
  page: number;
  pageSize: number;
  clients: ClientListItem[];
}

export interface ClientFolio {
  id: string;
  amcCode: string;
  folioNumber: string;
  schemeCode: string;
  schemeName: string | null;
  assetClass: string | null;
  balanceUnits: string | null;
  valuationAmount: string | null;
  navPerUnit: string | null;
  balanceAsOfDate: string | null;
  activeSips: number;
}

export interface ClientOtherAsset {
  id: string;
  assetType: string;
  description: string | null;
  value: string;
  asOfDate: string;
}

export interface ClientTransaction {
  id: string;
  transactionType: string;
  transactionDescription: string | null;
  transactionDate: string;
  amount: string | null;
  units: string | null;
  brokerageAmount: string | null;
}

export interface ClientDetail {
  id: string;
  name: string;
  panNumber: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  kycStatus: string | null;
  familyName: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  pincode: string | null;
  taxStatus: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  createdAt: string;
  folios: ClientFolio[];
  otherAssets: ClientOtherAsset[];
  recentTransactions: ClientTransaction[];
}

export function useClientList(search: string, page: number) {
  return useQuery({
    queryKey: ["crm-clients", search, page],
    queryFn: () =>
      apiClient.get<ClientListResponse>(
        `/crm/clients?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
  });
}

export function useClientDetail(clientId: string | undefined) {
  return useQuery({
    queryKey: ["crm-client", clientId],
    queryFn: () => apiClient.get<ClientDetail>(`/crm/clients/${clientId}`),
    enabled: Boolean(clientId),
  });
}
