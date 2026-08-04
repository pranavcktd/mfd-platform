/**
 * FIFO-based capital gains for Indian mutual funds, replacing the previous
 * weighted-average approach in ReportsService.getCapitalGainsReport. FIFO
 * lot matching (not weighted-average) is the method actually required
 * under Indian tax law, and it's what enables correct STCG/LTCG
 * classification, since different lots of the same folio can have
 * different holding periods relative to any one sale.
 *
 * Rates and thresholds below are current as of FY2025-26/FY2026-27 (Budget
 * 2026 made no change to Budget 2024's rates) — verified against public
 * sources 2026-08-02, not hardcoded from assumption. Tax law changes with
 * each Union Budget; these constants need re-checking whenever one lands.
 *
 * KNOWN LIMITATIONS — this is a best-effort estimate, not a tax-filing
 * document, same posture as every commercial CAS-parsing tool that does
 * this (e.g. casparser, which reconciles to official CAMS/KFintech gain
 * statements and still doesn't claim to be filing-ready):
 *  1. Equity grandfathering (the Jan 31, 2018 NAV cost-basis floor, Budget
 *     2018, Section 112A) IS applied when a historical NAV for that exact
 *     date is available (see nav-history-backfill.processor.ts) — cost
 *     basis becomes max(actual cost, min(FMV as of 2018-01-31, sale
 *     proceeds)), the real statutory formula. When no historical NAV has
 *     been backfilled for that scheme's ISIN yet, the lot is still flagged
 *     (grandfatheringApplicable=true, grandfatheringApplied=false) and the
 *     gain shown is the un-grandfathered (overstated) figure.
 *  2. Where the applicable rate depends on the investor's income slab (all
 *     debt-fund STCG, both regimes), estimatedTax is left null rather than
 *     guessing a rate — the gain/classification is still shown.
 *  3. Equity's ₹1.25L/year LTCG exemption is NOT netted out here — it's an
 *     annual, cross-folio, cross-asset aggregate concept that doesn't fit
 *     a single-folio computation; the reported LTCG gain is pre-exemption.
 *  4. Asset classification (equity vs debt/other) uses the RTA's own
 *     assetClass text — a hybrid/balanced scheme's TRUE tax treatment
 *     depends on its actual average equity allocation (>65% to qualify as
 *     equity-oriented), which isn't data this platform has.
 */

import { prisma } from "@mfd/db";

export type GainClassification = "STCG" | "LTCG";
export type AssetTaxCategory = "EQUITY" | "DEBT_OR_OTHER";

export interface CapitalGainTransactionInput {
  transactionType: string;
  transactionDate: Date;
  amount: unknown;
  units: unknown;
  isRejection?: boolean | null;
}

export interface RealizedGainLot {
  purchaseDate: Date;
  saleDate: Date;
  units: number;
  costBasis: number;
  saleProceeds: number;
  gain: number;
  holdingDays: number;
  classification: GainClassification;
  taxCategory: AssetTaxCategory;
  /** True when this lot is equity purchased before Jan 31, 2018 — grandfathering is legally relevant. */
  grandfatheringApplicable: boolean;
  /** True when a real Jan 31, 2018 NAV was found and the statutory cost-basis floor was actually applied to this lot. */
  grandfatheringApplied: boolean;
  /** Null when the correct rate depends on the investor's income slab (can't be known here) rather than being a flat statutory rate. */
  estimatedTaxRate: number | null;
  estimatedTax: number | null;
}

const EQUITY_LTCG_THRESHOLD_DAYS = 365; // >12 months
const DEBT_LTCG_THRESHOLD_DAYS = 730; // >24 months — only reachable for pre-2023-04-01 purchases
const DEBT_REGIME_CHANGE_DATE = Date.UTC(2023, 3, 1); // Apr 1, 2023 — Finance Act 2023
const GRANDFATHER_CUTOFF_DATE = Date.UTC(2018, 0, 31); // Jan 31, 2018 — Budget 2018

const EQUITY_LTCG_RATE = 0.125;
const EQUITY_STCG_RATE = 0.2;
const DEBT_PRE2023_LTCG_RATE = 0.125;

const PURCHASE_TYPES = new Set(["PURCHASE", "SWITCH_IN", "BONUS"]);
const SALE_TYPES = new Set(["REDEMPTION", "SWITCH_OUT"]);
const EPSILON = 1e-6;

/** Real Jan 31, 2018 NAV per scheme (by ISIN) — sourced from SchemeNavHistory, populated via nav-history-backfill.processor.ts. A scheme with no backfilled 2018-01-31 NAV is simply absent from the map, not an error. */
export async function fetchGrandfatherNavByIsin(isins: Array<string | null | undefined>): Promise<Map<string, number>> {
  const uniqueIsins = [...new Set(isins.filter((i): i is string => Boolean(i)))];
  if (uniqueIsins.length === 0) return new Map();
  const rows = await prisma.schemeNavHistory.findMany({
    where: { isin: { in: uniqueIsins }, navDate: new Date(GRANDFATHER_CUTOFF_DATE) },
    select: { isin: true, nav: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.isin, Number(r.nav));
  return map;
}

export function classifyAssetTaxCategory(assetClass: string | null | undefined): AssetTaxCategory {
  // ELSS (Section 80C tax-saving funds) must legally invest >=80% in equity
  // to qualify, so they're equity for capital-gains purposes too even though
  // "ELSS" doesn't contain the substring "equity".
  return assetClass && /equity|elss/i.test(assetClass) ? "EQUITY" : "DEBT_OR_OTHER";
}

function holdingDaysBetween(purchaseDate: Date, saleDate: Date): number {
  return Math.round((saleDate.getTime() - purchaseDate.getTime()) / 86_400_000);
}

/**
 * Section 112A grandfathering: cost of acquisition for equity units bought
 * before Jan 31, 2018 becomes max(actual cost, min(FMV as of 2018-01-31,
 * sale/current value)) — the real statutory formula, not an approximation.
 * Only fires when a real historical NAV for that date has actually been
 * backfilled for this scheme's ISIN (grandfatherNavPerUnit !== null);
 * otherwise the lot is still flagged as applicable-but-not-applied so the
 * caller can show an honest "gain overstated, no 2018 NAV on file yet"
 * note rather than silently using the wrong cost basis.
 */
function applyGrandfathering(
  taxCategory: AssetTaxCategory,
  purchaseDate: Date,
  units: number,
  actualCostBasis: number,
  saleOrCurrentValue: number,
  grandfatherNavPerUnit: number | null,
): { costBasis: number; applicable: boolean; applied: boolean } {
  const applicable = taxCategory === "EQUITY" && purchaseDate.getTime() < GRANDFATHER_CUTOFF_DATE;
  if (!applicable || grandfatherNavPerUnit === null) {
    return { costBasis: actualCostBasis, applicable, applied: false };
  }
  const fmv = units * grandfatherNavPerUnit;
  const costBasis = Math.max(actualCostBasis, Math.min(fmv, saleOrCurrentValue));
  return { costBasis, applicable: true, applied: true };
}

function classifyAndTax(
  taxCategory: AssetTaxCategory,
  purchaseDate: Date,
  saleDate: Date,
  gain: number,
): Pick<RealizedGainLot, "classification" | "estimatedTaxRate" | "estimatedTax"> {
  const holdingDays = holdingDaysBetween(purchaseDate, saleDate);
  const taxableGain = gain > 0 ? gain : 0;

  if (taxCategory === "EQUITY") {
    const classification: GainClassification = holdingDays > EQUITY_LTCG_THRESHOLD_DAYS ? "LTCG" : "STCG";
    const rate = classification === "LTCG" ? EQUITY_LTCG_RATE : EQUITY_STCG_RATE;
    return { classification, estimatedTaxRate: rate, estimatedTax: taxableGain * rate };
  }

  // DEBT_OR_OTHER
  if (purchaseDate.getTime() >= DEBT_REGIME_CHANGE_DATE) {
    // Finance Act 2023: always taxed as STCG at the investor's slab rate, regardless of holding period.
    return { classification: "STCG", estimatedTaxRate: null, estimatedTax: null };
  }
  if (holdingDays > DEBT_LTCG_THRESHOLD_DAYS) {
    return { classification: "LTCG", estimatedTaxRate: DEBT_PRE2023_LTCG_RATE, estimatedTax: taxableGain * DEBT_PRE2023_LTCG_RATE };
  }
  return { classification: "STCG", estimatedTaxRate: null, estimatedTax: null };
}

interface Lot {
  purchaseDate: Date;
  units: number;
  costPerUnit: number;
}

/**
 * Walks a folio's transactions in chronological order, consuming PURCHASE/
 * SWITCH_IN/BONUS lots on a FIFO basis against each REDEMPTION/SWITCH_OUT.
 * Returns one RealizedGainLot per (sale, matched-lot) pair — a single sale
 * that draws from three different purchase lots produces three rows, each
 * correctly classified by that specific lot's own holding period.
 *
 * If a sale consumes more units than any known purchase lot covers (the
 * folio's transaction history starts mid-holding, e.g. a very old folio
 * whose earliest purchases predate this system's data), the remainder is
 * booked as a zero-cost-basis lot dated at the sale itself — a real,
 * visible gap (shows as 100% gain, STCG) rather than a silently wrong
 * number.
 */
export function computeFifoRealizedGains(
  transactions: CapitalGainTransactionInput[],
  assetClass: string | null | undefined,
  /** Real Jan 31, 2018 NAV for this folio's scheme (see nav-history-backfill.processor.ts) — null when not backfilled yet. */
  grandfatherNavPerUnit: number | null = null,
): RealizedGainLot[] {
  const taxCategory = classifyAssetTaxCategory(assetClass);
  const lots: Lot[] = [];
  const realized: RealizedGainLot[] = [];

  for (const t of transactions) {
    if (t.isRejection) continue;
    const units = Number(t.units ?? 0);
    const amount = Number(t.amount ?? 0);
    if (units <= 0) continue;

    if (PURCHASE_TYPES.has(t.transactionType)) {
      const costPerUnit = t.transactionType === "BONUS" ? 0 : amount / units;
      lots.push({ purchaseDate: t.transactionDate, units, costPerUnit });
      continue;
    }
    if (!SALE_TYPES.has(t.transactionType)) continue;

    let unitsToSell = units;
    const saleDate = t.transactionDate;
    const proceedsPerUnit = amount / units;

    while (unitsToSell > EPSILON && lots.length > 0) {
      const lot = lots[0];
      const unitsFromLot = Math.min(lot.units, unitsToSell);
      const actualCostBasis = unitsFromLot * lot.costPerUnit;
      const saleProceeds = unitsFromLot * proceedsPerUnit;
      const gf = applyGrandfathering(taxCategory, lot.purchaseDate, unitsFromLot, actualCostBasis, saleProceeds, grandfatherNavPerUnit);
      const gain = saleProceeds - gf.costBasis;
      const tax = classifyAndTax(taxCategory, lot.purchaseDate, saleDate, gain);
      realized.push({
        purchaseDate: lot.purchaseDate,
        saleDate,
        units: unitsFromLot,
        costBasis: gf.costBasis,
        saleProceeds,
        gain,
        holdingDays: holdingDaysBetween(lot.purchaseDate, saleDate),
        taxCategory,
        grandfatheringApplicable: gf.applicable,
        grandfatheringApplied: gf.applied,
        ...tax,
      });
      lot.units -= unitsFromLot;
      unitsToSell -= unitsFromLot;
      if (lot.units <= EPSILON) lots.shift();
    }

    if (unitsToSell > EPSILON) {
      // Sold more than any known lot covers — real cost basis is unknown, not zero by assumption.
      const saleProceeds = unitsToSell * proceedsPerUnit;
      realized.push({
        purchaseDate: saleDate,
        saleDate,
        units: unitsToSell,
        costBasis: 0,
        saleProceeds,
        gain: saleProceeds,
        holdingDays: 0,
        classification: "STCG",
        taxCategory,
        grandfatheringApplicable: false,
        grandfatheringApplied: false,
        estimatedTaxRate: taxCategory === "EQUITY" ? EQUITY_STCG_RATE : null,
        estimatedTax: taxCategory === "EQUITY" ? saleProceeds * EQUITY_STCG_RATE : null,
      });
    }
  }

  return realized;
}

export interface UnrealizedGainLot {
  purchaseDate: Date;
  units: number;
  costBasis: number;
  currentValue: number;
  gain: number;
  holdingDays: number;
  classification: GainClassification;
  taxCategory: AssetTaxCategory;
  grandfatheringApplicable: boolean;
  grandfatheringApplied: boolean;
  estimatedTaxRate: number | null;
  estimatedTax: number | null;
}

/**
 * Same FIFO walk as computeFifoRealizedGains, but for the lots still
 * remaining after all real transactions — i.e. the current holding.
 * currentValue/currentUnits come from the folio's own latest known
 * balance+valuation (RTA snapshot or live AMFI value, caller's choice);
 * per-lot value is allocated proportionally by units, which is exact (not
 * an approximation) since every remaining unit of one scheme carries the
 * same NAV today.
 */
export function computeFifoUnrealizedGain(
  transactions: CapitalGainTransactionInput[],
  assetClass: string | null | undefined,
  currentUnits: number,
  currentValue: number,
  asOfDate: Date = new Date(),
  /** Real Jan 31, 2018 NAV for this folio's scheme — null when not backfilled yet. */
  grandfatherNavPerUnit: number | null = null,
): UnrealizedGainLot[] {
  const taxCategory = classifyAssetTaxCategory(assetClass);
  const lots: Lot[] = [];

  for (const t of transactions) {
    if (t.isRejection) continue;
    const units = Number(t.units ?? 0);
    const amount = Number(t.amount ?? 0);
    if (units <= 0) continue;

    if (PURCHASE_TYPES.has(t.transactionType)) {
      const costPerUnit = t.transactionType === "BONUS" ? 0 : amount / units;
      lots.push({ purchaseDate: t.transactionDate, units, costPerUnit });
      continue;
    }
    if (!SALE_TYPES.has(t.transactionType)) continue;

    let unitsToSell = units;
    while (unitsToSell > EPSILON && lots.length > 0) {
      const lot = lots[0];
      const unitsFromLot = Math.min(lot.units, unitsToSell);
      lot.units -= unitsFromLot;
      unitsToSell -= unitsFromLot;
      if (lot.units <= EPSILON) lots.shift();
    }
  }

  const totalLotUnits = lots.reduce((sum, l) => sum + l.units, 0);
  const valuePerUnit = totalLotUnits > EPSILON ? currentValue / totalLotUnits : currentUnits > EPSILON ? currentValue / currentUnits : 0;

  return lots.map((lot) => {
    const actualCostBasis = lot.units * lot.costPerUnit;
    const lotCurrentValue = lot.units * valuePerUnit;
    const gf = applyGrandfathering(taxCategory, lot.purchaseDate, lot.units, actualCostBasis, lotCurrentValue, grandfatherNavPerUnit);
    const gain = lotCurrentValue - gf.costBasis;
    const tax = classifyAndTax(taxCategory, lot.purchaseDate, asOfDate, gain);
    return {
      purchaseDate: lot.purchaseDate,
      units: lot.units,
      costBasis: gf.costBasis,
      currentValue: lotCurrentValue,
      gain,
      holdingDays: holdingDaysBetween(lot.purchaseDate, asOfDate),
      taxCategory,
      grandfatheringApplicable: gf.applicable,
      grandfatheringApplied: gf.applied,
      ...tax,
    };
  });
}
