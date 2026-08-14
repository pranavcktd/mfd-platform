import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaDate, requireString } from "./parsing-utils";

/**
 * Column-name aliases for CAMS's WBR56 ("KYC status of Investor") and
 * KFintech's MFSD239 ("KYC Report") — CAMS confirmed 2026-07-27 against
 * live mail; KFintech built 2026-08-09 from the RTA's own
 * MailbackreportsFormats.xls reference, NOT yet verified against a real
 * sample. FLAG: MFSD239's own reference sheet has a field-name/description
 * mismatch (e.g. field "PAN1" is described as "First Holder Name" instead
 * of a PAN, "HOLD1" as "It displays the Plan") that doesn't fit any other
 * report's real structure — this mapping follows the FIELD NAMES
 * (PAN1/2/3/PANG really are PANs, KYC1/2/3/KYCG really are per-holder KYC
 * statuses, HOLD1/2/3/HOLDG really are holder names, matching WBR56's own
 * inv_name/jname1/jname2/guardian shape) rather than the doc's prose,
 * since the field-naming convention is consistent with every other KYC/
 * investor-master report seen so far and the prose isn't. Re-verify the
 * first time a real KFintech MFSD239 file actually comes through.
 */
const KYC_STATUS_ALIASES = {
  folioNumber: { cams: "FOLIO", csv: "Acno" },
  investorName: { cams: "INV_NAME", csv: "Hold1" },
  investorPan: { cams: "TAX_NO", csv: "Pan1" },
  amcCode: { cams: "AMC_CODE", csv: "Fund" },
  brokerArnCode: { cams: "BROK_DLR_C", csv: "" },
  kycStatus: { cams: "FH_KYC", csv: "Kyc1" },
  kycStatusDescription: { cams: "FH_KYC_DES", csv: "" },
  aadhaarStatus: { cams: "FH_G_AADHA", csv: "" },
  reportDate: { cams: "REP_DATE", csv: "" },
} as const;

type KycStatusField = keyof typeof KYC_STATUS_ALIASES;

export interface NormalizedKycStatusRecord {
  folioNumber: string;
  investorName?: string;
  investorPan?: string;
  amcCode?: string;
  brokerArnCode?: string;
  kycStatus?: string;
  kycStatusDescription?: string;
  aadhaarStatus?: string;
  reportDate?: Date;
}

function resolveAliasKey(rtaType: RtaType): "cams" | "csv" {
  return rtaType === "CAMS" ? "cams" : "csv";
}

function getRawValue(
  rawRecord: Record<string, unknown>,
  headerLookup: Map<string, string>,
  field: KycStatusField,
  aliasKey: "cams" | "csv",
): unknown {
  const columnName = KYC_STATUS_ALIASES[field][aliasKey];
  if (!columnName) return undefined;
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

export function looksLikeKycStatus(rawRecord: Record<string, unknown>, rtaType: RtaType): boolean {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(rtaType);
  const required: KycStatusField[] =
    rtaType === "CAMS" ? ["folioNumber", "kycStatus", "aadhaarStatus"] : ["folioNumber", "amcCode", "kycStatus", "investorPan"];
  return required.every((field) => getRawValue(rawRecord, headerLookup, field, aliasKey) !== undefined);
}

export function mapKycStatusRecord(rawRecord: Record<string, unknown>, rtaType: RtaType): NormalizedKycStatusRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(rtaType);
  const get = (field: KycStatusField) => getRawValue(rawRecord, headerLookup, field, aliasKey);
  const reportCode = "KYC_STATUS";

  return {
    folioNumber: requireString(get("folioNumber"), "folioNumber", reportCode),
    investorName: optionalString(get("investorName")),
    investorPan: optionalString(get("investorPan")),
    amcCode: optionalString(get("amcCode")),
    brokerArnCode: optionalString(get("brokerArnCode")),
    kycStatus: optionalString(get("kycStatus")),
    kycStatusDescription: optionalString(get("kycStatusDescription")),
    aadhaarStatus: optionalString(get("aadhaarStatus")),
    reportDate: parseRtaDate(get("reportDate")),
  };
}
