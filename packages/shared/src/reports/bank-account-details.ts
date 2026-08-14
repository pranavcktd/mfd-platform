import { RtaType } from "../report-schema";
import { buildHeaderLookup, optionalString } from "./parsing-utils";

/**
 * KFintech's MFSD263 ("Registered Bank Account Details") — built 2026-08-09
 * from the RTA's own MailbackreportsFormats.xls reference (both the
 * "SINGLE BANK" and "MULTIPLE BANK" sheet variants — the multi-bank one
 * repeats the same Bnk{N}_* field group up to N=10), not yet verified
 * against a real sample. No CAMS equivalent known yet. One SOURCE ROW can
 * carry up to 10 real bank accounts for one folio — this expands each row
 * into one NormalizedBankAccountRecord per populated bank slot (a blank
 * Bnk{N}_name means that slot isn't used), rather than a single wide row,
 * so it maps directly onto ClientBankAccount's existing one-row-per-account
 * shape (which MFD-entered rows already use).
 */
const MAX_BANK_SLOTS = 10;

const BANK_ACCOUNT_FIXED_ALIASES = {
  amcCode: "Fund",
  folioNumber: "Acno",
  holderPan: "PH_PAN",
  brokerArnCode: "ARNCode",
} as const;

type FixedField = keyof typeof BANK_ACCOUNT_FIXED_ALIASES;

export interface NormalizedBankAccountRecord {
  folioNumber: string;
  amcCode?: string;
  holderPan?: string;
  brokerArnCode?: string;
  bankSlot: number;
  bankName?: string;
  accountNumber?: string;
  accountType?: string;
  ifscCode?: string;
  isEcsRegistered?: string;
}

function getFixedValue(rawRecord: Record<string, unknown>, headerLookup: Map<string, string>, field: FixedField): unknown {
  const columnName = BANK_ACCOUNT_FIXED_ALIASES[field];
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

function getSlotValue(rawRecord: Record<string, unknown>, headerLookup: Map<string, string>, slot: number, suffix: string): unknown {
  const columnName = `Bnk${slot}_${suffix}`;
  const actualKey = headerLookup.get(columnName.trim().toLowerCase());
  return actualKey !== undefined ? rawRecord[actualKey] : undefined;
}

export function looksLikeBankAccountDetails(rawRecord: Record<string, unknown>, rtaType: RtaType): boolean {
  if (rtaType !== "KFINTECH") return false;
  const headerLookup = buildHeaderLookup(rawRecord);
  if (getFixedValue(rawRecord, headerLookup, "folioNumber") === undefined) return false;
  // Distinctive to this report: no other KFintech report has Bnk1_name/Bnk1_ifsccode columns.
  return getSlotValue(rawRecord, headerLookup, 1, "name") !== undefined && getSlotValue(rawRecord, headerLookup, 1, "ifsccode") !== undefined;
}

/** One row in, 1-10 rows out (one per populated bank slot) — see file doc comment. */
export function mapBankAccountDetailsRecords(rawRecord: Record<string, unknown>): NormalizedBankAccountRecord[] {
  const headerLookup = buildHeaderLookup(rawRecord);
  const folioNumber = optionalString(getFixedValue(rawRecord, headerLookup, "folioNumber"));
  if (!folioNumber) return [];

  const amcCode = optionalString(getFixedValue(rawRecord, headerLookup, "amcCode"));
  const holderPan = optionalString(getFixedValue(rawRecord, headerLookup, "holderPan"));
  const brokerArnCode = optionalString(getFixedValue(rawRecord, headerLookup, "brokerArnCode"));

  const results: NormalizedBankAccountRecord[] = [];
  for (let slot = 1; slot <= MAX_BANK_SLOTS; slot++) {
    const bankName = optionalString(getSlotValue(rawRecord, headerLookup, slot, "name"));
    if (!bankName) continue; // unused slot
    results.push({
      folioNumber,
      amcCode,
      holderPan,
      brokerArnCode,
      bankSlot: slot,
      bankName,
      accountNumber: optionalString(getSlotValue(rawRecord, headerLookup, slot, "bnkno")),
      accountType: optionalString(getSlotValue(rawRecord, headerLookup, slot, "bankactype")),
      ifscCode: optionalString(getSlotValue(rawRecord, headerLookup, slot, "ifsccode")),
      isEcsRegistered: optionalString(getSlotValue(rawRecord, headerLookup, slot, "ecs")),
    });
  }
  return results;
}
