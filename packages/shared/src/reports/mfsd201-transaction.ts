import { resolveTransactionType } from "./transaction-types";
import { RtaType } from "../report-schema";

export type RtaSourceFormat = "DBF" | "CSV" | "TXT";
export type { RtaType };

/**
 * Column-name aliases for the MFSD 201 (Transaction Report), taken from the
 * RTA's own "common format" reconciliation table in MailbackreportsFormats.xls
 * (sheet "MFSD201 Common format Non-Split"). `dbf` is the KFintech DBF field
 * name (KFintech is the only RTA that sends DBF). `cams` is the CAMS field
 * name, used only for CAMS-originated exports. `csv` is the header KFintech
 * uses for both its CSV and its tilde-delimited TXT exports.
 *
 * The alias set to use is chosen by rtaType first, then sourceFormat — not
 * by trying every alias against any file. Two things confirmed against real
 * RTA sample exports made that non-negotiable:
 *  - CAMS's "SCHEME" field name and KFintech's own (unrelated) "Scheme"
 *    column collide case-insensitively, so blindly trying the CAMS alias
 *    against a KFintech file silently pulls the wrong column.
 *  - CAMS also ships .dbf files (its own WBR-series reports), using CAMS's
 *    field names directly (AMC_CODE, FOLIO_NO, TRXNTYPE, ...) — DBF format
 *    does not imply KFintech's DBF field names.
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
  isRecognizedTransactionType: boolean;
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

function resolveAliasKey(format: RtaSourceFormat, rtaType: RtaType): "dbf" | "cams" | "csv" {
  if (rtaType === "CAMS") {
    return "cams";
  }
  return format === "DBF" ? "dbf" : "csv";
}

function getRawValue(
  rawRecord: Record<string, unknown>,
  headerLookup: Map<string, string>,
  field: Mfsd201Field,
  aliasKey: "dbf" | "cams" | "csv",
): unknown {
  const columnName = MFSD201_ALIASES[field][aliasKey];
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

/**
 * Checks whether a raw record/header set plausibly matches MFSD 201, by
 * requiring a minimum set of distinctive fields to be resolvable. Used to
 * pick a report definition before a full column-by-column mapping.
 */
export function looksLikeMfsd201(
  rawRecord: Record<string, unknown>,
  format: RtaSourceFormat,
  rtaType: RtaType,
): boolean {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(format, rtaType);
  const required: Mfsd201Field[] = ["folioNumber", "amount", "transactionTypeCode", "postDate"];
  return required.every((field) => getRawValue(rawRecord, headerLookup, field, aliasKey) !== undefined);
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
  rtaType: RtaType,
): NormalizedTransactionRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(format, rtaType);
  const get = (field: Mfsd201Field) => getRawValue(rawRecord, headerLookup, field, aliasKey);

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
    isRecognizedTransactionType: resolvedType.isRecognized,
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
