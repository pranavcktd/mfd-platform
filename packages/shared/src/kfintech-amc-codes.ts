/**
 * KFintech's own "Fund" code → AMC name table — sourced directly from the
 * "AMC Codes" sheet in the user-supplied MailbackreportsFormats.xls (basic
 * data/), NOT inferred from scheme-name text like resolveAmcName's
 * fallback. This is the authoritative mapping for the CSV/DBF "Fund"
 * column (MFSD201_ALIASES.amcCode.csv/.dbf in mfsd201-transaction.ts) —
 * confirmed by the file itself (its own header row: "Fund" | "AMC Name").
 *
 * Only 26 AMCs are listed in the source sheet — it is very likely NOT
 * exhaustive of every AMC KFintech services (dozens of AMCs exist in
 * India), just the ones the sheet's author included. An amcCode not found
 * here is not evidence it's wrong, only that this table doesn't cover it
 * yet — resolveDisplayAmcName falls back to scheme-name matching in that
 * case, same as it always did.
 *
 * CAMS has NO equivalent table in any file supplied so far — the CAMS
 * distributor manual PDF is a portal usage guide (screenshots of "how to
 * request a report"), not a data dictionary, and has no AMC code list.
 * CAMS's own AMC_CODE values use a different, uncoordinated code system
 * (confirmed mixed numeric/alphabetic, e.g. "B" = Aditya Birla Sun Life,
 * "FTI" = Franklin Templeton — see amc-names.ts) — this table must NEVER
 * be applied to a CAMS-sourced folio, hence Folio.rtaType gating this in
 * resolveDisplayAmcName rather than trying every code against every RTA.
 */
export const KFINTECH_AMC_CODES: Record<string, string> = {
  "101": "Canara Robeco Mutual Fund",
  "102": "LIC Mutual Fund",
  "104": "Taurus Mutual Fund",
  "105": "JM Financial Mutual Fund",
  "108": "UTI Mutual Fund",
  "116": "Bank of India Mutual Fund",
  "117": "Mirae Asset Mutual Fund",
  "118": "Edelweiss Mutual Fund",
  "120": "Invesco Mutual Fund",
  "123": "Quantum Mutual Fund",
  "125": "Groww Mutual Fund",
  "127": "Motilal Oswal Mutual Fund",
  "128": "Axis Mutual Fund",
  "129": "PGIM India Mutual Fund",
  "139": "Old Bridge Mutual Fund",
  "152": "ITI Mutual Fund",
  "166": "Quant Mutual Fund",
  "176": "Sundaram Mutual Fund",
  "178": "Baroda BNP Paribas Mutual Fund",
  "185": "Trust Mutual Fund",
  "187": "NJ Mutual Fund",
  "188": "Samco Mutual Fund",
  "189": "Bajaj Finserv Mutual Fund",
  RMF: "Nippon India Mutual Fund",
};

export function resolveKfintechAmcName(amcCode: string): string | null {
  return KFINTECH_AMC_CODES[amcCode.trim().toUpperCase()] ?? KFINTECH_AMC_CODES[amcCode.trim()] ?? null;
}
