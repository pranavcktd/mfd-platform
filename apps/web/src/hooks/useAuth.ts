import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiClient, clearAccessToken, getAccessToken, setAccessToken } from "../lib/api-client";

interface LoginResponse {
  accessToken: string;
}

interface Me {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export function useLogin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      apiClient.post<LoginResponse>("/auth/login", credentials),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/");
    },
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient.get<Me>("/me"),
    enabled: Boolean(getAccessToken()),
    retry: false,
  });
}

export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return () => {
    clearAccessToken();
    queryClient.clear();
    navigate("/login");
  };
}
