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
 *
 * `currentBalanceUnits`, when given, reconciles the result against the
 * folio's own authoritative RTA balance snapshot — a REAL bug found on a
 * real client's data (2026-08-03): some real transaction rows carry a
 * NEGATIVE amount/units on a REDEMPTION or PURCHASE row (an RTA-side
 * correction/reversal entry that isn't flagged via the normal
 * `isRejection` N/R marker), which a pure transaction-replay walk doesn't
 * fully net out even when the folio is confirmed fully redeemed by the
 * RTA's own balance report — one real folio showed ₹46,646 "invested" on
 * a folio the RTA itself reports as zero units, zero value. Since the
 * RTA's own balance snapshot is the authoritative source for what's
 * actually held right now, it always wins: zero current units means zero
 * currently invested, full stop, regardless of any transaction-level
 * noise; a nonzero-but-mismatched current unit count rescales the computed
 * cost proportionally (preserves the computed average cost per unit,
 * corrects only the quantity) rather than trusting a transaction replay
 * that's demonstrably out of sync with the RTA's own count.
 */
export function computeFolioInvestedAmount(
  transactions: Array<{ transactionType: string; amount: unknown; units: unknown; isRejection?: boolean }>,
  currentBalanceUnits?: number | null,
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

  if (currentBalanceUnits === undefined || currentBalanceUnits === null) {
    return cumulativeCost;
  }
  if (Math.abs(currentBalanceUnits) < 0.001) {
    return 0;
  }
  if (cumulativeUnits > 0.001 && Math.abs(cumulativeUnits - currentBalanceUnits) > 0.001) {
    return cumulativeCost * (currentBalanceUnits / cumulativeUnits);
  }
  return cumulativeCost;
}
