import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaDate, parseRtaNumber, requireString } from "./parsing-utils";

/**
 * Column-name aliases for CAMS's WBR95 ("Brokerage Withheld") — real field
 * layout confirmed 2026-07-27 against live mail. Per-folio brokerage CAMS
 * is withholding because that folio's KYC is invalid — every real sample
 * row had kycStatusAtWithholding === "KYC Failed". TF/TI/UPF are CAMS's own
 * raw column abbreviations; no field-layout glossary exists for this
 * report anywhere supplied so far, so their exact business meaning
 * (trail fee / transaction incentive / upfront, respectively — best-effort
 * guesses from common brokerage terminology) is unconfirmed. CAMS-only so
 * far, same as kyc-status.ts.
 */
const BROKERAGE_WITHHELD_ALIASES = {
  folioNumber: { cams: "FOLIO" },
  transactionNumber: { cams: "TRXN_NO" },
  investorName: { cams: "INV_NAME" },
  investorPan: { cams: "TAX_NO" },
  amcCode: { cams: "AMC_CODE" },
  schemeCode: { cams: "SCHEME_COD" },
  brokerArnCode: { cams: "BROK_DLR_C" },
  kycStatusAtWithholding: { cams: "FH_KYC" },
  trailFeeWithheld: { cams: "TF" },
  transactionIncentiveWithheld: { cams: "TI" },
  upfrontWithheld: { cams: "UPF" },
  processedDate: { cams: "PROCESS_DA" },
  reportDate: { cams: "REP_DATE" },
} as const;

type BrokerageWithheldField = keyof typeof BROKERAGE_WITHHELD_ALIASES;

export interface NormalizedBrokerageWithheldRecord {
  folioNumber: string;
  transactionNumber?: string;
  investorName?: string;
  investorPan?: string;
  amcCode?: string;
  schemeCode?: string;
  brokerArnCode?: string;
  kycStatusAtWithholding?: string;
  trailFeeWithheld?: number;
  transactionIncentiveWithheld?: number;
  upfrontWithheld?: number;
  processedDate?: Date;
  reportDate?: Date;
}

function getRawValue(
  rawRecord: Record<string, unknown>,
  headerLookup: Map<string, string>,
  field: BrokerageWithheldField,
): unknown {
  const columnName = BROKERAGE_WITHHELD_ALIASES[field].cams;
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

export function looksLikeBrokerageWithheld(rawRecord: Record<string, unknown>, rtaType: RtaType): boolean {
  if (rtaType !== "CAMS") return false;
  const headerLookup = buildHeaderLookup(rawRecord);
  const required: BrokerageWithheldField[] = ["folioNumber", "transactionNumber", "trailFeeWithheld", "upfrontWithheld"];
  return required.every((field) => getRawValue(rawRecord, headerLookup, field) !== undefined);
}

export function mapBrokerageWithheldRecord(rawRecord: Record<string, unknown>): NormalizedBrokerageWithheldRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const get = (field: BrokerageWithheldField) => getRawValue(rawRecord, headerLookup, field);
  const reportCode = "BROKERAGE_WITHHELD";

  return {
    folioNumber: requireString(get("folioNumber"), "folioNumber", reportCode),
    transactionNumber: optionalString(get("transactionNumber")),
    investorName: optionalString(get("investorName")),
    investorPan: optionalString(get("investorPan")),
    amcCode: optionalString(get("amcCode")),
    schemeCode: optionalString(get("schemeCode")),
    brokerArnCode: optionalString(get("brokerArnCode")),
    kycStatusAtWithholding: optionalString(get("kycStatusAtWithholding")),
    trailFeeWithheld: parseRtaNumber(get("trailFeeWithheld")),
    transactionIncentiveWithheld: parseRtaNumber(get("transactionIncentiveWithheld")),
    upfrontWithheld: parseRtaNumber(get("upfrontWithheld")),
    processedDate: parseRtaDate(get("processedDate")),
    reportDate: parseRtaDate(get("reportDate")),
  };
}
