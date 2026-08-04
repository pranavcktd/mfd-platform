import { Job } from "bullmq";
import { Prisma, prisma } from "@mfd/db";
import { parseRtaDate, resolveAmcName } from "@mfd/shared";

export type NavSyncJobData = Record<string, never>;

/**
 * AMFI's real, current daily NAV file — confirmed live 2026-08-02 (the
 * older getNAVdata.php endpoint now serves an HTML app shell, not the raw
 * file). Free, public, no auth, one row per scheme+plan+option combination,
 * covering the whole industry. Format confirmed against a real download:
 *   Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
 * interspersed with blank lines and un-delimited category/AMC header lines
 * (skipped — anything without a ";" isn't a data row). Date is "DD-MMM-YYYY"
 * (e.g. "31-Jul-2026"), the exact same shape parseRtaDate already handles
 * for CAMS dates.
 */
const AMFI_NAV_URL = "https://www.amfiindia.com/spages/NAVAll.txt";

interface ParsedNavRow {
  amfiSchemeCode: string;
  schemeName: string;
  isin: string;
  nav: number;
  navDate: Date;
}

export function parseAmfiNavFile(text: string): ParsedNavRow[] {
  const rows: ParsedNavRow[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || !line.includes(";")) continue; // blank lines, category/AMC header lines
    const fields = line.split(";");
    if (fields.length < 6) continue;
    const [schemeCode, isinPayoutOrGrowth, isinReinvestment, schemeName, navText, dateText] = fields;
    if (schemeCode === "Scheme Code") continue; // header row

    // Each AMFI row is already one specific scheme+plan+option — normally
    // only one of the two ISIN columns is populated (the other is "-").
    const isin =
      isinPayoutOrGrowth && isinPayoutOrGrowth.trim() !== "-"
        ? isinPayoutOrGrowth.trim()
        : isinReinvestment && isinReinvestment.trim() !== "-"
          ? isinReinvestment.trim()
          : null;
    if (!isin) continue;
    // Real data confirmed AMFI's file uses placeholder text ("ACTVNOINFLOW",
    // "UNCLAIMDISIN") in the ISIN column for certain scheme types instead of
    // a real ISIN — a real ISIN is always 2 letters + 9 alphanumeric + 1
    // check digit (12 chars). Filtered here rather than left to the isin
    // index/join, since a garbage value that isn't rejected still occupies a
    // scheme_master row unnecessarily (never harmful to the join itself,
    // since no real folio's ISIN would ever equal one of these strings).
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) continue;

    const nav = Number(navText);
    if (!Number.isFinite(nav) || nav <= 0) continue;

    let navDate: Date | undefined;
    try {
      navDate = parseRtaDate(dateText.trim());
    } catch {
      continue;
    }
    if (!navDate) continue;
    if (!schemeName || !schemeName.trim()) continue;

    rows.push({ amfiSchemeCode: schemeCode.trim(), schemeName: schemeName.trim(), isin, nav, navDate });
  }
  return rows;
}

/**
 * Daily job (see index.ts's scheduler) — mutual fund NAVs are published
 * once a day, not intraday, so once-daily is the correct cadence, not a
 * limitation. Matches purely by ISIN against the global SchemeMaster table.
 *
 * SchemeMaster's row set is otherwise entirely sourced from CAMS's own WBR39
 * report (see crm-sync.ts) — real data confirmed this means AMCs that use
 * ONLY KFintech as their RTA (e.g. Nippon India, confirmed via a real
 * folio: 0/653 KFintech folios with a captured ISIN matched, because their
 * AMC has zero rows in WBR39-sourced SchemeMaster at all) can never get a
 * live NAV via the UPDATE alone, no matter how good ISIN capture is on the
 * Folio side. AMFI's own daily file is genuinely RTA-agnostic (every AMC,
 * regardless of which RTA services it), so this also INSERTs a lightweight
 * SchemeMaster row (synthetic amcCode "AMFI", scheme name/code straight
 * from AMFI's file) for any ISIN not already known under any amcCode —
 * gated with a NOT EXISTS on isin, not just ON CONFLICT on the
 * (amcCode, schemeCode) key, specifically so one ISIN can never end up on
 * two SchemeMaster rows at once (which would double-count that folio's
 * value in the live-AUM SUM join).
 */
export async function processNavSync(_job: Job<NavSyncJobData>) {
  const log = await prisma.navSyncLog.create({ data: { status: "RUNNING", syncType: "DAILY" } });
  try {
    const response = await fetch(AMFI_NAV_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MFDPlatformNavSync/1.0)" },
    });
    if (!response.ok) {
      throw new Error(`Failed to download AMFI NAV file: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    const parsedRows = parseAmfiNavFile(text);
    if (parsedRows.length === 0) {
      throw new Error("AMFI NAV file parsed to zero rows — format may have changed");
    }
    // Dedup by ISIN (first occurrence wins) before batching — guarantees at
    // most one row per ISIN even within a single INSERT statement's own
    // batch, where a same-batch NOT EXISTS can't see sibling rows being
    // inserted by the same statement.
    const seenIsins = new Set<string>();
    const rows = parsedRows.filter((r) => (seenIsins.has(r.isin) ? false : (seenIsins.add(r.isin), true)));

    const BATCH_SIZE = 1000;
    let matched = 0;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const updateValues = batch.map((r) => Prisma.sql`(${r.isin}::text, ${r.nav}::numeric, ${r.navDate}::date)`);
      const result = await prisma.$executeRaw`
        UPDATE scheme_master sm
        SET latest_nav = v.nav, latest_nav_date = v.nav_date
        FROM (VALUES ${Prisma.join(updateValues)}) AS v(isin, nav, nav_date)
        WHERE sm.isin = v.isin
      `;
      matched += result;

      // Also append today's NAV onto the real dated time series (previously
      // only ever populated by the one-off Jan 31, 2018 grandfathering
      // backfill) — this is what unlocks day-over-day "day change" figures
      // once at least two days have accumulated; ON CONFLICT DO NOTHING
      // since a same-day re-run must never overwrite an already-recorded row.
      await prisma.$executeRaw`
        INSERT INTO scheme_nav_history (id, isin, nav_date, nav, created_at)
        SELECT gen_random_uuid(), v.isin, v.nav_date, v.nav, now()
        FROM (VALUES ${Prisma.join(updateValues)}) AS v(isin, nav, nav_date)
        ON CONFLICT (isin, nav_date) DO NOTHING
      `;

      // amc_name uses the same scheme-name-prefix heuristic already trusted
      // elsewhere in this codebase (resolveAmcName) rather than left null —
      // the data-quality module's suggestion ranking boosts candidates whose
      // amc_name matches a folio's real AMC, and that boost is exactly what
      // disambiguates near-identical scheme names (Regular vs Direct plan,
      // two AMCs both running a "Flexi Cap Fund"). Left null (not the
      // "AMC Code AMFI" fallback string) when the heuristic doesn't
      // recognize the scheme, since a wrong-but-confident amc_name would be
      // worse than none for that ranking boost.
      const insertValues = batch.map((r) => {
        const resolved = resolveAmcName(r.schemeName, "AMFI");
        const amcName = resolved.startsWith("AMC Code ") ? null : resolved;
        return Prisma.sql`(gen_random_uuid(), 'AMFI', ${r.amfiSchemeCode}::text, ${amcName}::text, ${r.schemeName}::text, ${r.isin}::text, ${r.nav}::numeric, ${r.navDate}::date, now())`;
      });
      const insertResult: unknown[] = await prisma.$queryRaw`
        INSERT INTO scheme_master (id, amc_code, scheme_code, amc_name, scheme_name, isin, latest_nav, latest_nav_date, updated_at)
        SELECT v.id, v.amc_code, v.scheme_code, v.amc_name, v.scheme_name, v.isin, v.nav, v.nav_date, v.updated_at
        FROM (VALUES ${Prisma.join(insertValues)}) AS v(id, amc_code, scheme_code, amc_name, scheme_name, isin, nav, nav_date, updated_at)
        WHERE NOT EXISTS (SELECT 1 FROM scheme_master sm WHERE sm.isin = v.isin)
        ON CONFLICT (amc_code, scheme_code) DO NOTHING
        RETURNING id
      `;
      inserted += insertResult.length;
    }

    await prisma.navSyncLog.update({
      where: { id: log.id },
      data: { status: "COMPLETED", completedAt: new Date(), totalRowsInFile: rows.length, schemesMatched: matched + inserted },
    });
    return { totalRowsInFile: rows.length, schemesMatched: matched, schemesInserted: inserted };
  } catch (err) {
    await prisma.navSyncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
