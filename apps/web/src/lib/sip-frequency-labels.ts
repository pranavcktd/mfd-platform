/** Display labels for the normalized frequency keys the backend returns (see apps/api/src/reports/sip-frequency.ts) — shared by the Dashboard's SIP breakdown card, the SIP Explorer, and the CRM client detail page's systematic investments section. */
export const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  FORTNIGHTLY: "Fortnightly",
  TWICE_MONTHLY: "Twice a Month",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  "HALF YEARLY": "Half-Yearly",
  HALFYEARLY: "Half-Yearly",
  ANNUALLY: "Annually",
  YEARLY: "Annually",
  ONE_SHOT: "One Shot (Lumpsum)",
  // Real CAMS WBR49 short codes — user-confirmed 2026-08-07. See
  // apps/api/src/reports/sip-frequency.ts's SHORT_CODE_ALIASES comment.
  OM: "Monthly",
  OW: "Weekly",
  Q: "Quarterly",
  DZ: "Daily",
  BZ: "Daily (Business Days)",
  O: "One Shot (Lumpsum)",
  SM: "Monthly (Specific Dates)",
  TM: "Twice a Month",
};

export function formatFrequencyLabel(frequency: string | null | undefined): string {
  if (!frequency) return "—";
  const key = frequency.trim().toUpperCase();
  return FREQUENCY_LABELS[key] ?? `${frequency} (unconfirmed code)`;
}
