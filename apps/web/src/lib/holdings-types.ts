export interface SourceMailInfo {
  subject: string | null;
  fromAddress: string;
  receivedAt: string | null;
  rtaType: string;
}

/** Folio-level capital gains summary — one row per folio. Shared by ReportsService.getCapitalGainsReport (CRM) and ClientPortalService.getMyCapitalGains (both call the same underlying FIFO/tax engine). */
export interface CapitalGainRow {
  folioId: string;
  clientId: string;
  clientName: string;
  folioNumber: string;
  schemeName: string | null;
  taxCategory: "EQUITY" | "DEBT_OR_OTHER";
  stcgGain: string;
  ltcgGain: string;
  /** Null when the correct rate depends on the investor's income slab (debt-fund gains) rather than a flat statutory rate. */
  estimatedTax: string | null;
  /** Sum of gain where estimatedTax couldn't be computed (taxed at the investor's own slab rate). */
  taxNotComputableGain: string;
  /** True if any lot was purchased before Jan 31, 2018 and is eligible for equity grandfathering (Section 112A cost-basis floor). */
  grandfatheringNote: boolean;
  /** True if grandfathering was actually applied using a real backfilled Jan 31, 2018 NAV — false means the eligible lot's gain is still overstated pending a NAV backfill. */
  grandfatheringApplied: boolean;
  /** Only meaningful for the unrealized report — whether currentValue used today's live AMFI NAV or fell back to the RTA's own snapshot. */
  valuationSource?: "RTA" | "LIVE_NAV";
  asOfOrDate: string | null;
  /** True if any lot in this folio had no matching purchase in the ingested transaction history — its cost basis and STCG/LTCG split is a placeholder (100% gain, STCG), not necessarily correct. Typically resolves once since-inception import captures this folio's full history. */
  hasIncompleteHistory: boolean;
  /** Portion of the gain above coming from those flagged lots — the amount likely to change once full history is imported. */
  incompleteHistoryGain: string;
}

/** One row per FIFO lot (not per folio) — the line-by-line breakdown an actual ITR Schedule 112A/CG filing needs. */
export interface CapitalGainLotRow {
  folioId: string;
  clientId: string;
  clientName: string;
  folioNumber: string;
  schemeName: string | null;
  taxCategory: "EQUITY" | "DEBT_OR_OTHER";
  purchaseDate: string;
  /** Null for the notional (unrealized) report — a still-held lot has no sale date. */
  saleDate: string | null;
  units: string;
  costBasis: string;
  saleProceeds: string;
  gain: string;
  holdingDays: number;
  classification: "STCG" | "LTCG";
  estimatedTax: string | null;
  grandfatheringApplicable: boolean;
  grandfatheringApplied: boolean;
  /** True when no matching purchase was found in the ingested history — costBasis/classification here is a placeholder, not necessarily correct. */
  costBasisUnknown: boolean;
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
  /** Last-resort fallback when there's neither an RTA balance report nor a live AMFI NAV match — units replayed from transaction history. Optional: not every consumer of this type supplies it yet. */
  estimatedBalanceUnits?: string | null;
  /** Estimated units valued at the most recent transaction's own NAV — only populated when valuationAmount and liveValue are both null. */
  estimatedValuationAmount?: string | null;
  activeSips: number;
  /** Distinct active registration types on this folio ("SIP"/"STP"/"SWP", real WBR49/MFSD243 data) — optional: not every consumer supplies it yet, and it's empty for registrations predating this field. */
  activeRegistrationTypes?: string[];
  source: string;
  /** Which real mail/file the current balance snapshot came from — null for CAS-imported folios and balances last touched before this field existed. Optional: the client portal's own folio type doesn't carry this (internal ops info, not surfaced to the end investor). */
  balanceSourceMail?: SourceMailInfo | null;
}

/** Shared shape for the "Systematic Investments" (SIP/STP/SWP) explorer, reused by CrmService.getClientSystematicInvestments and ClientPortalService.getMySystematicInvestments. */
export interface SystematicInvestmentRegistration {
  id: string;
  folioNumber: string;
  amcCode: string;
  schemeName: string | null;
  sipAmount: string | null;
  frequency: string | null;
  startDate: string | null;
  endDate: string | null;
  registrationDate: string;
  ceaseDate: string | null;
  isActive: boolean;
  /** null on rows synced before this was captured, or where the RTA's raw code wasn't a recognized SIP/STP/SWP marker. */
  registrationType: "SIP" | "STP" | "SWP" | null;
  estimatedNextDueDate: string | null;
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

/**
 * Same priority order the per-folio card itself displays in (RTA-confirmed
 * valuationAmount first, then today's live-NAV-computed liveValue, then the
 * transaction-replay estimatedValuationAmount last resort) — NOT a plain
 * "valuationAmount ?? 0". A folio whose only balance report hasn't arrived
 * yet (valuationAmount null) but has a real, recent PURCHASE transaction
 * still has a real current value via the estimated fallback; treating it as
 * ₹0 here made it vanish from every aggregate/filter that used the old
 * valuationAmount-only logic, even though the correct number was sitting
 * right there in the same folio object (confirmed real case, 2026-08-09).
 */
export function effectiveCurrentValue(f: Pick<HoldingFolio, "valuationAmount" | "liveValue" | "estimatedValuationAmount">): number {
  if (f.valuationAmount !== null) return Number(f.valuationAmount);
  if (f.liveValue !== null) return Number(f.liveValue);
  return Number(f.estimatedValuationAmount ?? 0);
}

export function isNonZeroHolding(f: Pick<HoldingFolio, "valuationAmount" | "liveValue" | "estimatedValuationAmount" | "balanceUnits" | "estimatedBalanceUnits">): boolean {
  return effectiveCurrentValue(f) !== 0 || Number(f.balanceUnits ?? 0) !== 0 || Number(f.estimatedBalanceUnits ?? 0) !== 0;
}
