/**
 * CAMS/KFintech TD_TRTYPE code table (RTA "TRTypes & Flags" reference).
 * `mode` is the RTA's own N(ormal)/R(ejection-record) marker for the code
 * itself — e.g. ADD is a normal purchase, ADDR is that purchase's rejection
 * record, ADDRR is the reversal of the rejection (so mode N again). `flag`
 * is the RTA's transaction-flag classification, which normalizeFlag() below
 * maps to our canonical transaction types.
 */
export type RtaTransactionFlag = "P" | "R" | "SI" | "SO" | "BO" | "DR" | "DP";

export interface RtaTransactionTypeEntry {
  code: string;
  description: string;
  mode: "N" | "R";
  flag: RtaTransactionFlag;
}

export const RTA_TRANSACTION_TYPES: RtaTransactionTypeEntry[] = [
  { code: "ADD", description: "Purchase", mode: "N", flag: "P" },
  { code: "ADDR", description: "Purchase Rejection", mode: "R", flag: "R" },
  { code: "ADDRR", description: "Purchase Rejection reversal", mode: "N", flag: "P" },
  { code: "BNS", description: "Bonus Units", mode: "N", flag: "BO" },
  { code: "BNSR", description: "Bonus Rejection", mode: "R", flag: "R" },
  { code: "CFI", description: "Certificate Issued", mode: "N", flag: "R" },
  { code: "CFIR", description: "Certificate Issued Rejection", mode: "R", flag: "P" },
  { code: "CNI", description: "Consolidation In", mode: "N", flag: "P" },
  { code: "CNO", description: "Consolidation Out", mode: "N", flag: "R" },
  { code: "DIR", description: "Div. Reinvestment", mode: "N", flag: "DR" },
  { code: "DIRR", description: "ReInvestment Rejection", mode: "R", flag: "R" },
  { code: "DIRRR", description: "ReInvestment Rejection Reversal", mode: "N", flag: "DR" },
  { code: "DIV", description: "Gross Dividend", mode: "N", flag: "DP" },
  { code: "DIVR", description: "Gross Dividend Rejection", mode: "R", flag: "DP" },
  { code: "DMT", description: "Dematerialized", mode: "N", flag: "R" },
  { code: "DMTR", description: "Dematerialized Rejection", mode: "R", flag: "P" },
  { code: "DSPA", description: "Dividend Sweep In", mode: "N", flag: "SI" },
  { code: "DSPI", description: "Dividend Sweep In", mode: "N", flag: "SI" },
  { code: "DSPIR", description: "Dividend Sweep In Rej.", mode: "R", flag: "SO" },
  { code: "DSPN", description: "Dividend Sweep In", mode: "N", flag: "SI" },
  { code: "DSPO", description: "Dividend Sweep Out", mode: "N", flag: "SO" },
  { code: "DSPOR", description: "Dividend Sweep Out Rej.", mode: "R", flag: "SI" },
  { code: "FUL", description: "Redemption", mode: "N", flag: "R" },
  { code: "FULR", description: "Redemption Rejection", mode: "R", flag: "P" },
  { code: "FULRR", description: "Redemption Rejection reversal", mode: "N", flag: "R" },
  { code: "IPO", description: "Initial Allotment", mode: "N", flag: "P" },
  { code: "IPOR", description: "IPO Rejection", mode: "R", flag: "R" },
  { code: "IPORR", description: "IPO Rejection Reversal", mode: "N", flag: "P" },
  { code: "LTIA", description: "Lateral Shift In", mode: "N", flag: "SI" },
  { code: "LTIAR", description: "Lat. Shift In Rej.", mode: "R", flag: "SO" },
  { code: "LTIARR", description: "Swit. Over In Rej. Reversal", mode: "N", flag: "R" },
  { code: "LTIN", description: "Lateral Shift In", mode: "N", flag: "SI" },
  { code: "LTINR", description: "Lat. Shift In Rej.", mode: "R", flag: "SO" },
  { code: "LTINRR", description: "Swit. Over In Rej. Reversal", mode: "N", flag: "R" },
  { code: "LTOF", description: "Lateral Shift Out", mode: "N", flag: "SO" },
  { code: "LTOFR", description: "Lat. Shift Out Rej.", mode: "R", flag: "SI" },
  { code: "LTOFRR", description: "Lat. Shift Out Rej. Reversal", mode: "N", flag: "R" },
  { code: "LTOP", description: "Lateral Shift Out", mode: "N", flag: "SO" },
  { code: "LTOPR", description: "Lat. Shift Out Rej.", mode: "R", flag: "SI" },
  { code: "LTOPRR", description: "Lat. Shift Out Rej. Reversal", mode: "N", flag: "R" },
  { code: "NEW", description: "Purchase", mode: "N", flag: "P" },
  { code: "NEWR", description: "Purchase Rejection", mode: "R", flag: "R" },
  { code: "NEWRR", description: "Purchase Rejection reversal", mode: "N", flag: "P" },
  { code: "PLDO", description: "Pledging", mode: "N", flag: "R" },
  { code: "PLDOR", description: "Pledging Rejection", mode: "R", flag: "P" },
  { code: "RED", description: "Redemption", mode: "N", flag: "R" },
  { code: "REDR", description: "Redemption Rejection", mode: "R", flag: "P" },
  { code: "REDRR", description: "Redemption Rejection reversal", mode: "N", flag: "R" },
  { code: "SIN", description: "Systematic Investment", mode: "N", flag: "P" },
  { code: "SINR", description: "SIP Rejection", mode: "R", flag: "R" },
  { code: "SINRR", description: "SIP Rejection Reversal", mode: "N", flag: "P" },
  { code: "STPA", description: "S T P In", mode: "N", flag: "SI" },
  { code: "STPAR", description: "S T P In Rej", mode: "R", flag: "SO" },
  { code: "STPARR", description: "Swit.Over In Rej Reversal", mode: "N", flag: "R" },
  { code: "STPI", description: "S T P In", mode: "N", flag: "SI" },
  { code: "STPIR", description: "S T P In Rej", mode: "R", flag: "SO" },
  { code: "STPN", description: "S T P In", mode: "N", flag: "SI" },
  { code: "STPNR", description: "S T P In Rej", mode: "R", flag: "SO" },
  { code: "STPO", description: "S T P Out", mode: "N", flag: "SO" },
  { code: "STPOR", description: "S T P Out Rej", mode: "R", flag: "SI" },
  { code: "STPORR", description: "Swit. Over Out Rej. Reversal", mode: "N", flag: "R" },
  { code: "STRA", description: "STRIP In", mode: "N", flag: "SI" },
  { code: "STRAR", description: "STRIP In Rejection", mode: "R", flag: "SO" },
  { code: "STRI", description: "STRIP In", mode: "N", flag: "SI" },
  { code: "STRIR", description: "STRIP In Rejection", mode: "R", flag: "SO" },
  { code: "STRO", description: "STRIP Out", mode: "N", flag: "SO" },
  { code: "STROR", description: "STRIP Out Rejection", mode: "R", flag: "SI" },
  { code: "SWD", description: "Systematic Withdrawal", mode: "N", flag: "R" },
  { code: "SWDR", description: "SWP Rejection", mode: "R", flag: "P" },
  { code: "SWIA", description: "Switch Over In", mode: "N", flag: "SI" },
  { code: "SWIAR", description: "Swit. Over In Rej.", mode: "R", flag: "SO" },
  { code: "SWIN", description: "Switch Over In", mode: "N", flag: "SI" },
  { code: "SWINR", description: "Swit. Over In Rej.", mode: "R", flag: "SO" },
  { code: "SWOF", description: "Switch Over Out", mode: "N", flag: "SO" },
  { code: "SWOFR", description: "Swit. Over Out Rej.", mode: "R", flag: "SI" },
  { code: "SWOP", description: "Switch Over Out", mode: "N", flag: "SO" },
  { code: "SWOPR", description: "Swit. Over Out Rej.", mode: "R", flag: "SI" },
  { code: "TRFI", description: "Demat Transfer In", mode: "N", flag: "P" },
  { code: "TRFIR", description: "Demat Transfer in Rej", mode: "R", flag: "R" },
  { code: "TRFO", description: "Demat Transfer Out", mode: "N", flag: "R" },
  { code: "TRFOR", description: "Demat Transfer Out Rej", mode: "R", flag: "P" },
  { code: "TRMI", description: "Transmission In", mode: "N", flag: "P" },
  { code: "TRMO", description: "Transmission Out", mode: "N", flag: "R" },
  { code: "UPLO", description: "Unpledging", mode: "N", flag: "P" },
  { code: "UPLOR", description: "Unpledging Rejection", mode: "R", flag: "R" },
  { code: "ADDD", description: "Additional Purchase Pre-Rejection", mode: "N", flag: "R" },
  { code: "DMTD", description: "Dematerialized Rejection", mode: "N", flag: "R" },
  { code: "DSPID", description: "Dividend Sweep In Pre rejection", mode: "N", flag: "SO" },
  { code: "FULD", description: "Redemption Pre rejection", mode: "N", flag: "P" },
  { code: "FULRD", description: "Redemption Rejection Deletion", mode: "N", flag: "R" },
  { code: "IPOD", description: "Initial Purchase Pre-Rejection", mode: "N", flag: "R" },
  { code: "LTIAD", description: "Lateral Shift In Pre rejection", mode: "N", flag: "SO" },
  { code: "LTIND", description: "Lateral Shift In Pre rejection", mode: "N", flag: "SO" },
  { code: "LTOFD", description: "Lateral Shift Out Pre rejection", mode: "N", flag: "SI" },
  { code: "LTOPD", description: "Lateral Shift Out Pre rejection", mode: "N", flag: "SI" },
  { code: "NEWD", description: "New Purchase Pre-Rejection", mode: "N", flag: "R" },
  { code: "PLDOD", description: "Pledging Rejection", mode: "N", flag: "P" },
  { code: "REDD", description: "Redemption Pre rejection", mode: "N", flag: "P" },
  { code: "REDRD", description: "Redemption Rejection Deletion", mode: "N", flag: "R" },
  { code: "SIND", description: "Systematic Investment Pre-Rejection", mode: "N", flag: "R" },
  { code: "SINDD", description: "Systematic Investment rejection Deletion", mode: "N", flag: "P" },
  { code: "SINRD", description: "SIP Rejection Deletion", mode: "N", flag: "P" },
  { code: "STPAD", description: "S T P In Pre rejection", mode: "N", flag: "SO" },
  { code: "STPID", description: "S T P In Pre rejection", mode: "N", flag: "SO" },
  { code: "STPND", description: "S T P In Pre rejection", mode: "N", flag: "SO" },
  { code: "STPOD", description: "S T P Out Pre rejection", mode: "N", flag: "SI" },
  { code: "STPORD", description: "S T P Out Rej Deletion", mode: "N", flag: "SO" },
  { code: "STRAD", description: "STRIP In Deletion", mode: "N", flag: "SO" },
  { code: "STROD", description: "STRIP Out Pre rejection", mode: "N", flag: "SI" },
  { code: "SWDD", description: "Systematic Withdrawal Pre rejection", mode: "N", flag: "P" },
  { code: "SWIAD", description: "Switch Over In Pre rejection", mode: "N", flag: "SO" },
  { code: "SWIND", description: "Switch Over In Pre rejection", mode: "N", flag: "SO" },
  { code: "SWINRD", description: "Swit. Over In Rej. Deletion", mode: "N", flag: "SI" },
  { code: "SWOFD", description: "Switch Over Out Pre rejection", mode: "N", flag: "SI" },
  { code: "SWOPD", description: "Switch Over Out Pre rejection", mode: "N", flag: "SI" },
  { code: "TRFOD", description: "Demat Transfer Out Rejection", mode: "N", flag: "P" },
  { code: "TRMID", description: "Transmission In rejection", mode: "N", flag: "R" },
  { code: "UPLOD", description: "Unpledging rejection", mode: "N", flag: "R" },
  { code: "CNOR", description: "Consolidation Out Rejection", mode: "R", flag: "P" },
  { code: "CNIR", description: "Consolidation IN Rejection", mode: "R", flag: "R" },
];

const BY_CODE = new Map(RTA_TRANSACTION_TYPES.map((entry) => [entry.code, entry]));

export type NormalizedTransactionType =
  | "PURCHASE"
  | "REDEMPTION"
  | "SWITCH_IN"
  | "SWITCH_OUT"
  | "BONUS"
  | "DIVIDEND_REINVEST"
  | "DIVIDEND_PAYOUT"
  | "OTHER";

const FLAG_TO_NORMALIZED: Record<RtaTransactionFlag, NormalizedTransactionType> = {
  P: "PURCHASE",
  R: "REDEMPTION",
  SI: "SWITCH_IN",
  SO: "SWITCH_OUT",
  BO: "BONUS",
  DR: "DIVIDEND_REINVEST",
  DP: "DIVIDEND_PAYOUT",
};

export interface ResolvedTransactionType {
  code: string;
  description: string;
  isRejection: boolean;
  normalizedType: NormalizedTransactionType;
  /**
   * False when the code wasn't found in RTA_TRANSACTION_TYPES. This table
   * was built from KFintech's "TRTypes & Flags" reference and matches
   * KFintech's own TD_TRTYPE values well, but CAMS's native WBR-series DBF
   * reports use a much larger, scheme/campaign-specific code system (300+
   * distinct codes seen in one real sample file, e.g. "PSI01S", "SO3",
   * "DRB3") that doesn't overlap this table at all. Rather than guess a
   * classification from the code's prefix — which risks silently mis-
   * counting a redemption as a purchase in AUM/dashboard aggregates —
   * unrecognized codes resolve to normalizedType "OTHER" with this flag
   * false, so callers can exclude/flag them instead of trusting a guess.
   * Building a real CAMS code table needs either CAMS's own documentation
   * or enough labeled samples to derive one; it hasn't been done yet.
   */
  isRecognized: boolean;
}

/**
 * Resolves a raw TD_TRTYPE code (e.g. "ADDR") to its RTA description and our
 * normalized transaction type. `isRejection` reflects the RTA's own N/R mode
 * marker on the code — callers should exclude rejected records from AUM/
 * valid-transaction aggregates while still keeping them queryable.
 */
export function resolveTransactionType(code: string): ResolvedTransactionType {
  const normalizedCode = code.toUpperCase().trim();
  const entry = BY_CODE.get(normalizedCode);
  if (!entry) {
    return {
      code: normalizedCode,
      description: "Unrecognized transaction type code",
      isRejection: false,
      normalizedType: "OTHER",
      isRecognized: false,
    };
  }
  return {
    code: entry.code,
    description: entry.description,
    isRejection: entry.mode === "R",
    normalizedType: FLAG_TO_NORMALIZED[entry.flag],
    isRecognized: true,
  };
}
