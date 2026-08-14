import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString, parseRtaNumber } from "./parsing-utils";

/**
 * KFintech's MFSD264 ("Nominee Details") — built 2026-08-09 from the RTA's
 * own MailbackreportsFormats.xls reference (repeats the same NOM{N}_* field
 * group up to N=10, matching SEBI's up-to-10-nominees rule), not yet
 * verified against a real sample. No CAMS equivalent known yet. One SOURCE
 * ROW can carry up to 10 real nominees for one folio — expands into one
 * NormalizedNomineeRecord per populated slot, mapping onto ClientNominee's
 * existing one-row-per-nominee shape (which MFD-entered rows already use).
 */
const MAX_NOMINEE_SLOTS = 10;

const NOMINEE_FIXED_ALIASES = {
  amcCode: "FUND",
  folioNumber: "ACNO",
  investorName: "INVESTORNAME",
  investorPan: "PANNUMBER",
  brokerArnCode: "BROKERCODE",
} as const;

type FixedField = keyof typeof NOMINEE_FIXED_ALIASES;

export interface NormalizedNomineeRecord {
  folioNumber: string;
  amcCode?: string;
  investorName?: string;
  investorPan?: string;
  brokerArnCode?: string;
  nomineeSlot: number;
  nomineeName?: string;
  nomineeRelation?: string;
  nomineeRatio?: number;
}

function getFixedValue(rawRecord: Record<string, unknown>, headerLookup: Map<string, string>, field: FixedField): unknown {
  const columnName = NOMINEE_FIXED_ALIASES[field];
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

function getSlotValue(rawRecord: Record<string, unknown>, headerLookup: Map<string, string>, slot: number, suffix: string): unknown {
  const columnName = `NOM${slot}_${suffix}`;
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

export function looksLikeNomineeDetails(rawRecord: Record<string, unknown>, rtaType: RtaType): boolean {
  if (rtaType !== "KFINTECH") return false;
  const headerLookup = buildHeaderLookup(rawRecord);
  if (getFixedValue(rawRecord, headerLookup, "folioNumber") === undefined) return false;
  // Distinctive to this report: no other KFintech report has NOM1_NAME/NOM1_RELATION columns.
  return getSlotValue(rawRecord, headerLookup, 1, "NAME") !== undefined && getSlotValue(rawRecord, headerLookup, 1, "RELATION") !== undefined;
}

/** One row in, 0-10 rows out (one per populated nominee slot) — see file doc comment. */
export function mapNomineeDetailsRecords(rawRecord: Record<string, unknown>): NormalizedNomineeRecord[] {
  const headerLookup = buildHeaderLookup(rawRecord);
  const folioNumber = optionalString(getFixedValue(rawRecord, headerLookup, "folioNumber"));
  if (!folioNumber) return [];

  const amcCode = optionalString(getFixedValue(rawRecord, headerLookup, "amcCode"));
  const investorName = optionalString(getFixedValue(rawRecord, headerLookup, "investorName"));
  const investorPan = optionalString(getFixedValue(rawRecord, headerLookup, "investorPan"));
  const brokerArnCode = optionalString(getFixedValue(rawRecord, headerLookup, "brokerArnCode"));

  const results: NormalizedNomineeRecord[] = [];
  for (let slot = 1; slot <= MAX_NOMINEE_SLOTS; slot++) {
    const nomineeName = optionalString(getSlotValue(rawRecord, headerLookup, slot, "NAME"));
    if (!nomineeName) continue; // unused slot
    results.push({
      folioNumber,
      amcCode,
      investorName,
      investorPan,
      brokerArnCode,
      nomineeSlot: slot,
      nomineeName,
      nomineeRelation: optionalString(getSlotValue(rawRecord, headerLookup, slot, "RELATION")),
      nomineeRatio: parseRtaNumber(getSlotValue(rawRecord, headerLookup, slot, "RATIO")),
    });
  }
  return results;
}
