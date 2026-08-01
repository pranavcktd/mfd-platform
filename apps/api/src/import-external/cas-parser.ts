/**
 * Parses a CAMS/KFintech Consolidated Account Statement (CAS) — the
 * industry-standard PDF that aggregates a PAN's mutual fund holdings
 * across EVERY AMC, not just the ones this MFD services (unlike the
 * regular RTA mailback reports, which only ever cover this MFD's own
 * ARN). A CAS can consolidate MULTIPLE investors under one statement
 * (same convention CAMS itself documents: consolidation is by email id,
 * so a shared family email pulls in every member's folios) — each
 * scheme/folio block carries its own "PAN: XXXXXXXXXXX" line, which is
 * the authoritative per-holding investor identifier, not a single
 * document-level PAN.
 *
 * VALIDATED (2026-07-24) against a real CAMS+KFintech CAS PDF (password-
 * protected, 12 pages, ~40 folios across 12 AMCs) — the original version
 * of this parser was written blind (no real sample available) and its
 * transaction-row regex assumed the wrong column order entirely: it
 * expected `date description amount units nav balance`, but the real
 * extracted text is tab-column-separated as
 * `date amount price\tunits\tdescription balance` (confirmed via `cat -A`
 * on the raw extracted text — the columns are genuinely TAB-separated,
 * not just visually aligned), with negative amounts/units shown in
 * parens `(500.63)` rather than a minus sign, and small stamp-duty /
 * narrative-only lines (e.g. "***Terminated***", "***Registration of
 * Nominee***") interleaved among real transaction rows with no
 * amount/units/balance at all. Rewritten as a line-by-line parser instead
 * of one multi-line regex to handle this reliably. Every fix below was
 * confirmed against the real extracted text before being trusted.
 */

export interface CasTransaction {
  date: string;
  description: string;
  /** Normalized to this project's existing Transaction.transactionType taxonomy (PURCHASE/REDEMPTION/SWITCH_IN/SWITCH_OUT/DIVIDEND_PAYOUT/DIVIDEND_REINVEST/BONUS/OTHER) so CAS-imported rows behave identically to RTA-mailback ones in capital-gains/XIRR/report queries that key off transactionType. */
  transactionType: string;
  amount: number;
  units: number | null;
  navPerUnit: number | null;
  unitBalance: number | null;
}

export interface CasFolio {
  folioNumber: string;
  /** The specific PAN this folio belongs to — a CAS can consolidate several investors under one statement (shared family email), so this is read per-folio, never assumed to be the same for the whole document. */
  panNumber: string | null;
  investorName: string | null;
  amcName: string | null;
  schemeName: string;
  isin: string | null;
  transactions: CasTransaction[];
  /** From the folio's own "Closing Unit Balance: X ... NAV on <date>: INR Y Market Value on <date>: INR Z" footer lines — a real current-value snapshot, not derived from transactions (which would need correct FIFO/avg-cost math this parser doesn't attempt). */
  closingUnitBalance: number | null;
  navPerUnit: number | null;
  valuationAmount: number | null;
  valuationDate: string | null;
}

export interface CasParseResult {
  /** Every distinct PAN found anywhere in the document — informational only; per-folio mapping uses CasFolio.panNumber, not this list. */
  panNumbers: string[];
  folios: CasFolio[];
  rawTextSample?: string;
}

const PAN_PATTERN = /\bPAN\s*:\s*([A-Z]{5}[0-9]{4}[A-Z])\b/gi;
const BARE_PAN_PATTERN = /\b([A-Z]{5}[0-9]{4}[A-Z])\b/g;
const FOLIO_SPLIT_PATTERN = /Folio\s*No\s*[:.]?\s*([\w/-]+)/gi;
const AMC_NAME_PATTERN = /([A-Za-z.&' ]+?Mutual\s*Fund)/gi;
const TRANSACTION_LINE_START = /^(\d{2}-[A-Za-z]{3}-\d{4})\s*(.*)$/;
const TRAILING_NUMBER = /^\(?[\d,]+\.\d{2,4}\)?$/;
const CLOSING_BALANCE_PATTERN = /Closing Unit Balance\s*:\s*([\d,]+\.\d{2,4})/i;
const MARKET_VALUE_PATTERN = /Market Value on\s*(\d{2}-[A-Za-z]{3}-\d{4})\s*:\s*INR\s*([\d,]+\.\d{2,4})/i;
const NAV_PATTERN = /NAV on\s*(\d{2}-[A-Za-z]{3}-\d{4})\s*:\s*INR\s*([\d,]+\.\d{2,4})/i;

function parseSignedNumber(raw: string): number {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const cleaned = trimmed.replace(/[(),]/g, "");
  const value = Number(cleaned);
  return negative ? -value : value;
}

/**
 * Real CAS description text is far less uniform than the RTA mailback
 * reports' own fixed code tables — confirmed against the real file:
 * "Sys. Investment (1/4)" (not "Systematic Investment"), "Lateral Shift
 * Out (To LF (IG) F.No:...)" (not "Switch Out") both appear for what are
 * unambiguously a SIP purchase and a switch-out respectively. Classified
 * on broad substrings for that reason, checked in an order where a false
 * match higher up can't shadow a more specific one below it (switch/shift
 * before redemption, both before the generic "any investment" purchase
 * fallback).
 */
function classifyTransactionType(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("dividend")) {
    return d.includes("reinvest") ? "DIVIDEND_REINVEST" : "DIVIDEND_PAYOUT";
  }
  if (d.includes("switch") || d.includes("shift")) {
    return d.includes("out") ? "SWITCH_OUT" : "SWITCH_IN";
  }
  if (d.includes("bonus")) return "BONUS";
  if (d.includes("redemption")) return "REDEMPTION";
  if (d.includes("purchase") || d.includes("investment")) return "PURCHASE";
  return "OTHER";
}

/**
 * A real transaction line is TAB-separated into exactly 3 fields once the
 * leading date is stripped: "amount price", "units", "description balance".
 * A fee-only or narrative-only line (stamp duty, nominee registration,
 * address updates, plan termination) has no price/units at all — those
 * are skipped, not real investment transactions. Returns null for any
 * line that isn't a full 4-field transaction row.
 */
function parseTransactionLine(line: string): CasTransaction | null {
  const dateMatch = line.match(TRANSACTION_LINE_START);
  if (!dateMatch) return null;
  const date = dateMatch[1];
  const rest = dateMatch[2];

  const parts = rest.split("\t").map((p) => p.trim());
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
    return null; // fee-only ("amount\t") or narrative-only ("") row — not a real transaction
  }

  const amountPriceTokens = parts[0].split(/\s+/);
  if (amountPriceTokens.length < 2) return null;
  const [amountRaw, priceRaw] = amountPriceTokens;
  const unitsRaw = parts[1];

  const descTokens = parts[2].split(/\s+/);
  const lastToken = descTokens[descTokens.length - 1];
  const hasTrailingBalance = TRAILING_NUMBER.test(lastToken);
  const description = (hasTrailingBalance ? descTokens.slice(0, -1) : descTokens).join(" ").trim();
  if (!description) return null;

  return {
    date,
    description,
    transactionType: classifyTransactionType(description),
    amount: parseSignedNumber(amountRaw),
    units: parseSignedNumber(unitsRaw),
    navPerUnit: parseSignedNumber(priceRaw),
    unitBalance: hasTrailingBalance ? parseSignedNumber(lastToken) : null,
  };
}

/**
 * A stable identifier for one parsed folio within a single document —
 * used to carry a "select this one to import" checkbox choice from the
 * preview step back to the actual import call without needing any
 * server-side session/cache state (the browser just resends the file).
 * PAN + folio number + scheme name is unique within one real CAS (a
 * folio number can repeat across schemes under the same folio, per
 * cas-parser's own real-data findings, hence scheme name is part of the
 * key too).
 */
export function casFolioKey(folio: Pick<CasFolio, "panNumber" | "folioNumber" | "schemeName">): string {
  return `${folio.panNumber ?? ""}|${folio.folioNumber}|${folio.schemeName}`;
}

export function parseCas(rawText: string): CasParseResult {
  const panNumbers = Array.from(new Set(Array.from(rawText.matchAll(BARE_PAN_PATTERN)).map((m) => m[1])));

  // Split the whole document on every "Folio No" marker — each resulting
  // chunk is everything belonging to that one folio, up to the next one.
  const splitPoints: Array<{ index: number; folioNumber: string }> = [];
  for (const m of rawText.matchAll(FOLIO_SPLIT_PATTERN)) {
    if (m.index !== undefined) {
      splitPoints.push({ index: m.index, folioNumber: m[1] });
    }
  }

  const folios: CasFolio[] = [];
  // Real CAMS/KFintech layout groups every scheme under one AMC beneath a
  // SINGLE "<AMC name> Mutual Fund" heading — it does not repeat the AMC
  // name before each individual scheme/folio within that AMC's section.
  // Confirmed real: folio 33459980 has two scheme blocks, the first
  // immediately preceded by "HDFC Mutual Fund" (found fine by the
  // one-folio-back lookback below), the second scheme block for the SAME
  // folio number has no AMC heading in its own immediate lookback span at
  // all (the heading is further back, before an earlier sibling scheme),
  // which silently produced amcName=null → "Unknown AMC" for a scheme that
  // really is also HDFC. Carrying the last successfully-matched AMC name
  // forward (updated only when a fresh match is found) mirrors how a human
  // reader would resolve it — still inside that AMC's section until a new
  // heading appears.
  let lastKnownAmcName: string | null = null;
  for (let i = 0; i < splitPoints.length; i++) {
    const start = splitPoints[i].index;
    const end = i + 1 < splitPoints.length ? splitPoints[i + 1].index : rawText.length;
    const block = rawText.slice(start, end);

    // AMC name AND per-folio PAN both sit in the span BEFORE this folio's
    // "Folio No" line (confirmed against real data: order is "<AMC name>
    // / PAN: ... / <scheme line> / Registrar / Folio No: ..." — sometimes
    // with PAN before the scheme line, sometimes after, but always before
    // "Folio No"). Look backward to the previous folio's split point (or
    // document start for the first folio) and take the LAST match in that
    // span, closest to this folio's own "Folio No".
    const precedingStart = i === 0 ? 0 : splitPoints[i - 1].index;
    const precedingText = rawText.slice(precedingStart, start);
    const amcMatches = Array.from(precedingText.matchAll(AMC_NAME_PATTERN));
    const amcName: string | null = amcMatches.length > 0 ? amcMatches[amcMatches.length - 1][1].trim() : lastKnownAmcName;
    if (amcMatches.length > 0) {
      lastKnownAmcName = amcName;
    }
    const panMatches = Array.from(precedingText.matchAll(PAN_PATTERN));
    const panNumber = panMatches.length > 0 ? panMatches[panMatches.length - 1][1] : null;

    // Scheme name AND ISIN both live in the span BEFORE this folio's
    // "Folio No" (precedingText), same as AMC name and PAN — real bug
    // found testing against the actual CAS. A second, subtler bug found
    // in the SAME span: the ISIN code itself sometimes wraps across a PDF
    // line break mid-code (confirmed real: "...ISIN: INF179KB1" / "HT1
    // (Advisor:..." on the next line — the true ISIN is
    // "INF179KB1HT1", split 9+3 across the wrap). Matching "ISIN" and the
    // 12-char code on one line (the first approach) silently missed this
    // folio's scheme entirely. Fixed by finding the "- ISIN:" marker
    // position directly (not line-bound), then reading the ISIN from a
    // short window AFTER it with whitespace/newlines stripped out first —
    // immune to exactly where the wrap falls. Scheme name is everything
    // from the start of the marker's own line up to the marker.
    const isinMarkerMatches = Array.from(precedingText.matchAll(/-?\s*ISIN\s*[:.]?\s*/gi));
    let schemeName = "Unknown Scheme";
    let isin: string | null = null;
    if (isinMarkerMatches.length > 0) {
      const marker = isinMarkerMatches[isinMarkerMatches.length - 1];
      const markerStart = marker.index ?? 0;
      const markerEnd = markerStart + marker[0].length;
      const lineStart = precedingText.lastIndexOf("\n", markerStart) + 1;
      schemeName = precedingText.slice(lineStart, markerStart).trim();
      const isinWindow = precedingText.slice(markerEnd, markerEnd + 20).replace(/\s+/g, "");
      const isinFound = isinWindow.match(/^[A-Z]{2}[A-Z0-9]{9}[0-9]/);
      isin = isinFound ? isinFound[0] : null;
    }

    const lines = block.split("\n");
    const transactions: CasTransaction[] = [];
    for (const line of lines) {
      const txn = parseTransactionLine(line);
      if (txn) transactions.push(txn);
    }

    // Investor name: the first non-blank line strictly after "Folio No:
    // ..." itself, before the "Nominee" line — confirmed real position in
    // the actual CAS text.
    const folioNoLineIndex = lines.findIndex((l) => /^Folio\s*No/i.test(l.trim()));
    const investorName =
      folioNoLineIndex >= 0
        ? (lines.slice(folioNoLineIndex + 1).find((l) => l.trim() && !/^Nominee/i.test(l.trim())) ?? "").trim() || null
        : null;

    const closingBalanceMatch = block.match(CLOSING_BALANCE_PATTERN);
    const marketValueMatch = block.match(MARKET_VALUE_PATTERN);
    const navMatch = block.match(NAV_PATTERN);

    folios.push({
      folioNumber: splitPoints[i].folioNumber,
      panNumber,
      investorName,
      amcName,
      schemeName,
      isin,
      transactions,
      closingUnitBalance: closingBalanceMatch ? parseSignedNumber(closingBalanceMatch[1]) : null,
      navPerUnit: navMatch ? parseSignedNumber(navMatch[2]) : null,
      valuationAmount: marketValueMatch ? parseSignedNumber(marketValueMatch[2]) : null,
      valuationDate: marketValueMatch ? marketValueMatch[1] : navMatch ? navMatch[1] : null,
    });
  }

  return {
    panNumbers,
    folios,
    rawTextSample: folios.length === 0 ? rawText.slice(0, 4000) : undefined,
  };
}
