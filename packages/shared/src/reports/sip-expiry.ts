import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaDate, parseRtaNumber, requireString } from "./parsing-utils";

/**
 * Column-name aliases for CAMS's WBR5 ("A list of SIP Investors whose
 * plans expire shortly") and KFintech's MFSD227 ("SIP/STP Investors Whose
 * Plan Expire Shortly") — real field layout confirmed 2026-07-27 (CAMS,
 * against live mail) and 2026-08-09 (KFintech, against the RTA's own
 * MailbackreportsFormats.xls reference — no live sample seen yet). CAMS's
 * WBR5 is CAMS's own authoritative expiring-systematic-registration list —
 * a genuine upgrade over the app's existing "SIP Expiring" report, which
 * only estimates from SipRegistration.endDate; KFintech's MFSD227 is the
 * same idea for that RTA. MFSD227 has no field equivalent to WBR5's
 * REF_NO/TAX_STATUS/UNITS, and its "ToScheme" is a scheme CODE not a name
 * (toSchemeName is left undefined for KFintech rather than substituting
 * the code) — required-field set for looksLikeSipExpiry is deliberately
 * `folioNumber`+`amcCode`+`expiryDate`+`frequency` for KFintech (not
 * `csv: "Folio"`/`"RegistrationDate"`, which would collide with MFSD243/
 * SIP_REGISTRATION's own required set — confirmed MFSD227 uses "Acno", not
 * "Folio", and has no RegistrationDate-named column at all).
 */
const SIP_EXPIRY_ALIASES = {
  folioNumber: { cams: "FOLIO_NO", csv: "Acno" },
  refNumber: { cams: "REF_NO", csv: "" },
  investorName: { cams: "INV_NAME", csv: "Name" },
  amcCode: { cams: "AMC_CODE", csv: "Fund" },
  schemeName: { cams: "SCH_NAME", csv: "Schdesc" },
  toSchemeName: { cams: "TO_SCH_NAM", csv: "" },
  transactionType: { cams: "TRXNTYPE", csv: "TrType" },
  amount: { cams: "AMOUNT", csv: "Amount" },
  units: { cams: "UNITS", csv: "" },
  brokerArnCode: { cams: "BROK_DLR_C", csv: "Agent" },
  taxStatus: { cams: "TAX_STATUS", csv: "" },
  expiryDate: { cams: "TO_DATE", csv: "EndDate" },
  frequency: { cams: "", csv: "Frequency" },
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

function resolveAliasKey(rtaType: RtaType): "cams" | "csv" {
  return rtaType === "CAMS" ? "cams" : "csv";
}

function getRawValue(
  rawRecord: Record<string, unknown>,
  headerLookup: Map<string, string>,
  field: SipExpiryField,
  aliasKey: "cams" | "csv",
): unknown {
  const columnName = SIP_EXPIRY_ALIASES[field][aliasKey];
  if (!columnName) return undefined;
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

export function looksLikeSipExpiry(rawRecord: Record<string, unknown>, rtaType: RtaType): boolean {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(rtaType);
  const required: SipExpiryField[] =
    rtaType === "CAMS"
      ? ["folioNumber", "refNumber", "expiryDate", "toSchemeName"]
      : ["folioNumber", "amcCode", "expiryDate", "frequency"];
  return required.every((field) => getRawValue(rawRecord, headerLookup, field, aliasKey) !== undefined);
}

export function mapSipExpiryRecord(rawRecord: Record<string, unknown>, rtaType: RtaType): NormalizedSipExpiryRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(rtaType);
  const get = (field: SipExpiryField) => getRawValue(rawRecord, headerLookup, field, aliasKey);
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
