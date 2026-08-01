/**
 * Derives a clean AMC display name (e.g. "Axis Mutual Fund") from a raw RTA
 * scheme name string, instead of showing the scheme name itself or the bare
 * amcCode. `Folio.amcCode` alone can't be used for this: it's a short
 * RTA-internal code, confirmed against real data (2026-07-23) to be
 * inconsistent in shape across CAMS (mostly numeric, e.g. "128" = Axis, but
 * some alphabetic like "B" = Aditya Birla Sun Life, "FTI" = Franklin
 * Templeton) and KFintech, with no guarantee the same code means the same
 * AMC across both RTAs since Folio doesn't track which RTA assigned it.
 * The scheme name string is the reliable signal instead — real scheme names
 * consistently start with the AMC's own brand name (e.g. "Axis Small Cap
 * Fund - Regular Growth", "SUNDARAM MID CAP FUND - REGULAR GROWTH").
 *
 * Each entry lists every real scheme-name prefix variant seen/expected for
 * that AMC; matching tries every alias across every AMC, longest alias
 * first, so a longer/more specific alias always wins over a shorter
 * coincidental prefix match (e.g. "Aditya Birla Sun Life" over a bare
 * "Aditya"; "Quantum" over "Quant" — both are real, distinct AMCs).
 */
interface AmcEntry {
  displayName: string;
  aliases: string[];
}

const AMC_DIRECTORY: AmcEntry[] = [
  { displayName: "360 ONE Mutual Fund", aliases: ["360 ONE", "IIFL"] },
  { displayName: "Aditya Birla Sun Life Mutual Fund", aliases: ["Aditya Birla Sun Life"] },
  { displayName: "Axis Mutual Fund", aliases: ["Axis"] },
  { displayName: "Bajaj Finserv Mutual Fund", aliases: ["Bajaj Finserv"] },
  { displayName: "Bandhan Mutual Fund", aliases: ["Bandhan", "IDFC"] },
  { displayName: "Bank of India Mutual Fund", aliases: ["Bank of India"] },
  { displayName: "Baroda BNP Paribas Mutual Fund", aliases: ["Baroda BNP Paribas"] },
  { displayName: "Canara Robeco Mutual Fund", aliases: ["Canara Robeco"] },
  { displayName: "DSP Mutual Fund", aliases: ["DSP"] },
  { displayName: "Edelweiss Mutual Fund", aliases: ["Edelweiss"] },
  { displayName: "Franklin Templeton Mutual Fund", aliases: ["Franklin India", "Franklin Templeton"] },
  { displayName: "Groww Mutual Fund", aliases: ["Groww"] },
  { displayName: "HDFC Mutual Fund", aliases: ["HDFC"] },
  { displayName: "Helios Mutual Fund", aliases: ["Helios"] },
  { displayName: "HSBC Mutual Fund", aliases: ["HSBC"] },
  { displayName: "ICICI Prudential Mutual Fund", aliases: ["ICICI Prudential"] },
  { displayName: "Invesco Mutual Fund", aliases: ["Invesco India", "Invesco"] },
  { displayName: "ITI Mutual Fund", aliases: ["ITI"] },
  { displayName: "JM Financial Mutual Fund", aliases: ["JM Financial", "JM"] },
  { displayName: "Kotak Mahindra Mutual Fund", aliases: ["Kotak"] },
  { displayName: "LIC Mutual Fund", aliases: ["LIC MF", "LIC"] },
  { displayName: "Mahindra Manulife Mutual Fund", aliases: ["Mahindra Manulife"] },
  { displayName: "Mirae Asset Mutual Fund", aliases: ["Mirae Asset"] },
  { displayName: "Motilal Oswal Mutual Fund", aliases: ["Motilal Oswal"] },
  { displayName: "Navi Mutual Fund", aliases: ["Navi"] },
  { displayName: "Nippon India Mutual Fund", aliases: ["Nippon India"] },
  { displayName: "NJ Mutual Fund", aliases: ["NJ"] },
  { displayName: "Old Bridge Mutual Fund", aliases: ["Old Bridge"] },
  { displayName: "PGIM India Mutual Fund", aliases: ["PGIM India"] },
  { displayName: "PPFAS Mutual Fund", aliases: ["PPFAS", "Parag Parikh"] },
  { displayName: "Quantum Mutual Fund", aliases: ["Quantum"] },
  { displayName: "quant Mutual Fund", aliases: ["quant"] },
  { displayName: "Samco Mutual Fund", aliases: ["Samco"] },
  { displayName: "SBI Mutual Fund", aliases: ["SBI"] },
  { displayName: "Shriram Mutual Fund", aliases: ["Shriram"] },
  { displayName: "Sundaram Mutual Fund", aliases: ["Sundaram"] },
  { displayName: "Tata Mutual Fund", aliases: ["Tata"] },
  { displayName: "Trust Mutual Fund", aliases: ["Trust"] },
  { displayName: "Union Mutual Fund", aliases: ["Union"] },
  { displayName: "UTI Mutual Fund", aliases: ["UTI"] },
  { displayName: "WhiteOak Capital Mutual Fund", aliases: ["WhiteOak Capital", "WhiteOak"] },
  { displayName: "Zerodha Mutual Fund", aliases: ["Zerodha"] },
  { displayName: "Unifi Mutual Fund", aliases: ["Unifi"] },
];

const MATCH_LIST: Array<{ alias: string; displayName: string }> = AMC_DIRECTORY.flatMap((entry) =>
  entry.aliases.map((alias) => ({ alias, displayName: entry.displayName })),
).sort((a, b) => b.alias.length - a.alias.length);

/**
 * Resolves a display AMC name from a scheme name, falling back to a
 * clearly-labeled "AMC Code {code}" when the scheme name is missing or
 * doesn't match any known AMC alias (a real, if rarer, case — a new AMC not
 * yet in the directory above, or a scheme-name format not seen before).
 */
export function resolveAmcName(schemeName: string | null | undefined, amcCode: string): string {
  if (schemeName) {
    const trimmed = schemeName.trim().toLowerCase();
    for (const { alias, displayName } of MATCH_LIST) {
      if (trimmed.startsWith(alias.toLowerCase())) {
        return displayName;
      }
    }
  }
  return `AMC Code ${amcCode}`;
}
