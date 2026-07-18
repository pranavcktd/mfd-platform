import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaDate, requireString } from "./parsing-utils";

/**
 * Column-name aliases for the Investor Master report: CAMS's WBR9
 * ("Investor Static details feed - CRMS Format") and KFintech's MFSD 211
 * ("Investor Master Information"). Unlike MFSD 201, these are two
 * genuinely different RTA report definitions, not a shared "common
 * format" — field names were taken directly from real sample exports
 * (CAMS DBF field names, KFintech CSV headers), not from the xls
 * reference matrix (which only documents KFintech's own reports).
 * CAMS always sends this as .dbf and KFintech always as .csv/.txt, so
 * alias selection only depends on rtaType, not sourceFormat.
 */
const INVESTOR_MASTER_ALIASES = {
  amcCode: { cams: "AMC_CODE", csv: "Fund" },
  productCode: { cams: "PRODUCT", csv: "Product Code" },
  folioNumber: { cams: "FOLIOCHK", csv: "Folio" },
  investorName: { cams: "INV_NAME", csv: "Investor Name" },
  investorPan: { cams: "PAN_NO", csv: "PAN Number" },
  address1: { cams: "ADDRESS1", csv: "Address #1" },
  address2: { cams: "ADDRESS2", csv: "Address #2" },
  city: { cams: "CITY", csv: "City" },
  pincode: { cams: "PINCODE", csv: "Pincode" },
  email: { cams: "EMAIL", csv: "Email" },
  mobile: { cams: "MOBILE_NO", csv: "Mobile Number" },
  dateOfBirth: { cams: "INV_DOB", csv: "Date of Birth" },
  taxStatus: { cams: "TAX_STATUS", csv: "Tax Status" },
  bankAccountNumber: { cams: "AC_NO", csv: "BankAccno" },
  bankName: { cams: "BANK_NAME", csv: "Bank Name" },
  brokerArnCode: { cams: "BROKCODE", csv: "Broker Code" },
  reportDate: { cams: "REP_DATE", csv: "Report Date" },
} as const;

type InvestorMasterField = keyof typeof INVESTOR_MASTER_ALIASES;

export interface NormalizedInvestorMasterRecord {
  amcCode?: string;
  productCode?: string;
  folioNumber: string;
  investorName: string;
  investorPan?: string;
  address1?: string;
  address2?: string;
  city?: string;
  pincode?: string;
  email?: string;
  mobile?: string;
  dateOfBirth?: Date;
  taxStatus?: string;
  bankAccountNumber?: string;
  bankName?: string;
  brokerArnCode?: string;
  reportDate?: Date;
}

function resolveAliasKey(rtaType: RtaType): "cams" | "csv" {
  return rtaType === "CAMS" ? "cams" : "csv";
}

function getRawValue(
  rawRecord: Record<string, unknown>,
  headerLookup: Map<string, string>,
  field: InvestorMasterField,
  aliasKey: "cams" | "csv",
): unknown {
  const columnName = INVESTOR_MASTER_ALIASES[field][aliasKey];
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

export function looksLikeInvestorMaster(rawRecord: Record<string, unknown>, rtaType: RtaType): boolean {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(rtaType);
  const required: InvestorMasterField[] = ["folioNumber", "investorName", "bankAccountNumber"];
  return required.every((field) => getRawValue(rawRecord, headerLookup, field, aliasKey) !== undefined);
}

export function mapInvestorMasterRecord(
  rawRecord: Record<string, unknown>,
  rtaType: RtaType,
): NormalizedInvestorMasterRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(rtaType);
  const get = (field: InvestorMasterField) => getRawValue(rawRecord, headerLookup, field, aliasKey);
  const reportCode = "INVESTOR_MASTER";

  return {
    amcCode: optionalString(get("amcCode")),
    productCode: optionalString(get("productCode")),
    folioNumber: requireString(get("folioNumber"), "folioNumber", reportCode),
    investorName: requireString(get("investorName"), "investorName", reportCode),
    investorPan: optionalString(get("investorPan")),
    address1: optionalString(get("address1")),
    address2: optionalString(get("address2")),
    city: optionalString(get("city")),
    pincode: optionalString(get("pincode")),
    email: optionalString(get("email")),
    mobile: optionalString(get("mobile")),
    dateOfBirth: parseRtaDate(get("dateOfBirth")),
    taxStatus: optionalString(get("taxStatus")),
    bankAccountNumber: optionalString(get("bankAccountNumber")),
    bankName: optionalString(get("bankName")),
    brokerArnCode: optionalString(get("brokerArnCode")),
    reportDate: parseRtaDate(get("reportDate")),
  };
}
