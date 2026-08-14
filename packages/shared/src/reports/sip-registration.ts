import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaDate, parseRtaNumber, requireString } from "./parsing-utils";

/**
 * Column-name aliases for the SIP/STP registration report: CAMS's WBR49
 * ("SIP-STP procured for the period") and KFintech's MFSD 243 ("SIP
 * registration report"). Field names taken from real sample exports.
 * CAMS's WBR49 has no plain broker/agent code field — SUB_ARN_CO (Sub
 * ARN Code) is the closest available and used as brokerArnCode.
 */
const SIP_REGISTRATION_ALIASES = {
  amcCode: { cams: "AMC_CODE", csv: "Fund Code" },
  productCode: { cams: "PRODUCT", csv: "Product Code" },
  schemeCode: { cams: "SCHEME_COD", csv: "Scheme" },
  folioNumber: { cams: "FOLIO_NO", csv: "Folio" },
  investorName: { cams: "INV_NAME", csv: "Investor Name" },
  investorPan: { cams: "PAN", csv: "PAN" },
  sipAmount: { cams: "AUTO_AMOUN", csv: "Amount" },
  frequency: { cams: "PERIODICIT", csv: "Frequency" },
  startDate: { cams: "FROM_DATE", csv: "Start Date" },
  endDate: { cams: "TO_DATE", csv: "End Date" },
  registrationDate: { cams: "REG_DATE", csv: "RegistrationDate" },
  ceaseDate: { cams: "CEASE_DATE", csv: "TerminateDate" },
  brokerArnCode: { cams: "SUB_ARN_CO", csv: "AgentCode" },
  /// CAMS's raw code, KFintech's own plain-English label — see
  /// normalizeRegistrationType for how each maps to SIP/STP/SWP.
  transactionType: { cams: "AUT_TRNTYP", csv: "Trtype" },
} as const;

/// CAMS's WBR49 AUT_TRNTYP codes, confirmed 2026-08-11 against two real
/// decrypted archives (ARN-181020, ARN-91053): "P" (Purchase, bank-funded,
/// no target scheme) is the plain SIP; "SO" and "DTP" both carry a populated
/// TARGET_SCH (money auto-switches into another scheme) and are STP; "R"
/// (redemption, no target scheme, no bank) is SWP. KFintech's MFSD243
/// Trtype column already spells out "SIP"/"STP"/"SWP" directly, so those
/// pass through unchanged. Any other/unrecognized code returns undefined
/// rather than guessing — shows up as "unclassified" downstream instead of
/// silently mislabeling a registration type nobody's confirmed yet.
const CAMS_TRANSACTION_TYPE_CODES: Record<string, "SIP" | "STP" | "SWP"> = {
  P: "SIP",
  SO: "STP",
  DTP: "STP",
  R: "SWP",
};

function normalizeRegistrationType(rawCode: string | undefined, rtaType: RtaType): "SIP" | "STP" | "SWP" | undefined {
  if (!rawCode) return undefined;
  const code = rawCode.trim().toUpperCase();
  if (rtaType === "KFINTECH") {
    return code === "SIP" || code === "STP" || code === "SWP" ? code : undefined;
  }
  return CAMS_TRANSACTION_TYPE_CODES[code];
}

type SipRegistrationField = keyof typeof SIP_REGISTRATION_ALIASES;

export interface NormalizedSipRegistrationRecord {
  amcCode?: string;
  productCode?: string;
  schemeCode?: string;
  folioNumber: string;
  investorName?: string;
  investorPan?: string;
  sipAmount?: number;
  frequency?: string;
  startDate?: Date;
  endDate?: Date;
  registrationDate: Date;
  ceaseDate?: Date;
  isActive: boolean;
  brokerArnCode?: string;
  registrationType?: "SIP" | "STP" | "SWP";
}

function resolveAliasKey(rtaType: RtaType): "cams" | "csv" {
  return rtaType === "CAMS" ? "cams" : "csv";
}

function getRawValue(
  rawRecord: Record<string, unknown>,
  headerLookup: Map<string, string>,
  field: SipRegistrationField,
  aliasKey: "cams" | "csv",
): unknown {
  const columnName = SIP_REGISTRATION_ALIASES[field][aliasKey];
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

export function looksLikeSipRegistration(rawRecord: Record<string, unknown>, rtaType: RtaType): boolean {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(rtaType);
  const required: SipRegistrationField[] = ["folioNumber", "sipAmount", "frequency", "registrationDate"];
  return required.every((field) => getRawValue(rawRecord, headerLookup, field, aliasKey) !== undefined);
}

export function mapSipRegistrationRecord(
  rawRecord: Record<string, unknown>,
  rtaType: RtaType,
): NormalizedSipRegistrationRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(rtaType);
  const get = (field: SipRegistrationField) => getRawValue(rawRecord, headerLookup, field, aliasKey);
  const reportCode = "SIP_REGISTRATION";

  const ceaseDate = parseRtaDate(get("ceaseDate"));

  return {
    amcCode: optionalString(get("amcCode")),
    productCode: optionalString(get("productCode")),
    schemeCode: optionalString(get("schemeCode")),
    folioNumber: requireString(get("folioNumber"), "folioNumber", reportCode),
    investorName: optionalString(get("investorName")),
    investorPan: optionalString(get("investorPan")),
    sipAmount: parseRtaNumber(get("sipAmount")),
    frequency: optionalString(get("frequency")),
    startDate: parseRtaDate(get("startDate")),
    endDate: parseRtaDate(get("endDate")),
    registrationDate: parseRtaDate(get("registrationDate")) ?? (() => {
      throw new Error(`Missing required ${reportCode} field: registrationDate`);
    })(),
    ceaseDate,
    isActive: ceaseDate === undefined,
    brokerArnCode: optionalString(get("brokerArnCode")),
    registrationType: normalizeRegistrationType(optionalString(get("transactionType")), rtaType),
  };
}
