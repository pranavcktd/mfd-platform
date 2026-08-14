/**
 * Newton-Raphson XIRR over an arbitrary set of dated cash flows (negative =
 * money out/invested, positive = money in/redeemed or current value "as if
 * sold today"). Extracted from ReportsService.getClientReturnsReport so
 * crm.service.ts can compute the same real annualized return without
 * duplicating the Newton-Raphson solver. Returns null (never NaN/Infinity)
 * if it doesn't converge within 100 iterations or fewer than 2 cash flows
 * are given, rather than a garbage number — a portfolio with only
 * purchases and no current value (or vice versa) has no defined XIRR.
 *
 * This IS the correct "annualized return" for a portfolio built from
 * multiple purchase dates (SIPs, top-ups, etc.) — plain CAGR only has a
 * defined meaning for a single lump-sum investment date; XIRR is CAGR's
 * proper generalization for irregular cash flows and degenerates to the
 * same number a lump-sum CAGR would give when there's genuinely only one
 * purchase. See computeCagr below for the approximate, single-value form
 * some platforms show alongside XIRR anyway.
 */
export function computeXirr(cashFlows: Array<{ date: Date; amount: number }>): number | null {
  if (cashFlows.length < 2) return null;
  const t0 = cashFlows[0].date.getTime();
  const years = cashFlows.map((cf) => (cf.date.getTime() - t0) / (365 * 24 * 60 * 60 * 1000));

  function npv(rate: number): number {
    return cashFlows.reduce((sum, cf, i) => sum + cf.amount / Math.pow(1 + rate, years[i]), 0);
  }
  function npvDerivative(rate: number): number {
    return cashFlows.reduce((sum, cf, i) => sum - (years[i] * cf.amount) / Math.pow(1 + rate, years[i] + 1), 0);
  }

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const value = npv(rate);
    const derivative = npvDerivative(rate);
    if (Math.abs(derivative) < 1e-10) break;
    const nextRate = rate - value / derivative;
    if (!Number.isFinite(nextRate)) break;
    if (Math.abs(nextRate - rate) < 1e-7) {
      return nextRate;
    }
    rate = nextRate;
  }
  return Number.isFinite(rate) && Math.abs(npv(rate)) < 1 ? rate : null;
}

/**
 * Simple point-to-point CAGR: treats the total invested amount as a single
 * lump sum deployed on `firstInvestmentDate` and annualizes its growth to
 * `currentValue` as of `asOfDate`. Exact for a genuine single-purchase
 * folio (mathematically identical to that folio's XIRR in that case);
 * an APPROXIMATION for a SIP/multi-purchase folio, since real money
 * wasn't actually all in the market from day one — this overstates the
 * true annualized rate the more spread-out the real purchases were, in
 * exchange for being the single familiar number most retail investors
 * expect to see labeled "CAGR". XIRR (above) is the one that correctly
 * accounts for each cash flow's own date; show both, don't substitute
 * one for the other.
 */
export function computeCagr(investedAmount: number, currentValue: number, firstInvestmentDate: Date, asOfDate: Date = new Date()): number | null {
  if (investedAmount <= 0 || currentValue <= 0) return null;
  const years = (asOfDate.getTime() - firstInvestmentDate.getTime()) / (365 * 24 * 60 * 60 * 1000);
  if (years <= 0) return null;
  return Math.pow(currentValue / investedAmount, 1 / years) - 1;
}
