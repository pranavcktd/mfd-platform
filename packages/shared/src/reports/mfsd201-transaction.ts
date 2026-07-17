import { resolveTransactionType } from "./transaction-types";

export type RtaSourceFormat = "DBF" | "CSV" | "TXT";

/**
 * Column-name aliases for the MFSD 201 (Transaction Report), taken from the
 * RTA's own "common format" reconciliation table in MailbackreportsFormats.xls
 * (sheet "MFSD201 Common format Non-Split"). `dbf` is the KFintech DBF field
 * name, `cams` is the CAMS field name (used for CAMS .txt exports), `csv` is
 * the shared CSV/Excel/TXT header used by KFintech's own CSV/TXT exports.
 * Both `cams` and `csv` are tried for CSV/TXT sources since CAMS's .txt
 * inception export uses the CAMS names while KFintech's .csv/.txt use the
 * `csv` names — this hasn't been validated against a real sample file yet.
 */
const MFSD201_ALIASES = {
  amcCode: { dbf: "TD_FUND", cams: "AMC_CODE", csv: "Fund" },
  productCode: { dbf: "FMCODE", cams: "PRODCODE", csv: "Product Code" },
  schemeDescription: { dbf: "FUNDDESC", cams: "SCHEME", csv: "Fund Description" },
  folioNumber: { dbf: "TD_ACNO", cams: "FOLIO_NO", csv: "Folio Number" },
  investorName: { dbf: "INVNAME", cams: "INV_NAME", csv: "Investor Name" },
  investorPan: { dbf: "PAN1", cams: "PAN", csv: "PAN1" },
  transactionNumber: { dbf: "TD_TRNO", cams: "TRXNNO", csv: "Transaction Number" },
  transactionTypeCode: { dbf: "TD_TRTYPE", cams: "TRXNTYPE", csv: "Transaction Type" },
  postDate: { dbf: "TD_PRDT", cams: "POSTDATE", csv: "Process Date" },
  tradeDate: { dbf: "NAVDATE", cams: "TRADDATE", csv: "Nav Date" },
  units: { dbf: "TD_UNITS", cams: "UNITS", csv: "Units" },
  amount: { dbf: "TD_AMT", cams: "Amount", csv: "Amount" },
  navPerUnit: { dbf: "TD_NAV", cams: "NAV", csv: "Nav" },
  brokerArnCode: { dbf: "TD_AGENT", cams: "BROKCODE", csv: "Agent Code" },
  subBrokerCode: { dbf: "TD_BROKER", cams: "SUBBROK", csv: "Sub-Broker Code" },
  euin: { dbf: "EUIN", cams: "EUIN", csv: "EUIN" },
} as const;

type Mfsd201Field = keyof typeof MFSD201_ALIASES;

export interface NormalizedTransactionRecord {
  amcCode: string;
  productCode: string;
  schemeDescription: string;
  folioNumber: string;
  investorName?: string;
  investorPan?: string;
  transactionNumber?: string;
  transactionTypeCode: string;
  transactionType: string;
  isRejection: boolean;
  postDate: Date;
  tradeDate?: Date;
  units?: number;
  amount?: number;
  navPerUnit?: number;
  brokerArnCode?: string;
  subBrokerCode?: string;
  euin?: string;
}

function buildHeaderLookup(rawRecord: Record<string, unknown>): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const key of Object.keys(rawRecord)) {
    lookup.set(key.trim().toLowerCase(), key);
  }
  return lookup;
}

function getRawValue(
  rawRecord: Record<string, unknown>,
  headerLookup: Map<string, string>,
  field: Mfsd201Field,
  format: RtaSourceFormat,
): unknown {
  if (format === "DBF") {
    return rawRecord[MFSD201_ALIASES[field].dbf];
  }
  const candidates = [MFSD201_ALIASES[field].cams, MFSD201_ALIASES[field].csv];
  for (const candidate of candidates) {
    const actualKey = headerLookup.get(candidate.trim().toLowerCase());
    if (actualKey !== undefined) {
      return rawRecord[actualKey];
    }
  }
  return undefined;
}

/**
 * Checks whether a raw record/header set plausibly matches MFSD 201, by
 * requiring a minimum set of distinctive fields to be resolvable. Used to
 * pick a report definition before a full column-by-column mapping.
 */
export function looksLikeMfsd201(
  rawRecord: Record<string, unknown>,
  format: RtaSourceFormat,
): boolean {
  const headerLookup = buildHeaderLookup(rawRecord);
  const required: Mfsd201Field[] = ["folioNumber", "amount", "transactionTypeCode", "postDate"];
  return required.every((field) => getRawValue(rawRecord, headerLookup, field, format) !== undefined);
}

function parseRtaDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value instanceof Date) {
    return value;
  }
  const text = String(value).trim();
  // DD-MMM-YYYY, e.g. 15-JUL-2026
  const monthNameMatch = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (monthNameMatch) {
    const [, day, mon, year] = monthNameMatch;
    const parsed = new Date(`${day} ${mon} ${year} UTC`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const numericMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numericMatch) {
    const [, day, month, year] = numericMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }
  // YYYYMMDD or YYYY-MM-DD
  const isoMatch = text.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }
  throw new Error(`Unrecognized date format in RTA file: "${text}"`);
}

function parseRtaNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isNaN(parsed) ? undefined : parsed;
}

function requireString(value: unknown, field: string): string {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`Missing required MFSD 201 field: ${field}`);
  }
  return String(value).trim();
}

export function mapMfsd201Record(
  rawRecord: Record<string, unknown>,
  format: RtaSourceFormat,
): NormalizedTransactionRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const get = (field: Mfsd201Field) => getRawValue(rawRecord, headerLookup, field, format);

  const transactionTypeCode = requireString(get("transactionTypeCode"), "transactionTypeCode");
  const resolvedType = resolveTransactionType(transactionTypeCode);

  return {
    amcCode: requireString(get("amcCode"), "amcCode"),
    productCode: requireString(get("productCode"), "productCode"),
    schemeDescription: requireString(get("schemeDescription"), "schemeDescription"),
    folioNumber: requireString(get("folioNumber"), "folioNumber"),
    investorName: get("investorName") ? String(get("investorName")).trim() : undefined,
    investorPan: get("investorPan") ? String(get("investorPan")).trim() : undefined,
    transactionNumber: get("transactionNumber") ? String(get("transactionNumber")).trim() : undefined,
    transactionTypeCode,
    transactionType: resolvedType.normalizedType,
    isRejection: resolvedType.isRejection,
    postDate: parseRtaDate(get("postDate")) ?? (() => {
      throw new Error("Missing required MFSD 201 field: postDate");
    })(),
    tradeDate: parseRtaDate(get("tradeDate")),
    units: parseRtaNumber(get("units")),
    amount: parseRtaNumber(get("amount")),
    navPerUnit: parseRtaNumber(get("navPerUnit")),
    brokerArnCode: get("brokerArnCode") ? String(get("brokerArnCode")).trim() : undefined,
    subBrokerCode: get("subBrokerCode") ? String(get("subBrokerCode")).trim() : undefined,
    euin: get("euin") ? String(get("euin")).trim() : undefined,
  };
}
