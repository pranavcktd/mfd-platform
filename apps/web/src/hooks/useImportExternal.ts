import { useMutation } from "@tanstack/react-query";
import { getAccessToken, ApiError } from "../lib/api-client";

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
      return postForm<CasPreviewResult>("/api/import-external/cas/preview", formData);
    },
  });
}

export function useCasImport() {
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
      return postForm<CasImportResult>("/api/import-external/cas", formData);
    },
  });
}
