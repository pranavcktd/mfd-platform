import { Injectable, Logger } from "@nestjs/common";

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

const QUOTE_SOURCES: Array<{ key: keyof Omit<MarketSnapshot, "fetchedAt">; symbol: string; label: string }> = [
  { key: "nifty", symbol: "^NSEI", label: "NIFTY 50" },
  { key: "sensex", symbol: "^BSESN", label: "SENSEX" },
  { key: "usdInr", symbol: "USDINR=X", label: "USD/INR" },
];

const CACHE_TTL_MS = 60_000;

/**
 * Live NIFTY/SENSEX/USD-INR via Yahoo Finance's undocumented chart API
 * (query1.finance.yahoo.com) — confirmed working, no API key, 2026-08-13.
 * Deliberately NOT NSE's own website API (also unofficial, tested working
 * too) — NSE is known to require session cookies and intermittently blocks
 * generic scripted requests over time, a worse reliability bet for a
 * standing feature than Yahoo's endpoint, which is what the widely-used
 * `yfinance` library and most third-party tools already rely on.
 *
 * This is explicitly an UNOFFICIAL, undocumented API — no SLA, could change
 * shape or start blocking without notice. Acceptable for a "market context"
 * widget, not something to build a paid/compliance-critical feature on. If
 * that's ever needed, the real fix is a paid data feed (e.g. a broker API
 * like Zerodha Kite Connect), not hardening this further.
 *
 * In-memory cache (60s TTL, process-lifetime, not Redis) — a NestJS service
 * is a singleton per process, so a plain class field is enough to avoid
 * hammering Yahoo on every dashboard load/poll; no need for the
 * BullMQ/Redis machinery the AMFI NAV sync uses, since this is fetched
 * on-demand rather than on a fixed daily schedule.
 */
@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);
  private cache: { snapshot: MarketSnapshot; expiresAt: number } | null = null;

  async getSnapshot(): Promise<MarketSnapshot> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.snapshot;
    }

    const results = await Promise.all(QUOTE_SOURCES.map((source) => this.fetchQuote(source.symbol, source.label)));
    const snapshot: MarketSnapshot = {
      nifty: results[0],
      sensex: results[1],
      usdInr: results[2],
      fetchedAt: new Date().toISOString(),
    };
    this.cache = { snapshot, expiresAt: Date.now() + CACHE_TTL_MS };
    return snapshot;
  }

  private async fetchQuote(symbol: string, label: string): Promise<MarketQuote | null> {
    try {
      // range=5d (not 1d) deliberately — confirmed via real live data
      // (2026-08-17) that Yahoo's range=1d snapshot can go stale for a
      // given symbol (observed: ^BSESN frozen 3 days) while still reporting
      // meta.chartPreviousClose === meta.regularMarketPrice, which silently
      // computes a fake "0.00 (0.00%)" change instead of surfacing the
      // staleness. The 5-day daily-close series stayed reliable for all
      // three symbols under the same test, so previousClose is derived from
      // it directly instead of trusting chartPreviousClose.
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; MFDPlatformMarketData/1.0)" } },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body = (await response.json()) as {
        chart?: {
          result?: Array<{
            meta?: { regularMarketPrice?: number; regularMarketTime?: number };
            timestamp?: number[];
            indicators?: { quote?: Array<{ close?: Array<number | null> }> };
          }>;
        };
      };
      const result = body?.chart?.result?.[0];
      const meta = result?.meta;
      const price = meta?.regularMarketPrice;
      const regularMarketTime = meta?.regularMarketTime;
      const timestamps = result?.timestamp ?? [];
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      if (typeof price !== "number" || typeof regularMarketTime !== "number") {
        throw new Error("Unexpected response shape — missing regularMarketPrice/regularMarketTime");
      }
      const dayKey = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString().slice(0, 10);
      const validCloses = timestamps
        .map((t, i) => ({ dayKey: dayKey(t), close: closes[i] }))
        .filter((e): e is { dayKey: string; close: number } => typeof e.close === "number");
      const todayKey = dayKey(regularMarketTime);
      const lastEntry = validCloses[validCloses.length - 1];
      // If the most recent close is today's, that's the day still in
      // progress (or just-settled) — the previous close is the one before
      // it. If today hasn't closed yet, the most recent close IS the
      // previous close to compare the live price against.
      const previousClose =
        lastEntry?.dayKey === todayKey ? validCloses[validCloses.length - 2]?.close : lastEntry?.close;
      if (typeof previousClose !== "number") {
        throw new Error("Could not derive a previous close from the daily-close series");
      }
      const change = price - previousClose;
      const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;
      const asOf = new Date(regularMarketTime * 1000).toISOString();
      return { symbol, label, price, change, changePercent, asOf };
    } catch (error) {
      // Fail closed per-symbol, not for the whole snapshot — one symbol
      // breaking (rate limit, shape change) shouldn't take the other two
      // down with it. Real 5xx/network errors show up in logs, not thrown
      // up to the dashboard as a hard failure.
      this.logger.warn(`Failed to fetch market quote for ${label} (${symbol}): ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
