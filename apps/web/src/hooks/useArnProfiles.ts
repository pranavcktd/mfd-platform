import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export interface ArnProfile {
  id: string;
  arnNumber: string;
  arnHolderName: string;
  parentArnProfileId: string | null;
  camsMailId: string | null;
}

export function useArnProfiles() {
  return useQuery({
    queryKey: ["arn-profiles"],
    queryFn: () => apiClient.get<ArnProfile[]>("/arn-profiles"),
  });
}

export function useSaveCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      arnProfileId,
      provider,
      payload,
    }: {
      arnProfileId: string;
      provider: "CAMS" | "KFINTECH" | "BSE" | "NSE";
      payload: Record<string, string>;
    }) =>
      apiClient.post<{ provider: string; updatedAt: string }>(`/arn-profiles/${arnProfileId}/credentials`, {
        provider,
        payload,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["arn-profiles"] }),
  });
}
