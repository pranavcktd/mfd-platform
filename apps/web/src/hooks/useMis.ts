import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export type MisCheck =
  | "no-nominee"
  | "no-investment"
  | "no-sip"
  | "zero-balance"
  | "no-pan"
  | "needs-review"
  | "kyc-failed"
  | "aadhaar-not-linked";

export interface MisRow {
  id: string;
  clientId?: string;
  name?: string;
  panNumber?: string | null;
  createdAt?: string;
  reviewReason?: string | null;
  clientName?: string;
  folioNumber?: string;
  amcCode?: string;
  schemeCode?: string;
  balanceAsOfDate?: string | null;
  kycStatus?: string | null;
  kycStatusDescription?: string | null;
  aadhaarStatus?: string | null;
  kycReportDate?: string | null;
}

export interface MisCounts {
  "no-nominee": number;
  "no-investment": number;
  "no-sip": number;
  "zero-balance": number;
  "no-pan": number;
  "needs-review": number;
  "kyc-failed": number;
  "aadhaar-not-linked": number;
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

export function useMisCounts(arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["mis-counts", arnProfileIds],
    queryFn: () => apiClient.get<MisCounts>(`/mis/counts${buildQuery({ arnProfileIds: arnQueryValue(arnProfileIds) })}`),
  });
}

export function useMisCheck(check: MisCheck, page: number, search?: string, arnProfileIds?: string[]) {
  return useQuery({
    queryKey: ["mis-check", check, page, search, arnProfileIds],
    queryFn: () =>
      apiClient.get<{ total: number; page: number; pageSize: number; rows: MisRow[] }>(
        `/mis/${check}${buildQuery({ page, search, arnProfileIds: arnQueryValue(arnProfileIds) })}`,
      ),
  });
}
