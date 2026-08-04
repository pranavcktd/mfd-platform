import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAccessToken, ApiError, API_BASE, apiClient } from "../lib/api-client";

export interface CasPreviewFolio {
  key: string;
  panNumber: string;
  investorName: string | null;
  amcName: string | null;
  schemeName: string;
  folioNumber: string;
  closingUnitBalance: string | null;
  navPerUnit: string | null;
  valuationAmount: string | null;
  transactionCount: number;
  clientExists: boolean;
  clientName: string | null;
  alreadyTrackedViaRta: boolean;
}

export interface CasPreviewResult {
  foliosFound: number;
  foliosSkippedNoPan: number;
  panNumbersFound: string[];
  folios: CasPreviewFolio[];
  rawTextSample?: string;
}

export interface CasClientImportSummary {
  clientId: string;
  clientName: string;
  panNumber: string;
  wasNewlyCreated: boolean;
  foliosImported: number;
  foliosMatchedExisting: number;
  transactionsImported: number;
  transactionsSkipped: number;
  foliosFailed: Array<{ folioNumber: string; schemeName: string; reason: string }>;
}

export interface CasImportResult {
  imported: boolean;
  foliosFound: number;
  foliosSelected?: number;
  foliosSkippedNoPan: number;
  clients: CasClientImportSummary[];
  panNumbersFound: string[];
  rawTextSample?: string;
}

async function postForm<T>(path: string, formData: FormData): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(path, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

/** Parses the CAS PDF and returns a per-folio breakdown without writing anything to the database — the "review before importing" step. */
export function useCasPreview() {
  return useMutation({
    mutationFn: async (input: { file: File; password: string }) => {
      const formData = new FormData();
      formData.append("file", input.file);
      formData.append("password", input.password);
      return postForm<CasPreviewResult>(`${API_BASE}/import-external/cas/preview`, formData);
    },
  });
}

export function useCasImport() {
  const queryClient = useQueryClient();
  return useMutation({
    // multipart/form-data upload — can't go through the shared JSON-only
    // apiClient, so this builds its own fetch call with the same bearer
    // token convention. The file is re-sent (not cached server-side from
    // the preview step) since there's no session state to key a cache on.
    mutationFn: async (input: { file: File; password: string; selectedKeys: string[] }) => {
      const formData = new FormData();
      formData.append("file", input.file);
      formData.append("password", input.password);
      formData.append("selectedKeys", JSON.stringify(input.selectedKeys));
      return postForm<CasImportResult>(`${API_BASE}/import-external/cas`, formData);
    },
    // Same reasoning as useDeleteCasData below — a real import creates new
    // clients/folios/transactions that CRM, dashboard, MIS, reports, and
    // analysis all surface in some form; a full cache invalidation is what
    // actually guarantees none of them keep showing pre-import numbers.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export interface CasFolioSummary {
  folioId: string;
  schemeName: string | null;
  amcCode: string;
  folioNumber: string;
  transactionCount: number;
  valuationAmount: string | null;
}

export interface CasClientSummary {
  clientId: string;
  clientName: string;
  panNumber: string | null;
  isAutoCreatedPendingReview: boolean;
  folios: CasFolioSummary[];
}

export interface CasDataDeleteResult {
  transactionsDeleted: number;
  foliosDeleted: number;
  clientsDeleted: number;
}

/** Real CAS-imported data currently on file, grouped per client then per folio — lets the UI offer "delete this one fund" or "delete this whole client" instead of only an all-or-nothing wipe. */
export function useCasDataSummary() {
  return useQuery({
    queryKey: ["cas-data-summary"],
    queryFn: () => apiClient.get<CasClientSummary[]>("/import-external/cas/summary"),
  });
}

export function useDeleteCasData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (folioIds: string[]) => apiClient.delete<CasDataDeleteResult>("/import-external/cas", { folioIds }),
    // Deleting folios/transactions here changes numbers shown all over the
    // app — CRM client detail's "Invested"/holdings, dashboard AUM, MIS,
    // reports, analysis — none of which are recomputed server-side into a
    // cache, they're just plain React Query results that go stale the
    // instant the underlying rows are gone. Real bug caught live: only
    // invalidating "cas-data-summary" left every one of those other pages
    // showing pre-delete numbers until an unrelated action happened to
    // refetch them. A full cache invalidation (no key filter) is the
    // correct fix for an action this broad, not chasing down every
    // affected key one at a time.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
