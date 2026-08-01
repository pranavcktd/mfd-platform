import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaNumber, requireString } from "./parsing-utils";

/**
 * Column-name aliases for CAMS's WBR39 ("Scheme details") — real field
 * layout confirmed 2026-07-27 against live mail (a 7,110-row export). A
 * GLOBAL, non-tenant-scoped industry-wide scheme catalog — every AMC's
 * every scheme, not just ones any particular MFD holds. No per-row
 * ARN/broker code exists in this report at all (confirmed against the real
 * sample), so unlike every other report type here it can never go through
 * resolveTenantFromRecords — schema-mapping.processor.ts special-cases
 * this report code to bypass tenant resolution entirely and upsert
 * straight into the global SchemeMaster table.
 */
const SCHEME_MASTER_ALIASES = {
  amcCode: { cams: "AMC_CODE" },
  amcName: { cams: "AMC" },
  schemeCode: { cams: "SCH_CODE" },
  schemeName: { cams: "SCH_NAME" },
  schemeType: { cams: "SCH_TYPE" },
  assetClass: { cams: "ASSET_CLAS" },
  sebiClassification: { cams: "SEBI_CLASS" },
  isin: { cams: "ISIN_NO" },
  planType: { cams: "PLAN_TYPE" },
  sipAllowed: { cams: "SIP_ALLOW" },
  swpAllowed: { cams: "SWP_ALLOW" },
  stpAllowed: { cams: "STP_ALLOW" },
  closeEnded: { cams: "CLOSE_END" },
  elssScheme: { cams: "ELSS_SCH" },
  minSipAmount: { cams: "SIP_MN_AMT" },
  minPurchaseAmount: { cams: "NEWP_MNVAL" },
  faceValue: { cams: "FACE_VALUE" },
  parentSchemeCode: { cams: "PARENT_SCH" },
} as const;

type SchemeMasterField = keyof typeof SCHEME_MASTER_ALIASES;

export interface NormalizedSchemeMasterRecord {
  amcCode: string;
  amcName?: string;
  schemeCode: string;
  schemeName: string;
  schemeType?: string;
  assetClass?: string;
  sebiClassification?: string;
  isin?: string;
  planType?: string;
  sipAllowed?: boolean;
  swpAllowed?: boolean;
  stpAllowed?: boolean;
  closeEnded?: boolean;
  elssScheme?: boolean;
  minSipAmount?: number;
  minPurchaseAmount?: number;
  faceValue?: number;
  parentSchemeCode?: string;
}

function getRawValue(
  rawRecord: Record<string, unknown>,
  headerLookup: Map<string, string>,
  field: SchemeMasterField,
): unknown {
  const columnName = SCHEME_MASTER_ALIASES[field].cams;
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

/** "Y"/"N" flag columns — CAMS also uses other single-letter codes (e.g. STP_ALLOW: "B") in some flag fields, so only "Y" is treated as true and everything else (including unrecognized codes) as false rather than guessing. */
function parseYesNoFlag(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value).trim().toUpperCase() === "Y";
}

export function looksLikeSchemeMaster(rawRecord: Record<string, unknown>, rtaType: RtaType): boolean {
  if (rtaType !== "CAMS") return false;
  const headerLookup = buildHeaderLookup(rawRecord);
  const required: SchemeMasterField[] = ["schemeCode", "schemeType", "sebiClassification", "isin"];
  return required.every((field) => getRawValue(rawRecord, headerLookup, field) !== undefined);
}

export function mapSchemeMasterRecord(rawRecord: Record<string, unknown>): NormalizedSchemeMasterRecord {
  const headerLookup = buildHeaderLookup(rawRecord);
  const get = (field: SchemeMasterField) => getRawValue(rawRecord, headerLookup, field);
  const reportCode = "SCHEME_MASTER";

  return {
    amcCode: requireString(get("amcCode"), "amcCode", reportCode),
    amcName: optionalString(get("amcName")),
    schemeCode: requireString(get("schemeCode"), "schemeCode", reportCode),
    schemeName: requireString(get("schemeName"), "schemeName", reportCode),
    schemeType: optionalString(get("schemeType")),
    assetClass: optionalString(get("assetClass")),
    sebiClassification: optionalString(get("sebiClassification")),
    isin: optionalString(get("isin")),
    planType: optionalString(get("planType")),
    sipAllowed: parseYesNoFlag(get("sipAllowed")),
    swpAllowed: parseYesNoFlag(get("swpAllowed")),
    stpAllowed: parseYesNoFlag(get("stpAllowed")),
    closeEnded: parseYesNoFlag(get("closeEnded")),
    elssScheme: parseYesNoFlag(get("elssScheme")),
    minSipAmount: parseRtaNumber(get("minSipAmount")),
    minPurchaseAmount: parseRtaNumber(get("minPurchaseAmount")),
    faceValue: parseRtaNumber(get("faceValue")),
    parentSchemeCode: optionalString(get("parentSchemeCode")),
  };
}
