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
  /// Plain-English transaction description, straight from the RTA — not a
  /// code needing a lookup table. CAMS's TRXN_TYPE_ (e.g. "Additional
  /// Purchase") is populated even when TRXNTYPE's code isn't in our table
  /// (0% recognized for CAMS as of 2026-07-20). KFintech's own "Transaction
  /// Description" column serves the same role there. The "dbf" alias below
  /// (KFintech DBF exports) is an unverified guess, following this table's
  /// existing naming convention — no real KFintech .dbf sample exists to
  /// check it against (only CAMS ships real .dbf in our samples; KFintech's
  /// DBF path may never actually trigger against real ingestion).
  transactionDescription: { dbf: "TRXN_DESC", cams: "TRXN_TYPE_", csv: "Transaction Description" },
  postDate: { dbf: "TD_PRDT", cams: "POSTDATE", csv: "Process Date" },
  tradeDate: { dbf: "NAVDATE", cams: "TRADDATE", csv: "Nav Date" },
  units: { dbf: "TD_UNITS", cams: "UNITS", csv: "Units" },
  amount: { dbf: "TD_AMT", cams: "Amount", csv: "Amount" },
  navPerUnit: { dbf: "TD_NAV", cams: "NAV", csv: "Nav" },
  brokerArnCode: { dbf: "TD_AGENT", cams: "BROKCODE", csv: "Agent Code" },
  subBrokerCode: { dbf: "TD_BROKER", cams: "SUBBROK", csv: "Sub-Broker Code" },
  euin: { dbf: "EUIN", cams: "EUIN", csv: "EUIN" },
  /// Real brokerage/commission data — confirmed present and populated in
  /// real CAMS exports (BROKPERC/BROKCOMM), though blank in the one real
  /// KFintech sample checked (its "Brokerage Percentage"/"Commission"
  /// columns exist in the report layout but weren't populated in that
  /// export — may be populated in other KFintech subscriptions).
  brokeragePercent: { dbf: "TD_BROKPE", cams: "BROKPERC", csv: "Brokerage Percentage" },
  brokerageAmount: { dbf: "TD_BROKCO", cams: "BROKCOMM", csv: "Commission" },
  /// Asset class (e.g. "Equity(S)") — CAMS's SCHEME_TYP, KFintech's
  /// AssetType. Enables real portfolio-composition analysis without needing
  /// NAV/benchmark history.
  assetClass: { dbf: "ASSETTYPE", cams: "SCHEME_TYP", csv: "AssetType" },
} as const;

/// ISIN — real column confirmed in KFintech's own MFSD201 CSV export ("ISIN").
/// CAMS's WBR2 DBF has no equivalent field at all (checked the real field
/// list directly: AMC_CODE, FOLIO_NO, ... no ISIN-shaped column) — CAMS
/// folios instead get their isin via the WBR39 scheme-master name-join
/// (crm-sync.ts). No confirmed real KFintech .dbf sample exists to name the
/// DBF field, so this is CSV-only, same caution as transactionDescription's
/// dbf alias above.
const ISIN_CSV_COLUMN = "ISIN";

/// REMARKS/REV_REMARK — real CAMS WBR2 DBF fields, confirmed present in a
/// real field-list dump (AMC_CODE, FOLIO_NO, ... REMARKS ... REV_REMARK,
/// ...) this session, distinct from transactionDescription/TRXN_TYPE_
/// (which only labels the transaction TYPE, e.g. "Purchase Rejection", not
/// WHY it was rejected). REV_REMARK is checked first — more specific to an
/// actual rejection/reversal than the general-purpose REMARKS field. No
/// KFintech equivalent has been confirmed against real data, so this is
/// CAMS-only, same caution as every other unverified-for-KFintech field
/// above.
const CAMS_REMARKS_COLUMN = "REMARKS";
const CAMS_REV_REMARK_COLUMN = "REV_REMARK";

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
  /// Plain-English description straight from the RTA (see alias comment) —
  /// used as the display-facing transaction label, since transactionType
  /// falls back to "OTHER" for the ~100% of real CAMS codes our lookup
  /// table doesn't recognize.
  transactionDescription?: string;
  isRejection: boolean;
  isRecognizedTransactionType: boolean;
  postDate: Date;
  tradeDate?: Date;
  units?: number;
  amount?: number;
  navPerUnit?: number;
  brokeragePercent?: number;
  brokerageAmount?: number;
  assetClass?: string;
  brokerArnCode?: string;
  subBrokerCode?: string;
  euin?: string;
  isin?: string;
  rejectionReason?: string;
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
  const transactionDescription = optionalString(get("transactionDescription"));
  const resolvedType = resolveTransactionType(transactionTypeCode, transactionDescription);

  const units = parseRtaNumber(get("units"));
  const amount = parseRtaNumber(get("amount"));
  const rawNavPerUnit = parseRtaNumber(get("navPerUnit"));
  // Real data confirmed this is common, not an edge case: ~73% of real
  // PURCHASE/SWITCH_IN rows across both RTAs carry no NAV value at all in
  // their own NAV/TD_NAV/Nav column, despite having both units and amount
  // (e.g. a real "Fresh Purchase Systematic" row: amount=249987.5,
  // units=968.149, NAV column blank). amount/units is the exact NAV for
  // that row — not an estimate — since units = amount / nav is definitionally
  // how a purchase is booked, so this is only a fallback for when the RTA's
  // own column is empty, never a value that overrides a real reported one.
  const navPerUnit = rawNavPerUnit ?? (units && amount && units !== 0 ? amount / units : undefined);

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
    transactionDescription,
    isRejection: resolvedType.isRejection,
    isRecognizedTransactionType: resolvedType.isRecognized,
    postDate: parseRtaDate(get("postDate")) ?? (() => {
      throw new Error(`Missing required ${reportCode} field: postDate`);
    })(),
    tradeDate: parseRtaDate(get("tradeDate")),
    units,
    amount,
    navPerUnit,
    brokeragePercent: parseRtaNumber(get("brokeragePercent")),
    brokerageAmount: parseRtaNumber(get("brokerageAmount")),
    assetClass: optionalString(get("assetClass")),
    brokerArnCode: optionalString(get("brokerArnCode")),
    subBrokerCode: optionalString(get("subBrokerCode")),
    euin: optionalString(get("euin")),
    isin: rtaType === "KFINTECH" ? optionalString(rawRecord[headerLookup.get(ISIN_CSV_COLUMN.toLowerCase()) ?? ""]) : undefined,
    rejectionReason:
      rtaType === "CAMS"
        ? optionalString(rawRecord[headerLookup.get(CAMS_REV_REMARK_COLUMN.toLowerCase()) ?? ""]) ??
          optionalString(rawRecord[headerLookup.get(CAMS_REMARKS_COLUMN.toLowerCase()) ?? ""])
        : undefined,
  };
}
