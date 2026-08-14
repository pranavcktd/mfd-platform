import { Job } from "bullmq";
import { Prisma, prisma } from "@mfd/db";

export interface NavHistoryBackfillJobData {
  /** ISO date strings ("YYYY-MM-DD"), inclusive. AMFI's own real limit is 90 days per request — enforced here, not assumed. */
  fromDate: string;
  toDate: string;
}

/**
 * AMFI's real historical-NAV endpoint — a genuinely different format from
 * the daily NAVAll.txt (confirmed by a real download, not assumed):
 *   Scheme Code;Scheme Name;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Repurchase Price;Sale Price;Date
 * (daily file has Scheme Name and the ISIN columns in the opposite order,
 * and no Repurchase/Sale Price columns — these are NOT interchangeable
 * parsers). Same blank-line/category-header/AMC-header skipping as the
 * daily file.
 */
const AMFI_HISTORY_URL = "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx";
const MAX_RANGE_DAYS = 90;

function formatAmfiDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(day).padStart(2, "0")}-${months[month - 1]}-${year}`;
}

interface ParsedHistoricalNavRow {
  isin: string;
  nav: number;
  navDate: Date;
}

export function parseAmfiHistoricalNavFile(text: string): ParsedHistoricalNavRow[] {
  const rows: ParsedHistoricalNavRow[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || !line.includes(";")) continue;
    const fields = line.split(";");
    if (fields.length < 8) continue;
    const [schemeCode, , isinPayoutOrGrowth, isinReinvestment, navText, , , dateText] = fields;
    if (schemeCode === "Scheme Code") continue;

    const isin =
      isinPayoutOrGrowth && isinPayoutOrGrowth.trim() !== "-" && isinPayoutOrGrowth.trim() !== ""
        ? isinPayoutOrGrowth.trim()
        : isinReinvestment && isinReinvestment.trim() !== "-" && isinReinvestment.trim() !== ""
          ? isinReinvestment.trim()
          : null;
    if (!isin) continue;

    const nav = Number(navText);
    if (!Number.isFinite(nav) || nav <= 0) continue;

    // AMFI's historical date format ("DD-Mon-YYYY") matches parseRtaDate's
    // existing month-name pattern, but that helper lives in packages/shared
    // scoped to RTA report parsing — inlined here rather than stretching
    // that module's scope for one caller.
    const match = dateText.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (!match) continue;
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIndex = months.indexOf(match[2].toLowerCase());
    if (monthIndex === -1) continue;
    const navDate = new Date(Date.UTC(Number(match[3]), monthIndex, Number(match[1])));

    rows.push({ isin, nav, navDate });
  }
  return rows;
}

/**
 * On-demand backfill (not scheduled — triggered via POST
 * /admin/nav/backfill-history with an explicit date range). Built
 * specifically to fetch Jan 31, 2018 (the equity capital-gains
 * grandfathering date), but works for any range up to AMFI's own 90-day
 * limit.
 */
export async function processNavHistoryBackfill(job: Job<NavHistoryBackfillJobData>) {
  const { fromDate, toDate } = job.data;
  const days = (new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86_400_000;
  if (days < 0 || days > MAX_RANGE_DAYS) {
    throw new Error(`Date range must be 0-${MAX_RANGE_DAYS} days (AMFI's own limit) — got ${days} days`);
  }

  const log = await prisma.navSyncLog.create({
    data: { status: "RUNNING", syncType: "HISTORY_BACKFILL", fromDate: new Date(fromDate), toDate: new Date(toDate) },
  });
  try {
    const url = `${AMFI_HISTORY_URL}?tp=1&frmdt=${formatAmfiDate(fromDate)}&todt=${formatAmfiDate(toDate)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MFDPlatformNavHistoryBackfill/1.0)" },
    });
    if (!response.ok) {
      throw new Error(`Failed to download AMFI historical NAV file: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    const rows = parseAmfiHistoricalNavFile(text);
    if (rows.length === 0) {
      throw new Error("AMFI historical NAV file parsed to zero rows — format may have changed, or no trading data in this range");
    }

    const BATCH_SIZE = 1000;
    let upserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values = batch.map((r) => Prisma.sql`(gen_random_uuid(), ${r.isin}::text, ${r.navDate}::date, ${r.nav}::numeric, now(), ${log.id}::uuid)`);
      const result: unknown[] = await prisma.$queryRaw`
        INSERT INTO scheme_nav_history (id, isin, nav_date, nav, created_at, nav_sync_log_id)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (isin, nav_date) DO UPDATE SET nav = EXCLUDED.nav, nav_sync_log_id = EXCLUDED.nav_sync_log_id
        RETURNING id
      `;
      upserted += result.length;
    }

    await prisma.navSyncLog.update({
      where: { id: log.id },
      data: { status: "COMPLETED", completedAt: new Date(), totalRowsInFile: rows.length, schemesMatched: upserted },
    });
    return { totalRowsInFile: rows.length, rowsUpserted: upserted, fromDate, toDate };
  } catch (err) {
    await prisma.navSyncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
