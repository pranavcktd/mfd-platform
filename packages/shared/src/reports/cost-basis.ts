/**
 * Weighted-average cost basis of a folio's CURRENT holding — same
 * calculation as ReportsService.getCapitalGainsReport's "invested value"
 * side (avg cost = cumulative PURCHASE/SWITCH_IN/BONUS amount ÷ cumulative
 * units bought so far, recomputed at each transaction), pulled out here so
 * the CRM/client-portal holdings views can show "Invested" next to
 * "Current Value" without duplicating the logic. Not FIFO lot matching,
 * not a tax number — see getCapitalGainsReport's own doc comment. Lives in
 * packages/shared (not apps/api) because apps/workers also needs
 * computeFolioCurrentUnitsFromTransactions to keep Folio.estimated* fields
 * current as new transactions arrive, not just at CRM-read time.
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
 *
 * Real bug found on real data (2026-08-10): a folio can carry dozens to
 * hundreds of transaction rows that are exact re-statements of the folio's
 * own earlier history, re-posted wholesale under one much later date (seen
 * on two unrelated real folios: 102 and 110 such rows respectively, on one
 * suspicious re-post date each — 2025-01-08 and 2025-01-16, ~1000+ rows
 * platform-wide sharing just those two dates). Two distinct shapes, both
 * handled below:
 *  - A mirrored reversal: the re-posted row is the exact NEGATIVE of an
 *    earlier row (same type, amount/units negated) — a wholesale "undo" of
 *    the client's whole prior history. Walking these normally is
 *    mathematically wrong for REDEMPTION/SWITCH_OUT specifically: the
 *    reversal's cost impact gets computed from THIS MOMENT's avgCostPerUnit
 *    ratio, not the ratio that was actually in effect when the original
 *    redemption happened years earlier, so "restoring" cost basis this way
 *    drifts — compounded over 60+ reversals, this turned one real folio's
 *    invested amount into +₹40 crore. Since the pairing is exact, the
 *    correct and order-independent fix is to remove BOTH the original and
 *    its mirror from the walk entirely, as if neither ever happened.
 *  - A same-sign re-statement: the re-posted row exactly matches an earlier
 *    one with the SAME sign (no reversal, just a duplicate copy) — kept out
 *    via a plain "first occurrence wins" dedup once mirrored pairs are
 *    already removed.
 * A signature match requires the exact same type/amount/units (to the
 * rupee/4dp) — not something two genuinely independent NAV-driven
 * transactions would coincidentally share, since NAV moves daily and units
 * for a fixed rupee amount essentially never repeat exactly by chance.
 */
function transactionSignature(transactionType: string, amount: number, units: number): string {
  return `${transactionType}|${amount.toFixed(2)}|${units.toFixed(4)}`;
}

function excludeMirroredReversalPairs(
  transactions: Array<{ transactionType: string; amount: unknown; units: unknown; isRejection?: boolean }>,
): Set<number> {
  const unclaimedIndexesBySignature = new Map<string, number[]>();
  transactions.forEach((t, i) => {
    if (t.isRejection) return;
    const units = Number(t.units ?? 0);
    const amount = Number(t.amount ?? 0);
    const signature = transactionSignature(t.transactionType, amount, units);
    const list = unclaimedIndexesBySignature.get(signature);
    if (list) list.push(i);
    else unclaimedIndexesBySignature.set(signature, [i]);
  });

  const excluded = new Set<number>();
  transactions.forEach((t, i) => {
    if (t.isRejection || excluded.has(i)) return;
    const units = Number(t.units ?? 0);
    const amount = Number(t.amount ?? 0);
    if (amount === 0 && units === 0) return;
    const mirrorSignature = transactionSignature(t.transactionType, -amount, -units);
    const candidates = unclaimedIndexesBySignature.get(mirrorSignature);
    if (!candidates) return;
    while (candidates.length > 0) {
      const candidateIndex = candidates.shift() as number;
      if (candidateIndex === i || excluded.has(candidateIndex)) continue;
      excluded.add(i);
      excluded.add(candidateIndex);
      break;
    }
  });
  return excluded;
}

/** Both exclusions combined (mirrored pairs + same-sign repeats) — the full noise-removal used by the cost-basis walk, where cancelling BOTH halves of a reversal pair out entirely is mathematically correct. NOT what a transaction-history display wants — see findRepeatedTransactionIndexes below. */
function findWalkExclusionIndexes(
  transactions: Array<{ transactionType: string; amount: unknown; units: unknown; isRejection?: boolean }>,
): Set<number> {
  const excluded = excludeMirroredReversalPairs(transactions);
  const seenSignatures = new Set<string>();
  transactions.forEach((t, i) => {
    if (t.isRejection || excluded.has(i)) return;
    const units = Number(t.units ?? 0);
    const amount = Number(t.amount ?? 0);
    const signature = transactionSignature(t.transactionType, amount, units);
    if (seenSignatures.has(signature)) {
      excluded.add(i);
      return;
    }
    seenSignatures.add(signature);
  });
  return excluded;
}

/**
 * Same-sign exact repeats ONLY — deliberately does NOT also exclude
 * mirrored reversal pairs the way the cost-basis walk does. For a
 * transaction-history DISPLAY, a positive transaction and its later
 * negative reversal are two distinct, non-identical-looking rows (opposite
 * sign, different date) — a real user wouldn't call that pair "repeat
 * entries" the way an exact same-sign copy obviously is. Confirmed the hard
 * way on real data (2026-08-12): applying the walk's full exclusion set to
 * a display list wiped out 6 years of a real folio's genuine transaction
 * history (204 of 288 rows gone, 80 of the remaining 84 still crammed onto
 * one reissue date) — mathematically neutral for cost-basis, but a
 * transaction HISTORY that's missing years of real entries is a worse bug
 * than the "repeat entries" it was meant to fix. Reported 2026-08-12: "in
 * many clients... few transactions are showing repeat entry", seen across
 * SIP/STP/SWP folios especially since those accumulate the most same-amount
 * rows for a mass-reissue batch to duplicate.
 *
 * REQUIRES `transactions` sorted by transactionDate ASCENDING — "first
 * occurrence" here means "earliest real date", which is what should survive
 * when only one of several identical rows gets shown. A caller displaying
 * newest-first must sort ascending, run this, filter, THEN reverse for
 * display — never run it on a pre-reversed (descending) array, which would
 * silently keep the LATEST reissued copy instead of the original.
 */
export function findRepeatedTransactionIndexes(
  transactions: Array<{ transactionType: string; amount: unknown; units: unknown; isRejection?: boolean }>,
): Set<number> {
  const excluded = new Set<number>();
  const seenSignatures = new Set<string>();
  transactions.forEach((t, i) => {
    if (t.isRejection) return;
    const units = Number(t.units ?? 0);
    const amount = Number(t.amount ?? 0);
    const signature = transactionSignature(t.transactionType, amount, units);
    if (seenSignatures.has(signature)) {
      excluded.add(i);
      return;
    }
    seenSignatures.add(signature);
  });
  return excluded;
}

function walkTransactions(
  transactions: Array<{ transactionType: string; amount: unknown; units: unknown; isRejection?: boolean }>,
): { cumulativeUnits: number; cumulativeCost: number } {
  let cumulativeUnits = 0;
  let cumulativeCost = 0;
  const excludedIndexes = findWalkExclusionIndexes(transactions);
  transactions.forEach((t, i) => {
    if (t.isRejection || excludedIndexes.has(i)) return;
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
  });
  // Floor only the FINAL total, never an intermediate step — a going-negative
  // dip mid-history is often a real, meaningful reversal-pair (a negative
  // PURCHASE/REDEMPTION row that exists specifically to cancel a later or
  // earlier counterpart row); zeroing it out mid-walk erases that pairing
  // and makes the counterpart get double-counted as fresh money instead of
  // a cancellation (confirmed by trying it on real data 2026-08-10: clamping
  // every step turned one client's total from -₹26 lakh into +₹670 CRORE).
  // Only the END state is guaranteed nonsensical if negative — a real
  // holding can't have negative units or owe negative money right now.
  return {
    cumulativeUnits: Math.max(0, cumulativeUnits),
    cumulativeCost: Math.max(0, cumulativeCost),
  };
}

export function computeFolioInvestedAmount(
  transactions: Array<{ transactionType: string; amount: unknown; units: unknown; isRejection?: boolean }>,
  currentBalanceUnits?: number | null,
): number {
  const { cumulativeUnits, cumulativeCost } = walkTransactions(transactions);

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

/**
 * Net current unit balance replayed purely from transaction history — the
 * fallback for folios that have never received an RTA balance report
 * (CLIENT_AUM/WBR4/MFSD203) at all, so Folio.balanceUnits is null despite
 * real transactions existing (confirmed real case: a client with a genuine
 * ₹2.5L lumpsum purchase and 968.149 units on the transaction itself, but
 * zero folio-level balance/valuation data because no balance report had
 * arrived yet for that folio). Only meant to be used when balanceUnits is
 * actually null — once a real RTA balance snapshot exists, that's always
 * authoritative (see computeFolioInvestedAmount's own doc comment on why
 * transaction-replay alone can drift from the RTA's real count).
 */
export function computeFolioCurrentUnitsFromTransactions(
  transactions: Array<{ transactionType: string; amount: unknown; units: unknown; isRejection?: boolean }>,
): number {
  return walkTransactions(transactions).cumulativeUnits;
}

/**
 * Most recent (last chronologically, i.e. last in a transactionDate-ascending
 * array) non-null navPerUnit across a folio's transactions — the NAV used to
 * value computeFolioCurrentUnitsFromTransactions's estimated unit count when
 * there's no live AMFI NAV match yet either.
 */
export function mostRecentTransactionNav(
  transactions: Array<{ navPerUnit: unknown; isRejection?: boolean }>,
): number | null {
  for (let i = transactions.length - 1; i >= 0; i--) {
    const t = transactions[i];
    if (t.isRejection) continue;
    if (t.navPerUnit !== null && t.navPerUnit !== undefined) {
      return Number(t.navPerUnit);
    }
  }
  return null;
}
