import { useMutation } from "@tanstack/react-query";
import { adminApiClient } from "../lib/admin-api-client";

export function useAdminChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      adminApiClient.patch("/admin-auth/change-password", input),
  });
}

export function useAdminResetToDefault() {
  return useMutation({
    mutationFn: () => adminApiClient.post<{ username: string; password: string }>("/admin-auth/reset-to-default"),
  });
}
