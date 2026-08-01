/**
 * "Invested value" only has a clean meaning for asset types that are
 * genuinely a purchase of units/principal at a point in time — equity
 * shares (quantity × buy price) and fixed deposits (principal). Insurance
 * isn't an investment vehicle in the same sense (premiums paid over time
 * aren't tracked cumulatively, only the current premium amount), and
 * "Other" is a free-text bucket with no structured cost basis at all — both
 * return null rather than a misleading number.
 */
export function computeOtherAssetInvestedAmount(assetType: string, details: Record<string, unknown> | null): number | null {
  if (!details) return null;
  if (assetType === "EQUITY_SHARES") {
    const quantity = Number(details.quantity ?? 0);
    const buyPrice = details.buyPricePerUnit;
    if (!quantity || buyPrice == null) return null;
    return quantity * Number(buyPrice);
  }
  if (assetType === "FIXED_DEPOSIT") {
    const principal = details.principal;
    return principal != null ? Number(principal) : null;
  }
  return null;
}

export function computeProfitPercent(investedAmount: number | null, currentValue: number): number | null {
  if (investedAmount === null || investedAmount === 0) return null;
  return ((currentValue - investedAmount) / investedAmount) * 100;
}
