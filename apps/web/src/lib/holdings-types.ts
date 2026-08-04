export interface SourceMailInfo {
  subject: string | null;
  fromAddress: string;
  receivedAt: string | null;
  rtaType: string;
}

export interface HoldingFolio {
  id: string;
  amcCode: string;
  amcName: string;
  folioNumber: string;
  schemeCode: string;
  schemeName: string | null;
  assetClass: string | null;
  balanceUnits: string | null;
  /** RTA-reported snapshot — only as fresh as the last balance report for this folio. */
  valuationAmount: string | null;
  investedAmount: string;
  navPerUnit: string | null;
  balanceAsOfDate: string | null;
  /** Independently computed from today's real AMFI NAV — null when this scheme hasn't been matched to a live NAV yet. */
  liveNav: string | null;
  liveNavDate: string | null;
  liveValue: string | null;
  activeSips: number;
  source: string;
  /** Which real mail/file the current balance snapshot came from — null for CAS-imported folios and balances last touched before this field existed. Optional: the client portal's own folio type doesn't carry this (internal ops info, not surfaced to the end investor). */
  balanceSourceMail?: SourceMailInfo | null;
}

export interface HoldingTransaction {
  id: string;
  transactionType: string;
  transactionTypeCode?: string | null;
  transactionDescription: string | null;
  transactionDate: string;
  amount: string | null;
  units: string | null;
  navPerUnit?: string | null;
  isRejection: boolean;
  /** CAMS's own REMARKS/REV_REMARK text — why a rejection/reversal actually happened (e.g. "Insufficient Balance"), distinct from transactionDescription which only labels the transaction type. Null for KFintech/CAS rows (no equivalent confirmed). */
  rejectionReason?: string | null;
  source: string;
  /** Which real mail/file this specific transaction was ingested from — null for CAS-imported rows and rows ingested before this field existed. */
  sourceMail?: SourceMailInfo | null;
}

export function isNonZeroHolding(f: Pick<HoldingFolio, "valuationAmount" | "balanceUnits">): boolean {
  return Number(f.valuationAmount ?? 0) !== 0 || Number(f.balanceUnits ?? 0) !== 0;
}
