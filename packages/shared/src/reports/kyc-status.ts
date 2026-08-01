import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaDate, requireString } from "./parsing-utils";

/**
 * Column-name aliases for CAMS's WBR56 ("KYC status of Investor") — real
 * field layout confirmed 2026-07-27 against live mail (see
 * mfd_ingestion_engine memory). CAMS-only so far — no KFintech sample seen
 * yet, so there's no csv alias set (matches the alias-selection convention
 * of investor-master.ts/client-aum.ts, which are also rtaType-only). Turns
 * out to be CAMS's single combined answer to both "KYC report" and
 * "Aadhaar-PAN link report" — one row per folio, with KYC + Aadhaar status
 * for the primary holder plus guardian/joint holders, though only the
 * primary holder's status is captured here for now.
 */
const KYC_STATUS_ALIASES = {
  folioNumber: { cams: "FOLIO" },
  investorName: { cams: "INV_NAME" },
  investorPan: { cams: "TAX_NO" },
  amcCode: { cams: "AMC_CODE" },
  brokerArnCode: { cams: "BROK_DLR_C" },
  kycStatus: { cams: "FH_KYC" },
  kycStatusDescription: { cams: "FH_KYC_DES" },
  aadhaarStatus: { cams: "FH_G_AADHA" },
  reportDate: { cams: "REP_DATE" },
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

function getRawValue(
  rawRecord: Record<string, unknown>,
  headerLookup: Map<string, string>,
  field: KycStatusField,
): unknown {
  const columnName = KYC_STATUS_ALIASES[field].cams;
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

export function looksLikeKycStatus(rawRecord: Record<string, unknown>, rtaType: RtaType): boolean {
  if (rtaType !== "CAMS") return false;
  const headerLookup = buildHeaderLookup(rawRecord);
  const required: KycStatusField[] = ["folioNumber", "kycStatus", "aadhaarStatus"];
  return required.every((field) => getRawValue(rawRecord, headerLookup, field) !== undefined);
}

export function mapKycStatusRecord(rawRecord: Record<string, unknown>): NormalizedKycStatusRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const get = (field: KycStatusField) => getRawValue(rawRecord, headerLookup, field);
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
