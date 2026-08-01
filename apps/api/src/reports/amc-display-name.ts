import { resolveAmcName, resolveKfintechAmcName } from "@mfd/shared";

/**
 * resolveAmcName (packages/shared) derives an AMC display name from a
 * scheme-name prefix match, with a "AMC Code {code}" fallback when nothing
 * matches — designed for RTA-sourced folios where amcCode is a short
 * RTA-internal code. Two more-reliable sources are checked first:
 *
 * 1. CAS-imported folios (import-external.service.ts): amcCode is
 *    literally `"CAS:" + <AMC name parsed straight out of the CAS
 *    document>` (e.g. "CAS:MOTILAL OSWAL MUTUAL FUND") — a real,
 *    already-clean name, not a code. Feeding that whole prefixed string
 *    into resolveAmcName's fallback produced "AMC Code CAS:MOTILAL OSWAL
 *    MUTUAL FUND" (a real bug caught by checking actual holdings output,
 *    not just typechecking). Stripped and used directly.
 * 2. KFintech-sourced folios (Folio.rtaType === "KFINTECH"): amcCode is
 *    KFintech's own "Fund" code, which has a real, user-supplied code→name
 *    table (kfintech-amc-codes.ts) — far more reliable than guessing from
 *    scheme-name text. Gated strictly on rtaType, never applied to a CAMS
 *    folio: CAMS and KFintech maintain separate, uncoordinated AMC-code
 *    systems, so the same code string can mean a different AMC in each.
 *
 * Anything else (CAMS folios, or a KFintech code not yet in the table)
 * falls through to the original scheme-name heuristic.
 */
export function resolveDisplayAmcName(
  schemeName: string | null | undefined,
  amcCode: string,
  rtaType?: string | null,
): string {
  if (amcCode.startsWith("CAS:")) {
    const casName = amcCode.slice(4).trim();
    if (casName && casName !== "Unknown AMC") {
      return casName;
    }
  } else if (rtaType === "KFINTECH") {
    const kfintechName = resolveKfintechAmcName(amcCode);
    if (kfintechName) {
      return kfintechName;
    }
  }
  return resolveAmcName(schemeName, amcCode);
}
