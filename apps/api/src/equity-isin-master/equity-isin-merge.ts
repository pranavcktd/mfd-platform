import { parse } from "csv-parse/sync";

export interface MergedEquityRow {
  isin: string;
  companyName: string;
  nseSymbol: string | null;
  bseScripCode: string | null;
  bseScripId: string | null;
  isTradedOnNse: boolean;
  isTradedOnBse: boolean;
  preferredExchange: "NSE" | "BSE";
  lastClosePrice: number | null;
  lastPriceDate: string | null;
}

/**
 * NSE_EQUITY_List is a static company/symbol master — columns (trimmed):
 * SYMBOL, NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE,
 * MARKET LOT, ISIN NUMBER, FACE VALUE. No price data.
 */
function parseNseFile(csvText: string): Map<string, { nseSymbol: string; companyName: string }> {
  const rows: Record<string, string>[] = parse(csvText, { columns: (header: string[]) => header.map((h) => h.trim()), skip_empty_lines: true, trim: true });
  const map = new Map<string, { nseSymbol: string; companyName: string }>();
  for (const row of rows) {
    const isin = row["ISIN NUMBER"]?.trim();
    if (!isin) continue;
    map.set(isin, { nseSymbol: row["SYMBOL"]?.trim() ?? "", companyName: row["NAME OF COMPANY"]?.trim() ?? "" });
  }
  return map;
}

/**
 * BSE_EQUITY_List is Bhavcopy-shaped (daily trade data), not just a static
 * list — it carries a real closing price (ClsPric) as of the export date,
 * which this import captures as a starting point (lastClosePrice/
 * lastPriceDate), though the nightly-refresh automation described in the
 * source spec isn't built. Columns used: FinInstrmId (BSE scrip code),
 * ISIN, TckrSymb (BSE scrip id/ticker), FinInstrmNm (company name),
 * ClsPric (close price), TradDt (trade date).
 */
function parseBseFile(csvText: string): Map<string, { bseScripCode: string; bseScripId: string; companyName: string; closePrice: number | null; tradeDate: string | null }> {
  const rows: Record<string, string>[] = parse(csvText, { columns: (header: string[]) => header.map((h) => h.trim()), skip_empty_lines: true, trim: true });
  const map = new Map<string, { bseScripCode: string; bseScripId: string; companyName: string; closePrice: number | null; tradeDate: string | null }>();
  for (const row of rows) {
    const isin = row["ISIN"]?.trim();
    if (!isin) continue;
    const closePriceRaw = row["ClsPric"]?.trim();
    map.set(isin, {
      bseScripCode: row["FinInstrmId"]?.trim() ?? "",
      bseScripId: row["TckrSymb"]?.trim() ?? "",
      companyName: row["FinInstrmNm"]?.trim() ?? "",
      closePrice: closePriceRaw ? Number(closePriceRaw) : null,
      tradeDate: row["TradDt"]?.trim() || null,
    });
  }
  return map;
}

/** Joins the two exchange lists on ISIN — the shared, authoritative identifier across both. NSE's company-name casing is preferred (Title Case) over BSE's (ALL CAPS) when both are present, purely for display quality. */
export function mergeEquityLists(nseCsvText: string, bseCsvText: string): MergedEquityRow[] {
  const nseMap = parseNseFile(nseCsvText);
  const bseMap = parseBseFile(bseCsvText);

  const allIsins = new Set<string>([...nseMap.keys(), ...bseMap.keys()]);
  const rows: MergedEquityRow[] = [];
  for (const isin of allIsins) {
    const nse = nseMap.get(isin);
    const bse = bseMap.get(isin);
    rows.push({
      isin,
      companyName: nse?.companyName || bse?.companyName || isin,
      nseSymbol: nse?.nseSymbol || null,
      bseScripCode: bse?.bseScripCode || null,
      bseScripId: bse?.bseScripId || null,
      isTradedOnNse: Boolean(nse),
      isTradedOnBse: Boolean(bse),
      preferredExchange: nse ? "NSE" : "BSE",
      lastClosePrice: bse?.closePrice ?? null,
      lastPriceDate: bse?.tradeDate ?? null,
    });
  }
  return rows;
}
