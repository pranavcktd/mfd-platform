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
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; MFDPlatformMarketData/1.0)" } },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body = (await response.json()) as {
        chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number; regularMarketTime?: number } }> };
      };
      const meta = body?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      const previousClose = meta?.chartPreviousClose;
      if (typeof price !== "number" || typeof previousClose !== "number") {
        throw new Error("Unexpected response shape — missing regularMarketPrice/chartPreviousClose");
      }
      const change = price - previousClose;
      const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;
      const asOf = typeof meta?.regularMarketTime === "number" ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString();
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
