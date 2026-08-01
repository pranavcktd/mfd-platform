import { RtaType } from "../report-schema";
import { RtaSourceFormat, looksLikeMfsd201 } from "./mfsd201-transaction";
import { looksLikeInvestorMaster } from "./investor-master";
import { looksLikeClientAum } from "./client-aum";
import { looksLikeSipRegistration } from "./sip-registration";
import { looksLikeKycStatus } from "./kyc-status";
import { looksLikeBrokerageWithheld } from "./brokerage-withheld";
import { looksLikeSipExpiry } from "./sip-expiry";
import { looksLikeSchemeMaster } from "./scheme-master";

export type KnownReportCode =
  | "MFSD201"
  | "INVESTOR_MASTER"
  | "CLIENT_AUM"
  | "SIP_REGISTRATION"
  | "KYC_STATUS"
  | "BROKERAGE_WITHHELD"
  | "SIP_EXPIRY"
  | "SCHEME_MASTER";

/**
 * Identifies which known report definition a raw record matches, trying
 * each report's distinctive required-field set in turn. Order is chosen
 * from most to least distinctive combination of fields to minimize false
 * positives; each report's required set was checked against every other's
 * aliases and doesn't currently overlap (the 4 report types added
 * 2026-07-27 in particular were checked against WBR2/WBR9/WBR4/WBR49's own
 * required-field sets, since several share individual column names like
 * FOLIO_NO/TRXNTYPE/REP_DATE — only the exact combination is safe).
 */
export function identifyReport(
  rawRecord: Record<string, unknown>,
  format: RtaSourceFormat,
  rtaType: RtaType,
): KnownReportCode | null {
  if (looksLikeSchemeMaster(rawRecord, rtaType)) {
    return "SCHEME_MASTER";
  }
  if (looksLikeBrokerageWithheld(rawRecord, rtaType)) {
    return "BROKERAGE_WITHHELD";
  }
  if (looksLikeKycStatus(rawRecord, rtaType)) {
    return "KYC_STATUS";
  }
  if (looksLikeSipExpiry(rawRecord, rtaType)) {
    return "SIP_EXPIRY";
  }
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
