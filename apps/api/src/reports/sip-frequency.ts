/**
 * SIP/STP frequency handling shared across the SIP Due report, the SIP
 * breakdown (dashboard), the SIP Explorer, and the CRM per-client
 * systematic-investments section — one source of truth for "how many days
 * between installments" and "what's this worth on a comparable monthly
 * basis", rather than several copies drifting apart. Values taken from
 * real WBR49/MFSD243 frequency strings seen in this codebase's existing
 * SIP Due report.
 */
export const FREQUENCY_TO_DAYS: Record<string, number> = {
  DAILY: 1,
  WEEKLY: 7,
  FORTNIGHTLY: 14,
  TWICE_MONTHLY: 15,
  MONTHLY: 30,
  QUARTERLY: 91,
  "HALF YEARLY": 182,
  HALFYEARLY: 182,
  ANNUALLY: 365,
  YEARLY: 365,
};

/** Not a recurring cadence at all — a single lumpsum/one-time transaction registered through the same WBR49/MFSD243 report as real SIPs. Handled as its own case throughout this file, never given a day-interval. */
export const ONE_SHOT = "ONE_SHOT";

/**
 * Real CAMS WBR49 short frequency codes — user-confirmed 2026-08-07
 * (matches this codebase's own earlier count-matching evidence for
 * OM/OW/Q exactly): OM=Once a Month, OW=Once a Week, Q=Quarterly,
 * DZ=Daily (a SIP/STP variant), BZ=Business Days (approximated as daily —
 * this platform has no business-day calendar to model "skip weekends"
 * precisely), O=One Shot (single/lumpsum, not recurring — see ONE_SHOT),
 * SM=Specific dates in a month (multiple fixed debit dates — approximated
 * as monthly since the exact dates aren't captured, only the frequency
 * label), TM=Twice a Month (two installments per month).
 */
const SHORT_CODE_ALIASES: Record<string, string> = {
  OM: "MONTHLY",
  OW: "WEEKLY",
  Q: "QUARTERLY",
  DZ: "DAILY",
  BZ: "DAILY",
  O: ONE_SHOT,
  SM: "MONTHLY",
  TM: "TWICE_MONTHLY",
};

/** Installments per calendar month, for normalizing any frequency's amount onto a comparable monthly basis. ONE_SHOT isn't a recurring commitment, so it contributes 0 here (see monthlyEquivalentAmount). */
const INSTALLMENTS_PER_MONTH: Record<string, number> = {
  DAILY: 30,
  WEEKLY: 4.33,
  FORTNIGHTLY: 2.17,
  TWICE_MONTHLY: 2,
  MONTHLY: 1,
  QUARTERLY: 1 / 3,
  "HALF YEARLY": 1 / 6,
  HALFYEARLY: 1 / 6,
  ANNUALLY: 1 / 12,
  YEARLY: 1 / 12,
};

/** Normalizes a raw frequency string ("Monthly", "monthly ", "OM", etc.) to the canonical keys above — unrecognized/missing defaults to MONTHLY, same fallback the pre-existing SIP Due report already used. */
export function normalizeFrequencyKey(frequency: string | null | undefined): string {
  const key = frequency?.trim().toUpperCase() ?? "";
  if (key in SHORT_CODE_ALIASES) return SHORT_CODE_ALIASES[key];
  return key in FREQUENCY_TO_DAYS ? key : "MONTHLY";
}

export function isOneShotFrequency(frequency: string | null | undefined): boolean {
  return normalizeFrequencyKey(frequency) === ONE_SHOT;
}

/** Real installment interval in days for a frequency, defaulting to 30 (monthly) for anything unrecognized. Not meaningful for ONE_SHOT — callers should check isOneShotFrequency first. */
export function frequencyIntervalDays(frequency: string | null | undefined): number {
  return FREQUENCY_TO_DAYS[normalizeFrequencyKey(frequency)] ?? 30;
}

/** What one installment amount is worth on a comparable "per month" basis — e.g. a ₹30,000 quarterly SIP is a ₹10,000/month equivalent, not ₹30,000/month. A One Shot registration isn't an ongoing monthly commitment at all, so it contributes 0, not its full amount. */
export function monthlyEquivalentAmount(amount: number, frequency: string | null | undefined): number {
  if (isOneShotFrequency(frequency)) return 0;
  const multiplier = INSTALLMENTS_PER_MONTH[normalizeFrequencyKey(frequency)] ?? 1;
  return amount * multiplier;
}

/**
 * Same "walk forward from startDate in frequency-sized steps until >= today"
 * estimate the SIP Due report already used — no per-installment due-date
 * field exists in the ingested data, so this is a best-effort projection,
 * never authoritative. Returns null for a One Shot registration — there is
 * no "next" installment for a single lumpsum transaction.
 */
export function estimateNextDueDate(startDate: Date, frequency: string | null | undefined, today: Date = new Date()): Date | null {
  if (isOneShotFrequency(frequency)) return null;
  const intervalDays = frequencyIntervalDays(frequency);
  let next = new Date(startDate);
  while (next < today) {
    next = new Date(next.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  }
  return next;
}
