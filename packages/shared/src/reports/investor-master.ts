import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaDate, parseRtaNumber, requireString } from "./parsing-utils";
import { NormalizedNomineeRecord } from "./nominee-details";

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
 *
 * CAMS values are arrays, not single strings — WBR9C ("Investor Static
 * details with KYC Status") satisfies this report's own `looksLike` check
 * (shares folioNumber/investorName/bankAccountNumber with WBR9) but uses
 * DIFFERENT real DBF field names for PAN and product code (`PAN_PEKRN` /
 * `PRODUCT_CO`, not WBR9's `PAN_NO` / `PRODUCT`) — confirmed 2026-08-09 by
 * decrypting a real WBR9C file. Silently missing PAN/productCode here fed
 * `upsertInvestorMasterClientAndFolio`'s no-identity fallback branch, which
 * has NO deduplication — created a brand-new, folio-less ghost Client for
 * every single WBR9C row (3,758 real ghost clients found across the whole
 * platform from this one gap). Each field now tries every known real
 * column name in order, first match wins — extend this list rather than
 * assuming a single canonical name whenever a new CAMS variant report is
 * found routing through this same mapper.
 */
const INVESTOR_MASTER_ALIASES = {
  amcCode: { cams: ["AMC_CODE"], csv: ["Fund"] },
  productCode: { cams: ["PRODUCT", "PRODUCT_CO"], csv: ["Product Code"] },
  folioNumber: { cams: ["FOLIOCHK"], csv: ["Folio"] },
  investorName: { cams: ["INV_NAME"], csv: ["Investor Name"] },
  investorPan: { cams: ["PAN_NO", "PAN_PEKRN"], csv: ["PAN Number"] },
  address1: { cams: ["ADDRESS1"], csv: ["Address #1"] },
  address2: { cams: ["ADDRESS2"], csv: ["Address #2"] },
  city: { cams: ["CITY"], csv: ["City"] },
  pincode: { cams: ["PINCODE"], csv: ["Pincode"] },
  email: { cams: ["EMAIL"], csv: ["Email"] },
  mobile: { cams: ["MOBILE_NO"], csv: ["Mobile Number"] },
  dateOfBirth: { cams: ["INV_DOB"], csv: ["Date of Birth"] },
  taxStatus: { cams: ["TAX_STATUS"], csv: ["Tax Status"] },
  bankAccountNumber: { cams: ["AC_NO"], csv: ["BankAccno"] },
  bankName: { cams: ["BANK_NAME"], csv: ["Bank Name"] },
  brokerArnCode: { cams: ["BROKCODE"], csv: ["Broker Code"] },
  reportDate: { cams: ["REP_DATE"], csv: ["Report Date"] },
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
  const candidates = INVESTOR_MASTER_ALIASES[field][aliasKey] as readonly string[];
  for (const columnName of candidates) {
    const actualKey = headerLookup.get(columnName.trim().toLowerCase());
    if (actualKey !== undefined) return rawRecord[actualKey];
  }
  return undefined;
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

/**
 * CAMS's WBR9/WBR9C carry up to 3 nominees inline on the SAME row as the
 * rest of the investor's static details — unlike KFintech, which sends
 * nominee data as its own separate report (MFSD264, see nominee-details.ts).
 * Real field names confirmed 2026-08-10 by decrypting a real WBR9C file:
 * irregular naming, NOT a clean NOM{slot}_ prefix pattern — slot 1 has no
 * number at all (NOM_NAME/RELATION/NOM_PERCEN), slots 2-3 abbreviate
 * RELATION to RELAT and PERCENTAGE to PERCE. Confirmed real sample: a
 * client's real nominee "SAVITA SINGH"/"WIFE"/100% was sitting unextracted
 * in the source data this whole time — the investor-master mapper only
 * pulled the client's OWN fields, never looked at these columns at all.
 * KFintech's investor-master report (MFSD211) has no equivalent inline
 * nominee columns, so this only ever produces rows for rtaType === "CAMS".
 */
const CAMS_NOMINEE_SLOT_COLUMNS: ReadonlyArray<{ name: string; relation: string; ratio: string }> = [
  { name: "NOM_NAME", relation: "RELATION", ratio: "NOM_PERCEN" },
  { name: "NOM2_NAME", relation: "NOM2_RELAT", ratio: "NOM2_PERCE" },
  { name: "NOM3_NAME", relation: "NOM3_RELAT", ratio: "NOM3_PERCE" },
];

export function mapInvestorMasterNominees(rawRecord: Record<string, unknown>, rtaType: RtaType): NormalizedNomineeRecord[] {
  if (rtaType !== "CAMS") return [];
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(rtaType);
  const get = (field: InvestorMasterField) => getRawValue(rawRecord, headerLookup, field, aliasKey);
  const folioNumber = optionalString(get("folioNumber"));
  if (!folioNumber) return [];

  const amcCode = optionalString(get("amcCode"));
  const investorName = optionalString(get("investorName"));
  const investorPan = optionalString(get("investorPan"));
  const brokerArnCode = optionalString(get("brokerArnCode"));

  const results: NormalizedNomineeRecord[] = [];
  CAMS_NOMINEE_SLOT_COLUMNS.forEach((columns, index) => {
    const nameKey = headerLookup.get(columns.name.toLowerCase());
    const nomineeName = optionalString(nameKey !== undefined ? rawRecord[nameKey] : undefined);
    if (!nomineeName) return; // unused slot
    const relationKey = headerLookup.get(columns.relation.toLowerCase());
    const ratioKey = headerLookup.get(columns.ratio.toLowerCase());
    results.push({
      folioNumber,
      amcCode,
      investorName,
      investorPan,
      brokerArnCode,
      nomineeSlot: index + 1,
      nomineeName,
      nomineeRelation: optionalString(relationKey !== undefined ? rawRecord[relationKey] : undefined),
      nomineeRatio: parseRtaNumber(ratioKey !== undefined ? rawRecord[ratioKey] : undefined),
    });
  });
  return results;
}
