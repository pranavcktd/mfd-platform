/**
 * reportCode ("MFSD201", "CLIENT_AUM", etc.) is an internal normalized
 * taxonomy shared across both RTAs by the schema-mapping pipeline — CAMS's
 * WBR2 and KFintech's native MFSD201 both resolve to the SAME internal code
 * "MFSD201" because they're the same underlying data (a transaction report),
 * just two different RTAs' file formats for it. That's correct internally,
 * but confusing when shown to an MFD who knows CAMS's WBR-series and
 * KFintech's MFSD-series naming from their own RTA manuals — a CAMS row
 * showing "MFSD201" reads as "this is KFintech data", not "this is CAMS
 * data using our shared internal taxonomy". This maps back to each RTA's
 * own real file/report name for display, confirmed against this
 * codebase's own parser doc comments (packages/shared/src/reports/*.ts,
 * each written against a real sample export) — never guessed.
 */
const RTA_NATIVE_REPORT_NAMES: Record<string, { cams?: string; kfintech?: string }> = {
  MFSD201: { cams: "WBR2 (Investor Transactions for a Period)", kfintech: "MFSD201 (Transaction Feeds Report)" },
  INVESTOR_MASTER: { cams: "WBR9 (Investor Static Details Feed)", kfintech: "MFSD211 (Investor Master Information)" },
  CLIENT_AUM: { cams: "WBR4 (Investors Static Details with Balance)", kfintech: "MFSD203 (Client-wise AUM Report)" },
  SIP_REGISTRATION: { cams: "WBR49 (SIP/STP Procured for the Period)", kfintech: "MFSD243 (SIP Registration Report)" },
  KYC_STATUS: { cams: "WBR56 (KYC Status of Investor)", kfintech: "MFSD239 (KYC Report) — unverified, no live sample yet" },
  PAN_KYC_STATUS: { kfintech: "MFSD262 (PAN Level KYC Report) — unverified, no live sample yet" },
  BROKERAGE_WITHHELD: { cams: "WBR95 (Brokerage Withheld)" },
  BROKERAGE_EARNED: { cams: "WBR6 (My Trailer Fee Details) — unverified, no live sample yet", kfintech: "MFSD205 (Transaction wise Brokerage Report) — unverified, no live sample yet" },
  SIP_EXPIRY: { cams: "WBR5 (SIP Investors Whose Plans Expire Shortly)", kfintech: "MFSD227 (SIP/STP Investors Whose Plan Expire Shortly) — unverified, no live sample yet" },
  SCHEME_MASTER: { cams: "WBR39 (Scheme Details)" },
  BANK_ACCOUNT_DETAILS: { kfintech: "MFSD263 (Registered Bank Account Details) — unverified, no live sample yet" },
  NOMINEE_DETAILS: { kfintech: "MFSD264 (Nominee Details) — unverified, no live sample yet" },
};

/** rtaType-aware display label for a mail log's internal reportCode — see file doc comment for why this can't just be reportCode itself. */
export function rtaNativeReportLabel(rtaType: string, reportCode: string | null): string {
  if (!reportCode) return "Unresolved (report not identified)";
  const entry = RTA_NATIVE_REPORT_NAMES[reportCode];
  if (!entry) return reportCode;
  const key = rtaType === "KFINTECH" ? "kfintech" : rtaType === "CAMS" ? "cams" : undefined;
  const native = key ? entry[key] : undefined;
  // No confirmed native name for this RTA+report combination (e.g. WBR95
  // is CAMS-only so far, no KFintech sample seen) — show the raw internal
  // code with an honest caveat rather than fabricating a file name.
  return native ?? `${reportCode} (native RTA report name not yet confirmed for ${rtaType === "KFINTECH" ? "KFintech" : rtaType})`;
}
