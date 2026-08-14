import { parse } from "csv-parse/sync";
import { parseRtaDate } from "@mfd/shared";

export interface ManualNavRow {
  isin: string;
  nav: number;
  navDate: Date;
}

export interface ManualNavParseResult {
  rows: ManualNavRow[];
  totalDataRows: number;
  errors: string[];
}

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Accepts a handful of realistic header spellings ("NAV Date", "nav_date", "Date", "NAV (Rs)") rather than forcing one exact template — a manual fallback file is exactly the kind of thing someone re-types by hand under time pressure. */
function pickColumn(headerMap: Map<string, string>, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const match = headerMap.get(normalizeHeaderKey(candidate));
    if (match) return match;
  }
  return undefined;
}

/**
 * CSV-only, deliberately — see apps/web/src/lib/export.ts's doc comment:
 * the published `xlsx` (SheetJS) package has two known high-severity
 * advisories (prototype pollution, ReDoS) in its READ path with no fix
 * published, and this file's whole input is an admin-uploaded, untrusted
 * buffer. csv-parse has no such history and is already trusted elsewhere in
 * this codebase (bulk MFD onboarding) for the same kind of admin upload.
 * The frontend template offers both a .csv and a .xlsx download (writing
 * xlsx is safe — only reading it back is the risk), but only the .csv one
 * round-trips through this endpoint.
 */
export function parseManualNavFile(buffer: Buffer): ManualNavParseResult {
  let records: Record<string, string>[];
  try {
    records = parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    return { rows: [], totalDataRows: 0, errors: [`Could not parse file as CSV: ${err instanceof Error ? err.message : String(err)}`] };
  }

  if (records.length === 0) {
    return { rows: [], totalDataRows: 0, errors: ["No data rows found (check the header row matches the template)"] };
  }

  const headerMap = new Map<string, string>();
  for (const key of Object.keys(records[0])) {
    headerMap.set(normalizeHeaderKey(key), key);
  }
  const isinKey = pickColumn(headerMap, ["isin"]);
  const navKey = pickColumn(headerMap, ["nav", "navrs", "netassetvalue"]);
  const dateKey = pickColumn(headerMap, ["navdate", "date"]);

  if (!isinKey || !navKey || !dateKey) {
    return {
      rows: [],
      totalDataRows: records.length,
      errors: [`Missing required column(s) — need ISIN, NAV, and NAV Date. Found columns: ${Object.keys(records[0]).join(", ")}`],
    };
  }

  const rows: ManualNavRow[] = [];
  const errors: string[] = [];
  records.forEach((record, index) => {
    const rowNum = index + 2; // header is row 1
    const isin = String(record[isinKey] ?? "").trim().toUpperCase();
    if (!isin) return; // silently skip fully-blank trailing rows
    if (!ISIN_PATTERN.test(isin)) {
      errors.push(`Row ${rowNum}: invalid ISIN "${isin}"`);
      return;
    }
    const navRaw = record[navKey];
    const nav = Number(String(navRaw).replace(/,/g, "").trim());
    if (!Number.isFinite(nav) || nav <= 0) {
      errors.push(`Row ${rowNum}: invalid NAV "${navRaw}" for ${isin}`);
      return;
    }
    let navDate: Date | undefined;
    try {
      navDate = parseRtaDate(record[dateKey]);
    } catch {
      navDate = undefined;
    }
    if (!navDate) {
      errors.push(`Row ${rowNum}: invalid NAV Date "${record[dateKey]}" for ${isin}`);
      return;
    }
    rows.push({ isin, nav, navDate });
  });

  return { rows, totalDataRows: records.length, errors };
}
