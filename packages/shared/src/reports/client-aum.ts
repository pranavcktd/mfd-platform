import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaDate, parseRtaNumber, requireString } from "./parsing-utils";

/**
 * Column-name aliases for the folio-level AUM/balance snapshot report:
 * CAMS's WBR4 ("Investors Static Details with balance") and KFintech's
 * MFSD 203 ("Client-wise AUM Report"). Despite WBR4's name suggesting
 * investor master data, its distinguishing fields (CLOS_BAL/RUPEE_BAL)
 * are a units/valuation snapshot per folio, matching MFSD203's
 * Balance/AUM fields — this is an AUM report, not the investor master
 * (that's WBR9/MFSD211, see investor-master.ts). Field names taken from
 * real sample exports, same rtaType-only alias selection as investor-master.ts.
 */
const CLIENT_AUM_ALIASES = {
  amcCode: { cams: "AMC_CODE", csv: "Fund" },
  productCode: { cams: "PRODUCT", csv: "Product Code" },
  schemeDescription: { cams: "SCH_NAME", csv: "Fund Description" },
  folioNumber: { cams: "FOLIOCHK", csv: "Folio Number" },
  investorName: { cams: "INV_NAME", csv: "Investor Name" },
  investorPan: { cams: "PAN_NO", csv: "PAN" },
  balanceUnits: { cams: "CLOS_BAL", csv: "Balance" },
  valuationAmount: { cams: "RUPEE_BAL", csv: "AUM" },
  brokerArnCode: { cams: "BROKER_COD", csv: "Agent Code" },
  reportDate: { cams: "REP_DATE", csv: "Report Date" },
} as const;

type ClientAumField = keyof typeof CLIENT_AUM_ALIASES;

export interface NormalizedClientAumRecord {
  amcCode?: string;
  productCode?: string;
  schemeDescription?: string;
  folioNumber: string;
  investorName?: string;
  investorPan?: string;
  balanceUnits?: number;
  valuationAmount?: number;
  navPerUnit?: number;
  brokerArnCode?: string;
  reportDate?: Date;
  isin?: string;
}

function resolveAliasKey(rtaType: RtaType): "cams" | "csv" {
  return rtaType === "CAMS" ? "cams" : "csv";
}

function getRawValue(
  rawRecord: Record<string, unknown>,
  headerLookup: Map<string, string>,
  field: ClientAumField,
  aliasKey: "cams" | "csv",
): unknown {
  const columnName = CLIENT_AUM_ALIASES[field][aliasKey];
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

export function looksLikeClientAum(rawRecord: Record<string, unknown>, rtaType: RtaType): boolean {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(rtaType);
  const required: ClientAumField[] = ["folioNumber", "balanceUnits", "valuationAmount"];
  return required.every((field) => getRawValue(rawRecord, headerLookup, field, aliasKey) !== undefined);
}

export function mapClientAumRecord(
  rawRecord: Record<string, unknown>,
  rtaType: RtaType,
): NormalizedClientAumRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const aliasKey = resolveAliasKey(rtaType);
  const get = (field: ClientAumField) => getRawValue(rawRecord, headerLookup, field, aliasKey);
  const reportCode = "CLIENT_AUM";

  // CAMS WBR4 has no per-unit NAV field, only the rupee balance — KFintech's
  // MFSD203 "NAV" column has no CAMS equivalent, so it's looked up directly
  // rather than through the shared two-RTA alias table.
  const navColumn = rtaType === "KFINTECH" ? headerLookup.get("nav") : undefined;
  const navPerUnit = navColumn !== undefined ? parseRtaNumber(rawRecord[navColumn]) : undefined;

  // ISIN — real column confirmed in KFintech's own MFSD203 CSV export
  // ("SchemeISIN"). CAMS's WBR4 DBF has no equivalent field (checked the
  // real field list: FOLIOCHK, SCH_NAME, ... no ISIN-shaped column) — CAMS
  // folios instead get isin via the WBR39 scheme-master name-join.
  const isinColumn = rtaType === "KFINTECH" ? headerLookup.get("schemeisin") : undefined;
  const isin = isinColumn !== undefined ? optionalString(rawRecord[isinColumn]) : undefined;

  return {
    amcCode: optionalString(get("amcCode")),
    productCode: optionalString(get("productCode")),
    schemeDescription: optionalString(get("schemeDescription")),
    folioNumber: requireString(get("folioNumber"), "folioNumber", reportCode),
    investorName: optionalString(get("investorName")),
    investorPan: optionalString(get("investorPan")),
    balanceUnits: parseRtaNumber(get("balanceUnits")),
    valuationAmount: parseRtaNumber(get("valuationAmount")),
    navPerUnit,
    brokerArnCode: optionalString(get("brokerArnCode")),
    reportDate: parseRtaDate(get("reportDate")),
    isin,
  };
}
