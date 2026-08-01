/**
 * Weighted-average cost basis of a folio's CURRENT holding — same
 * calculation as ReportsService.getCapitalGainsReport's "invested value"
 * side (avg cost = cumulative PURCHASE/SWITCH_IN/BONUS amount ÷ cumulative
 * units bought so far, recomputed at each transaction), pulled out here so
 * the CRM/client-portal holdings views can show "Invested" next to
 * "Current Value" without duplicating the logic. Not FIFO lot matching,
 * not a tax number — see getCapitalGainsReport's own doc comment.
 *
 * Rejected transactions (Transaction.isRejection — the RTA's own N/R mode
 * marker) are excluded: a rejected purchase/redemption never actually
 * happened, so it must not move the cost basis.
 */
export function computeFolioInvestedAmount(
  transactions: Array<{ transactionType: string; amount: unknown; units: unknown; isRejection?: boolean }>,
): number {
  let cumulativeUnits = 0;
  let cumulativeCost = 0;
  for (const t of transactions) {
    if (t.isRejection) continue;
    const units = Number(t.units ?? 0);
    const amount = Number(t.amount ?? 0);
    if (t.transactionType === "PURCHASE" || t.transactionType === "SWITCH_IN" || t.transactionType === "BONUS") {
      cumulativeUnits += units;
      cumulativeCost += amount;
    } else if (t.transactionType === "REDEMPTION" || t.transactionType === "SWITCH_OUT") {
      const avgCostPerUnit = cumulativeUnits > 0 ? cumulativeCost / cumulativeUnits : 0;
      const costOfUnitsSold = avgCostPerUnit * units;
      cumulativeUnits -= units;
      cumulativeCost -= costOfUnitsSold;
    }
  }
  return cumulativeCost;
}
