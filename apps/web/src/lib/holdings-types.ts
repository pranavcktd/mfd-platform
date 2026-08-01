export interface HoldingFolio {
  id: string;
  amcCode: string;
  amcName: string;
  folioNumber: string;
  schemeCode: string;
  schemeName: string | null;
  assetClass: string | null;
  balanceUnits: string | null;
  valuationAmount: string | null;
  investedAmount: string;
  navPerUnit: string | null;
  balanceAsOfDate: string | null;
  activeSips: number;
  source: string;
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
  source: string;
}

export function isNonZeroHolding(f: Pick<HoldingFolio, "valuationAmount" | "balanceUnits">): boolean {
  return Number(f.valuationAmount ?? 0) !== 0 || Number(f.balanceUnits ?? 0) !== 0;
}
