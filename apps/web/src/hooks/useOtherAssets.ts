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
}

export interface CreateOtherAssetInput {
  clientId: string;
  assetType: string;
  description?: string;
  value: number;
  asOfDate: string;
}

export function useOtherAssets(clientId?: string) {
  return useQuery({
    queryKey: ["other-assets", clientId],
    queryFn: () => apiClient.get<OtherAsset[]>(`/other-assets${clientId ? `?clientId=${clientId}` : ""}`),
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
