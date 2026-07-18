import { resolveTransactionType } from "./transaction-types";
import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaDate, parseRtaNumber, requireString } from "./parsing-utils";

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

export function mapMfsd201Record(
  rawRecord: Record<string, unknown>,
  format: RtaSourceFormat,
  rtaType: RtaType,
): NormalizedTransactionRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(format, rtaType);
  const get = (field: Mfsd201Field) => getRawValue(rawRecord, headerLookup, field, aliasKey);
  const reportCode = "MFSD201";

  const transactionTypeCode = requireString(get("transactionTypeCode"), "transactionTypeCode", reportCode);
  const resolvedType = resolveTransactionType(transactionTypeCode);

  return {
    amcCode: requireString(get("amcCode"), "amcCode", reportCode),
    productCode: requireString(get("productCode"), "productCode", reportCode),
    schemeDescription: requireString(get("schemeDescription"), "schemeDescription", reportCode),
    folioNumber: requireString(get("folioNumber"), "folioNumber", reportCode),
    investorName: optionalString(get("investorName")),
    investorPan: optionalString(get("investorPan")),
    transactionNumber: optionalString(get("transactionNumber")),
    transactionTypeCode,
    transactionType: resolvedType.normalizedType,
    isRejection: resolvedType.isRejection,
    isRecognizedTransactionType: resolvedType.isRecognized,
    postDate: parseRtaDate(get("postDate")) ?? (() => {
      throw new Error(`Missing required ${reportCode} field: postDate`);
    })(),
    tradeDate: parseRtaDate(get("tradeDate")),
    units: parseRtaNumber(get("units")),
    amount: parseRtaNumber(get("amount")),
    navPerUnit: parseRtaNumber(get("navPerUnit")),
    brokerArnCode: optionalString(get("brokerArnCode")),
    subBrokerCode: optionalString(get("subBrokerCode")),
    euin: optionalString(get("euin")),
  };
}
