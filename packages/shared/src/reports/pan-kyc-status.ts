import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaDate, requireString } from "./parsing-utils";

/**
 * Column-name aliases for KFintech's MFSD262 ("PAN Level KYC Report —
 * Validated KYCs & Registered/On Hold/Invalid KYCs") — built 2026-08-09
 * from the RTA's own MailbackreportsFormats.xls reference, not yet
 * verified against a real sample. Genuinely different granularity from
 * WBR56/MFSD239 (KYC_STATUS): this report has NO folio number at all — one
 * row per PAN, covering every folio that PAN holds across every AMC. CAMS
 * has no equivalent report currently known, so this is KFintech-only —
 * looksLikePanKycStatus gates on rtaType === "KFINTECH" the same way
 * scheme-master.ts gates SCHEME_MASTER to its own single source.
 */
const PAN_KYC_STATUS_ALIASES = {
  amcCode: "AMC code",
  investorPan: "PAN",
  investorName: "Investor Name",
  kycStatusCode: "KYC Status Code",
  kycStatusDescription: "KYC Status Description",
  kycRejectionReason: "KYC Rejection Reason",
  reportDate: "report generation date",
  brokerArnCode: "ARN Code",
} as const;

type PanKycStatusField = keyof typeof PAN_KYC_STATUS_ALIASES;

export interface NormalizedPanKycStatusRecord {
  investorPan: string;
  amcCode?: string;
  investorName?: string;
  kycStatusCode?: string;
  kycStatusDescription?: string;
  kycRejectionReason?: string;
  reportDate?: Date;
  brokerArnCode?: string;
}

function getRawValue(rawRecord: Record<string, unknown>, headerLookup: Map<string, string>, field: PanKycStatusField): unknown {
  const columnName = PAN_KYC_STATUS_ALIASES[field];
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

export function looksLikePanKycStatus(rawRecord: Record<string, unknown>, rtaType: RtaType): boolean {
  if (rtaType !== "KFINTECH") return false;
  const headerLookup = buildHeaderLookup(rawRecord);
  const required: PanKycStatusField[] = ["investorPan", "kycStatusCode", "kycStatusDescription"];
  return required.every((field) => getRawValue(rawRecord, headerLookup, field) !== undefined);
}

export function mapPanKycStatusRecord(rawRecord: Record<string, unknown>): NormalizedPanKycStatusRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const get = (field: PanKycStatusField) => getRawValue(rawRecord, headerLookup, field);
  const reportCode = "PAN_KYC_STATUS";

  return {
    investorPan: requireString(get("investorPan"), "investorPan", reportCode),
    amcCode: optionalString(get("amcCode")),
    investorName: optionalString(get("investorName")),
    kycStatusCode: optionalString(get("kycStatusCode")),
    kycStatusDescription: optionalString(get("kycStatusDescription")),
    kycRejectionReason: optionalString(get("kycRejectionReason")),
    reportDate: parseRtaDate(get("reportDate")),
    brokerArnCode: optionalString(get("brokerArnCode")),
  };
}
