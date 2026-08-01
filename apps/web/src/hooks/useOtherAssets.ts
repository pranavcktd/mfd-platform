import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export interface OtherAsset {
  id: string;
  clientId: string;
  clientName: string;
  assetType: string;
  description: string | null;
  value: string;
  asOfDate: string;
  details: Record<string, unknown> | null;
}

export interface CreateOtherAssetInput {
  clientId: string;
  assetType: string;
  description?: string;
  value: number;
  asOfDate: string;
  details?: Record<string, unknown>;
}

export interface EquityIsinMasterRow {
  isin: string;
  companyName: string;
  nseSymbol: string | null;
  bseScripCode: string | null;
  bseScripId: string | null;
  isTradedOnNse: boolean;
  isTradedOnBse: boolean;
  preferredExchange: string;
  lastClosePrice: string | null;
  lastPriceDate: string | null;
}

export function useOtherAssets(clientId?: string) {
  return useQuery({
    queryKey: ["other-assets", clientId],
    queryFn: () => apiClient.get<OtherAsset[]>(`/other-assets${clientId ? `?clientId=${clientId}` : ""}`),
  });
}

/** Searches the real, admin-imported NSE+BSE equity master (company name / NSE symbol / BSE scrip code / ISIN) — global, not per-distributor. */
export function useEquityIsinSearch(query: string) {
  return useQuery({
    queryKey: ["equity-isin-search", query],
    queryFn: () => apiClient.get<EquityIsinMasterRow[]>(`/equity-isin-master/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length >= 2,
  });
}

export function useCreateOtherAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOtherAssetInput) => apiClient.post<{ id: string }>("/other-assets", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["other-assets"] });
      queryClient.invalidateQueries({ queryKey: ["reports-net-worth"] });
    },
  });
}

export interface UpdateOtherAssetInput {
  id: string;
  description?: string;
  value: number;
  asOfDate: string;
  details?: Record<string, unknown>;
}

export function useUpdateOtherAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateOtherAssetInput) => apiClient.patch<{ id: string }>(`/other-assets/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["other-assets"] });
      queryClient.invalidateQueries({ queryKey: ["reports-net-worth"] });
    },
  });
}

export function useDeleteOtherAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/other-assets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["other-assets"] });
      queryClient.invalidateQueries({ queryKey: ["reports-net-worth"] });
    },
  });
}
