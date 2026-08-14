import { BadRequestException, Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { Prisma, prisma } from "@mfd/db";
import { QueueNames } from "@mfd/shared";
import { createRedisConnection } from "../mail/redis-connection";
import { logAdminAction } from "../admin/audit-log";
import { parseManualNavFile } from "./manual-nav-upload.util";

const MANUAL_UPLOAD_BATCH_SIZE = 1000;

type NavSyncJobData = Record<string, never>;
interface NavHistoryBackfillJobData {
  fromDate: string;
  toDate: string;
}

const MAX_RANGE_DAYS = 90;

// Lazy, module-scope-singleton Queue producer — same rationale as
// mail.service.ts's own producers (avoid opening a Redis connection as an
// import side effect).
let connection: ReturnType<typeof createRedisConnection> | undefined;
function getConnection() {
  return (connection ??= createRedisConnection());
}

let _navSyncQueue: Queue<NavSyncJobData> | undefined;
function navSyncQueue(): Queue<NavSyncJobData> {
  return (_navSyncQueue ??= new Queue(QueueNames.NAV_SYNC, { connection: getConnection() }));
}

let _navHistoryBackfillQueue: Queue<NavHistoryBackfillJobData> | undefined;
function navHistoryBackfillQueue(): Queue<NavHistoryBackfillJobData> {
  return (_navHistoryBackfillQueue ??= new Queue(QueueNames.NAV_HISTORY_BACKFILL, { connection: getConnection() }));
}

@Injectable()
export class NavService {
  async triggerCheckNow() {
    const job = await navSyncQueue().add("nav-sync-manual", {});
    await logAdminAction("NAV_SYNC_CHECK_NOW", undefined, { jobId: job.id });
    return { jobId: job.id, triggeredAt: new Date().toISOString() };
  }

  /** fromDate/toDate are "YYYY-MM-DD" — AMFI's own real limit is 90 days per request, enforced here before even enqueuing. */
  async triggerHistoryBackfill(fromDate: string, toDate: string) {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException("fromDate/toDate must be valid YYYY-MM-DD dates");
    }
    const days = (to.getTime() - from.getTime()) / 86_400_000;
    if (days < 0 || days > MAX_RANGE_DAYS) {
      throw new BadRequestException(`Date range must be 0-${MAX_RANGE_DAYS} days (AMFI's own limit) — got ${days} days`);
    }
    const job = await navHistoryBackfillQueue().add("nav-history-backfill", { fromDate, toDate });
    await logAdminAction("NAV_HISTORY_BACKFILL", undefined, { jobId: job.id, fromDate, toDate });
    return { jobId: job.id, fromDate, toDate, triggeredAt: new Date().toISOString() };
  }

  /**
   * Manual fallback for when AMFI's site is down or changes shape and the
   * automated daily sync can't run — a super admin hand-fills (or exports
   * from another source into) the CSV/Excel template and uploads it here.
   * Runs synchronously in the request (same precedent as CAS import in
   * import-external.controller.ts) rather than via the BullMQ queue the
   * other two NAV jobs use, since this is an occasional, admin-triggered,
   * bounded-size operation, not a scheduled bulk pull. Writes through the
   * exact same scheme_master UPDATE + scheme_nav_history upsert shape as
   * the daily AMFI sync, tagged with this run's own NavSyncLog id, so the
   * existing "View" button and Day/Month-change AUM math both just work on
   * manually-uploaded NAVs with no special-casing.
   */
  async manualUpload(file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    if (!/\.csv$/i.test(file.originalname)) {
      throw new BadRequestException("Only .csv files are accepted — download the template, fill it in, and save/export as CSV (Excel can save-as CSV directly).");
    }
    const { rows, totalDataRows, errors } = parseManualNavFile(file.buffer);
    if (rows.length === 0) {
      throw new BadRequestException(errors[0] ?? "No valid rows found in the uploaded file");
    }

    const log = await prisma.navSyncLog.create({ data: { status: "RUNNING", syncType: "MANUAL_UPLOAD" } });
    try {
      const seenIsins = new Set<string>();
      const dedupedRows = rows.filter((r) => (seenIsins.has(r.isin) ? false : (seenIsins.add(r.isin), true)));

      let matched = 0;
      for (let i = 0; i < dedupedRows.length; i += MANUAL_UPLOAD_BATCH_SIZE) {
        const batch = dedupedRows.slice(i, i + MANUAL_UPLOAD_BATCH_SIZE);
        const values = batch.map((r) => Prisma.sql`(${r.isin}::text, ${r.nav}::numeric, ${r.navDate}::date)`);

        const result = await prisma.$executeRaw`
          UPDATE scheme_master sm
          SET latest_nav = v.nav, latest_nav_date = v.nav_date
          FROM (VALUES ${Prisma.join(values)}) AS v(isin, nav, nav_date)
          WHERE sm.isin = v.isin
        `;
        matched += result;

        await prisma.$executeRaw`
          INSERT INTO scheme_nav_history (id, isin, nav_date, nav, created_at, nav_sync_log_id)
          SELECT gen_random_uuid(), v.isin, v.nav_date, v.nav, now(), ${log.id}::uuid
          FROM (VALUES ${Prisma.join(values)}) AS v(isin, nav, nav_date)
          ON CONFLICT (isin, nav_date) DO UPDATE SET nav = EXCLUDED.nav, nav_sync_log_id = EXCLUDED.nav_sync_log_id
        `;
      }

      const unmatchedCount = dedupedRows.length - matched;
      const errorSummary = [
        ...errors,
        unmatchedCount > 0 ? `${unmatchedCount} ISIN(s) not found in Scheme Master — not created (unlike the AMFI daily sync, a manual upload only updates known schemes)` : null,
      ].filter((e): e is string => Boolean(e));

      await prisma.navSyncLog.update({
        where: { id: log.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          totalRowsInFile: totalDataRows,
          schemesMatched: matched,
          errorMessage: errorSummary.length > 0 ? errorSummary.join(" | ") : null,
        },
      });
      await logAdminAction("NAV_MANUAL_UPLOAD", undefined, { logId: log.id, totalDataRows, matched, rowErrors: errors.length });
      return { logId: log.id, totalDataRows, matched, rowErrors: errors };
    } catch (err) {
      await prisma.navSyncLog.update({
        where: { id: log.id },
        data: { status: "FAILED", completedAt: new Date(), errorMessage: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  /** Real per-run audit trail (timestamps, status, row counts) — same shape of visibility MailIngestionLog already gives the RTA mail sync. */
  async listLogs() {
    return prisma.navSyncLog.findMany({ orderBy: { triggeredAt: "desc" }, take: 50 });
  }

  /**
   * The actual scheme/NAV rows a specific sync run wrote — lets a super
   * admin spot-check "did this run really pull today's live NAV" against a
   * real scheme name, not just trust the aggregate schemesMatched count.
   * Joined to SchemeMaster by ISIN for a human-readable name/AMC (history
   * rows themselves only carry the ISIN). ON CONFLICT in both processors
   * reattributes navSyncLogId to whichever run most recently confirmed a
   * given (isin, navDate), so this is always that run's real output, not a
   * stale first-insert snapshot.
   */
  async getLogData(logId: string, page: number, search?: string) {
    const pageSize = 50;
    const q = search?.trim();
    const searchClause = q ? Prisma.sql`AND (h.isin ILIKE ${"%" + q + "%"} OR sm.scheme_name ILIKE ${"%" + q + "%"})` : Prisma.empty;

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<
        Array<{ isin: string; schemeName: string | null; amcCode: string | null; amcName: string | null; nav: string; navDate: Date }>
      >`
        SELECT h.isin, sm.scheme_name AS "schemeName", sm.amc_code AS "amcCode", sm.amc_name AS "amcName", h.nav::text AS nav, h.nav_date AS "navDate"
        FROM scheme_nav_history h
        LEFT JOIN scheme_master sm ON sm.isin = h.isin
        WHERE h.nav_sync_log_id = ${logId}::uuid
        ${searchClause}
        ORDER BY sm.scheme_name ASC NULLS LAST
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM scheme_nav_history h
        LEFT JOIN scheme_master sm ON sm.isin = h.isin
        WHERE h.nav_sync_log_id = ${logId}::uuid
        ${searchClause}
      `,
    ]);

    return {
      rows: rows.map((r) => ({
        isin: r.isin,
        schemeName: r.schemeName,
        amcCode: r.amcCode,
        amcName: r.amcName,
        nav: r.nav,
        navDate: r.navDate.toISOString().slice(0, 10),
      })),
      total: Number(countRows[0]?.count ?? 0),
      pageSize,
    };
  }
}
