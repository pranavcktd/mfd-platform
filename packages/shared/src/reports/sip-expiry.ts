import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaDate, parseRtaNumber, requireString } from "./parsing-utils";

/**
 * Column-name aliases for CAMS's WBR5 ("A list of SIP Investors whose
 * plans expire shortly") — real field layout confirmed 2026-07-27 against
 * live mail. CAMS's own authoritative expiring-systematic-registration
 * list — a genuine upgrade over the app's existing "SIP Expiring" report,
 * which only estimates from SipRegistration.endDate. Real sample data
 * confirmed this also covers expiring STP/switch registrations
 * (transactionType "SO" with a toSchemeName), not pure SIP alone.
 * Unlike every other report ingested so far, this one carries NO explicit
 * report-generation-date field — reportDate is left undefined rather than
 * defaulted to "now" (see schema.prisma's RtaSystematicExpiry doc comment).
 */
const SIP_EXPIRY_ALIASES = {
  folioNumber: { cams: "FOLIO_NO" },
  refNumber: { cams: "REF_NO" },
  investorName: { cams: "INV_NAME" },
  amcCode: { cams: "AMC_CODE" },
  schemeName: { cams: "SCH_NAME" },
  toSchemeName: { cams: "TO_SCH_NAM" },
  transactionType: { cams: "TRXNTYPE" },
  amount: { cams: "AMOUNT" },
  units: { cams: "UNITS" },
  brokerArnCode: { cams: "BROK_DLR_C" },
  taxStatus: { cams: "TAX_STATUS" },
  expiryDate: { cams: "TO_DATE" },
} as const;

type SipExpiryField = keyof typeof SIP_EXPIRY_ALIASES;

export interface NormalizedSipExpiryRecord {
  folioNumber: string;
  refNumber?: string;
  investorName?: string;
  amcCode?: string;
  schemeName?: string;
  toSchemeName?: string;
  transactionType?: string;
  amount?: number;
  units?: number;
  brokerArnCode?: string;
  taxStatus?: string;
  expiryDate?: Date;
}

function getRawValue(
  rawRecord: Record<string, unknown>,
  headerLookup: Map<string, string>,
  field: SipExpiryField,
): unknown {
  const columnName = SIP_EXPIRY_ALIASES[field].cams;
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

export function looksLikeSipExpiry(rawRecord: Record<string, unknown>, rtaType: RtaType): boolean {
  if (rtaType !== "CAMS") return false;
  const headerLookup = buildHeaderLookup(rawRecord);
  const required: SipExpiryField[] = ["folioNumber", "refNumber", "expiryDate", "toSchemeName"];
  return required.every((field) => getRawValue(rawRecord, headerLookup, field) !== undefined);
}

export function mapSipExpiryRecord(rawRecord: Record<string, unknown>): NormalizedSipExpiryRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const get = (field: SipExpiryField) => getRawValue(rawRecord, headerLookup, field);
  const reportCode = "SIP_EXPIRY";

  return {
    folioNumber: requireString(get("folioNumber"), "folioNumber", reportCode),
    refNumber: optionalString(get("refNumber")),
    investorName: optionalString(get("investorName")),
    amcCode: optionalString(get("amcCode")),
    schemeName: optionalString(get("schemeName")),
    toSchemeName: optionalString(get("toSchemeName")),
    transactionType: optionalString(get("transactionType")),
    amount: parseRtaNumber(get("amount")),
    units: parseRtaNumber(get("units")),
    brokerArnCode: optionalString(get("brokerArnCode")),
    taxStatus: optionalString(get("taxStatus")),
    expiryDate: parseRtaDate(get("expiryDate")),
  };
}
