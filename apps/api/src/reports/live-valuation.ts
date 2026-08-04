import { prisma } from "@mfd/db";

export interface SchemeNavLookup {
  latestNav: number;
  latestNavDate: Date | null;
}

/**
 * Fetches the latest AMFI-published NAV for a set of scheme ISINs in one
 * query. A scheme with no live NAV yet — not present in SchemeMaster, or
 * SchemeMaster has never been matched by nav-sync — is simply absent from
 * the returned map rather than an error; callers fall back to the RTA's
 * own reported valuation in that case.
 */
export async function fetchLatestNavByIsin(isins: Array<string | null | undefined>): Promise<Map<string, SchemeNavLookup>> {
  const uniqueIsins = [...new Set(isins.filter((i): i is string => Boolean(i)))];
  if (uniqueIsins.length === 0) return new Map();

  const rows = await prisma.schemeMaster.findMany({
    where: { isin: { in: uniqueIsins }, latestNav: { not: null } },
    select: { isin: true, latestNav: true, latestNavDate: true },
  });

  const map = new Map<string, SchemeNavLookup>();
  for (const r of rows) {
    if (!r.isin || r.latestNav === null) continue;
    map.set(r.isin, { latestNav: Number(r.latestNav), latestNavDate: r.latestNavDate });
  }
  return map;
}

export interface LiveValuationResult {
  liveNav: string | null;
  liveNavDate: Date | null;
  liveValue: string | null;
}

/** balanceUnits is whatever units the RTA's last balance report told us — same source of truth the RTA-reported valuationAmount already uses, just multiplied by today's real NAV instead of the RTA's own (often stale) snapshot valuation. */
export function computeLiveValue(balanceUnits: unknown, nav: SchemeNavLookup | undefined): LiveValuationResult {
  if (!nav) {
    return { liveNav: null, liveNavDate: null, liveValue: null };
  }
  const units = Number(balanceUnits ?? 0);
  return {
    liveNav: nav.latestNav.toString(),
    liveNavDate: nav.latestNavDate,
    liveValue: (units * nav.latestNav).toFixed(2),
  };
}
