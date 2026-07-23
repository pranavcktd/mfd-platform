import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

interface MisClientRow {
  id: string;
  name: string;
  panNumber: string | null;
  createdAt: string;
}

interface MisFolioRow {
  id: string;
  clientName: string;
  folioNumber: string;
  amcCode: string;
  schemeCode: string;
  balanceAsOfDate?: string | null;
}

export interface MisSummary {
  clientsWithoutFolio: MisClientRow[];
  nonSipClients: MisClientRow[];
  zeroBalanceFolios: MisFolioRow[];
  foliosWithoutPan: MisFolioRow[];
}

export function useMisSummary() {
  return useQuery({
    queryKey: ["mis-summary"],
    queryFn: () => apiClient.get<MisSummary>("/mis/summary"),
  });
}
