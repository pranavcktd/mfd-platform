import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaDate, parseRtaNumber, requireString } from "./parsing-utils";

/**
 * Column-name aliases for CAMS's WBR6 ("My Trailer Fee Details", also
 * called WBR11/AFE-Trailer Fee Data Feed) and KFintech's MFSD205
 * ("Transaction wise Brokerage Report"). CAMS confirmed 2026-08-09 against
 * a REAL decrypted WBR6 DBF (4,421 rows) — the RTA's own reference doc's
 * "Data Item" column turned out to be human-readable descriptions, NOT the
 * actual DBF field names (unlike WBR2/WBR4/WBR49/WBR9/WBR56, which use
 * real abbreviated codes directly), so the first version of this file built
 * from that doc alone failed to match any real row. KFintech's MFSD205 is
 * still unverified (built from MailbackreportsFormats.xls only, no live
 * sample seen yet) — its "Field Name in CSV"/"Field Name in DBF" columns
 * for that report ARE the literal real column names per the doc's own
 * table structure, matching how MFSD227/230/239/262/263/264 turned out to
 * be documented, so this is lower-risk than WBR6 was, but still flagged.
 * Genuinely different from BrokerageWithheld (money CAMS is HOLDING BACK
 * due to invalid KYC) and from Transaction.brokerageAmount (the
 * per-transaction incentive embedded directly in WBR2/MFSD201) — this is
 * the RTA's own periodic fee-crediting statement, with its own date range
 * and rate per period.
 */
const BROKERAGE_EARNED_ALIASES = {
  amcCode: { cams: "AMC_CODE", csv: "Fund" },
  folioNumber: { cams: "FOLIOCHK", csv: "Account Number" },
  transactionNumber: { cams: "TRXN_ID", csv: "Transaction Number" },
  investorName: { cams: "INV_NAME", csv: "Investor Name" },
  investorPan: { cams: "TAX_NO", csv: "InvPAN" },
  schemeCode: { cams: "PRODUCT", csv: "Scheme Code" },
  transactionType: { cams: "TRXN_DB_CR", csv: "Transaction Description" },
  units: { cams: "UNITS", csv: "Units" },
  amount: { cams: "AMOUNT", csv: "Amount (in Rs.)" },
  brokerageRate: { cams: "RATE", csv: "Percentage (%)" },
  brokerageAmount: { cams: "FEE_AMT", csv: "Brokerage (in Rs.)" },
  feeType: { cams: "FEE_TYPE", csv: "" },
  transactionDate: { cams: "TRADDATE", csv: "Transaction Date" },
  feeFromDate: { cams: "FEE_FRDT", csv: "From Date" },
  feeToDate: { cams: "FEE_TODT", csv: "To Date" },
  processedDate: { cams: "PROCDATE", csv: "Process Date" },
  brokerArnCode: { cams: "BROKCODE", csv: "Sub-Broker" },
} as const;

type BrokerageEarnedField = keyof typeof BROKERAGE_EARNED_ALIASES;

export interface NormalizedBrokerageEarnedRecord {
  folioNumber: string;
  transactionNumber?: string;
  investorName?: string;
  investorPan?: string;
  amcCode?: string;
  schemeCode?: string;
  transactionType?: string;
  units?: number;
  amount?: number;
  brokerageRate?: number;
  brokerageAmount?: number;
  feeType?: string;
  transactionDate?: Date;
  feeFromDate?: Date;
  feeToDate?: Date;
  processedDate?: Date;
  brokerArnCode?: string;
}

function resolveAliasKey(rtaType: RtaType): "cams" | "csv" {
  return rtaType === "CAMS" ? "cams" : "csv";
}

function getRawValue(
  rawRecord: Record<string, unknown>,
  headerLookup: Map<string, string>,
  field: BrokerageEarnedField,
  aliasKey: "cams" | "csv",
): unknown {
  const columnName = BROKERAGE_EARNED_ALIASES[field][aliasKey];
  if (!columnName) return undefined;
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

export function looksLikeBrokerageEarned(rawRecord: Record<string, unknown>, rtaType: RtaType): boolean {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(rtaType);
  const required: BrokerageEarnedField[] =
    rtaType === "CAMS"
      ? ["folioNumber", "transactionNumber", "brokerageAmount", "feeType"]
      : ["folioNumber", "transactionNumber", "brokerageAmount", "schemeCode"];
  return required.every((field) => getRawValue(rawRecord, headerLookup, field, aliasKey) !== undefined);
}

export function mapBrokerageEarnedRecord(rawRecord: Record<string, unknown>, rtaType: RtaType): NormalizedBrokerageEarnedRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(rtaType);
  const get = (field: BrokerageEarnedField) => getRawValue(rawRecord, headerLookup, field, aliasKey);
  const reportCode = "BROKERAGE_EARNED";

  return {
    folioNumber: requireString(get("folioNumber"), "folioNumber", reportCode),
    transactionNumber: optionalString(get("transactionNumber")),
    investorName: optionalString(get("investorName")),
    investorPan: optionalString(get("investorPan")),
    amcCode: optionalString(get("amcCode")),
    schemeCode: optionalString(get("schemeCode")),
    transactionType: optionalString(get("transactionType")),
    units: parseRtaNumber(get("units")),
    amount: parseRtaNumber(get("amount")),
    brokerageRate: parseRtaNumber(get("brokerageRate")),
    brokerageAmount: parseRtaNumber(get("brokerageAmount")),
    feeType: optionalString(get("feeType")),
    transactionDate: parseRtaDate(get("transactionDate")),
    feeFromDate: parseRtaDate(get("feeFromDate")),
    feeToDate: parseRtaDate(get("feeToDate")),
    processedDate: parseRtaDate(get("processedDate")),
    brokerArnCode: optionalString(get("brokerArnCode")),
  };
}
