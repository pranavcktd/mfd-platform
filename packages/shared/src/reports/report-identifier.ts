import { RtaType } from "../report-schema";
import { RtaSourceFormat, looksLikeMfsd201 } from "./mfsd201-transaction";
import { looksLikeInvestorMaster } from "./investor-master";
import { looksLikeClientAum } from "./client-aum";
import { looksLikeSipRegistration } from "./sip-registration";

export type KnownReportCode = "MFSD201" | "INVESTOR_MASTER" | "CLIENT_AUM" | "SIP_REGISTRATION";

/**
 * Identifies which known report definition a raw record matches, trying
 * each report's distinctive required-field set in turn. Order is chosen
 * from most to least distinctive combination of fields to minimize false
 * positives; each report's required set was checked against the others'
 * aliases and doesn't currently overlap.
 */
export function identifyReport(
  rawRecord: Record<string, unknown>,
  format: RtaSourceFormat,
  rtaType: RtaType,
): KnownReportCode | null {
  if (looksLikeSipRegistration(rawRecord, rtaType)) {
    return "SIP_REGISTRATION";
  }
  if (looksLikeInvestorMaster(rawRecord, rtaType)) {
    return "INVESTOR_MASTER";
  }
  if (looksLikeClientAum(rawRecord, rtaType)) {
    return "CLIENT_AUM";
  }
  if (looksLikeMfsd201(rawRecord, format, rtaType)) {
    return "MFSD201";
  }
  return null;
}
