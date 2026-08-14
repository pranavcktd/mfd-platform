import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-client";

export interface MarketQuote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  asOf: string;
}

export interface MarketSnapshot {
  nifty: MarketQuote | null;
  sensex: MarketQuote | null;
  usdInr: MarketQuote | null;
  fetchedAt: string;
}

/** Polls every 60s (matches the backend's own 60s cache TTL — polling faster wouldn't get fresher data, just extra requests). */
export function useMarketSnapshot() {
  return useQuery({
    queryKey: ["market-data-snapshot"],
    queryFn: () => apiClient.get<MarketSnapshot>("/market-data/snapshot"),
    refetchInterval: 60_000,
  });
}
