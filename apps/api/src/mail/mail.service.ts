import { BadRequestException, Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { prisma } from "@mfd/db";
import { QueueNames, walkFolder, inferRtaType, RECOGNIZED_EXTENSIONS } from "@mfd/shared";
import { createRedisConnection } from "./redis-connection";
import { logAdminAction } from "../admin/audit-log";
import { FolderImportDto } from "./dto/folder-import.dto";
import { FolderImportPreviewDto } from "./dto/folder-import-preview.dto";

const PREVIEW_FILE_LIST_LIMIT = 200;

type MailIngestionJobData = Record<string, never>;

// Mirrors apps/workers/src/processors/folder-import.processor.ts's
// FolderImportJobData — not imported directly since apps/api and
// apps/workers are separate TS projects, they only agree via the shared
// job-data shape enqueued onto QueueNames.FOLDER_IMPORT.
interface FolderImportJobData {
  distributorId: string;
  arnProfileId?: string;
  folderPath: string;
  camsZipPassword?: string;
  kfintechZipPassword?: string;
}

const FAILED_STATUSES = new Set(["DOWNLOAD_FAILED", "DECRYPT_FAILED", "PARSE_FAILED"]);
/** Must match the id apps/workers/src/index.ts registers via upsertJobScheduler — this is how the API pauses/resumes the same scheduled poll without touching the workers process. */
const MAIL_POLL_SCHEDULER_ID = "mail-poll-schedule";

// Lazy, module-scope-singleton Queue producer — same rationale as
// apps/workers/src/queues/queue-producers.ts: avoid opening a Redis
// connection as an import side effect.
let connection: ReturnType<typeof createRedisConnection> | undefined;
function getConnection() {
  return (connection ??= createRedisConnection());
}

let _mailIngestionQueue: Queue<MailIngestionJobData> | undefined;
function mailIngestionQueue(): Queue<MailIngestionJobData> {
  return (_mailIngestionQueue ??= new Queue(QueueNames.MAIL_INGESTION, { connection: getConnection() }));
}

let _folderImportQueue: Queue<FolderImportJobData> | undefined;
function folderImportQueue(): Queue<FolderImportJobData> {
  return (_folderImportQueue ??= new Queue(QueueNames.FOLDER_IMPORT, { connection: getConnection() }));
}

/** "folder-import" isolates one since-inception bulk-import run from ongoing daily mail (folder-import.processor.ts tags every row it creates with fromAddress "folder-import") — "live" is everything else, i.e. real inbox mail. */
export type MailSourceFilter = "folder-import" | "live";

export interface MailLogFilters {
  rtaType?: string;
  status?: string;
  from?: string;
  to?: string;
  distributorId?: string;
  arnProfileId?: string;
  source?: MailSourceFilter;
}

export interface MailLogSummaryRange {
  from?: string;
  to?: string;
  distributorId?: string;
  arnProfileId?: string;
  source?: MailSourceFilter;
}

function sourceWhereClause(source?: MailSourceFilter): Record<string, unknown> {
  if (source === "folder-import") return { fromAddress: "folder-import" };
  if (source === "live") return { fromAddress: { not: "folder-import" } };
  return {};
}

@Injectable()
export class MailService {
  /**
   * Enqueues an immediate mail-ingestion poll, same job the scheduled cron
   * runs — the admin "check now" / "sync all" button. There's only one
   * shared inbox for every onboarded MFD (see [[mfd_ingestion_engine]]), so
   * there's no such thing as a selective "sync just this MFD" poll — a
   * per-distributor "sync" button in the UI triggers this same call and
   * then the admin views that distributor's slice of the results
   * afterwards via listLogs(distributorId).
   */
  async triggerCheckNow() {
    const job = await mailIngestionQueue().add("mail-poll-manual", {});
    await logAdminAction("CHECK_NOW", undefined, { jobId: job.id });
    return { jobId: job.id, triggeredAt: new Date().toISOString() };
  }

  /** Removes the scheduled twice-daily poll — manual "check now" still works, only the automatic cron stops. */
  async pauseSchedule() {
    const removed = await mailIngestionQueue().removeJobScheduler(MAIL_POLL_SCHEDULER_ID);
    await logAdminAction("PAUSE_SCHEDULE");
    return { paused: true, hadActiveSchedule: removed };
  }

  async resumeSchedule() {
    const pattern = process.env.MAIL_POLL_CRON ?? "0 8,14,20 * * *";
    await mailIngestionQueue().upsertJobScheduler(MAIL_POLL_SCHEDULER_ID, { pattern }, { name: "mail-poll" });
    await logAdminAction("RESUME_SCHEDULE", undefined, { pattern });
    return { paused: false, pattern };
  }

  /**
   * Kicks off a one-time "since inception" bulk import: the actual folder
   * walk, zip decryption, and per-file schema-mapping enqueue all happen in
   * the worker process (see folder-import.processor.ts) — this just
   * validates the path exists on the server (fail fast with a clear error
   * rather than a job that immediately fails after the admin's already
   * navigated away) and enqueues the job. Progress shows up as regular
   * MailIngestionLog rows in the existing admin Mail Sync log, filterable
   * by distributor/ARN/date range like any other entry.
   */
  async triggerFolderImport(dto: FolderImportDto) {
    let stats;
    try {
      stats = await stat(dto.folderPath);
    } catch {
      throw new BadRequestException(`Folder not found on server: ${dto.folderPath}`);
    }
    if (!stats.isDirectory()) {
      throw new BadRequestException(`Not a folder: ${dto.folderPath}`);
    }

    const job = await folderImportQueue().add("folder-import", {
      distributorId: dto.distributorId,
      arnProfileId: dto.arnProfileId,
      folderPath: dto.folderPath,
      camsZipPassword: dto.camsZipPassword,
      kfintechZipPassword: dto.kfintechZipPassword,
    });
    await logAdminAction("TRIGGER_FOLDER_IMPORT", dto.distributorId, { folderPath: dto.folderPath, jobId: job.id });
    return { jobId: job.id, triggeredAt: new Date().toISOString() };
  }

  /**
   * Dry-run for Since-Inception Import — walks and classifies the folder
   * exactly like the real import (shares walkFolder/inferRtaType/
   * RECOGNIZED_EXTENSIONS from @mfd/shared with folder-import.processor.ts,
   * so this can never silently drift from what a real run would actually
   * do), but never decrypts, parses, or queues anything. Lets an admin
   * catch a missing "cams"/"kfintech" folder name or a stray unrecognized
   * file BEFORE committing to a real run, rather than discovering it after
   * the fact in the Mail Sync log. Read-only and safe to call repeatedly
   * while still assembling a folder.
   */
  async previewFolderImport(dto: FolderImportPreviewDto) {
    let stats;
    try {
      stats = await stat(dto.folderPath);
    } catch {
      throw new BadRequestException(`Folder not found on server: ${dto.folderPath}`);
    }
    if (!stats.isDirectory()) {
      throw new BadRequestException(`Not a folder: ${dto.folderPath}`);
    }

    const files = await walkFolder(dto.folderPath, dto.folderPath);

    const cams: string[] = [];
    const kfintech: string[] = [];
    const unrecognized: Array<{ path: string; reason: string }> = [];

    for (const file of files) {
      const ext = extname(file.absolutePath).toLowerCase();
      if (!RECOGNIZED_EXTENSIONS.has(ext)) {
        unrecognized.push({ path: file.relativePath, reason: `Unrecognized file extension "${ext || "(none)"}" — expected .zip, .dbf, .csv, or .txt` });
        continue;
      }
      const rtaType = inferRtaType(file.relativePath, ext);
      if (!rtaType) {
        unrecognized.push({
          path: file.relativePath,
          reason: ext === ".zip"
            ? `Can't tell CAMS from KFintech — .zip files need a "cams" or "kfintech" folder name somewhere in the path`
            : `Can't tell CAMS from KFintech from the path or extension`,
        });
        continue;
      }
      (rtaType === "CAMS" ? cams : kfintech).push(file.relativePath);
    }

    return {
      folderPath: dto.folderPath,
      totalFiles: files.length,
      camsCount: cams.length,
      kfintechCount: kfintech.length,
      unrecognizedCount: unrecognized.length,
      // Capped — a preview is for a sanity check, not a full file browser;
      // the counts above are always exact even when the lists are truncated.
      camsFiles: cams.slice(0, PREVIEW_FILE_LIST_LIMIT),
      kfintechFiles: kfintech.slice(0, PREVIEW_FILE_LIST_LIMIT),
      unrecognizedFiles: unrecognized.slice(0, PREVIEW_FILE_LIST_LIMIT),
    };
  }

  async getScheduleStatus() {
    // BullMQ's getJobSchedulers() returns the scheduler id under `key`, not
    // `id` — confirmed live against a real registered scheduler; using `id`
    // silently never matched, so this always reported "paused" even with
    // the scheduler active in Redis.
    const schedulers = await mailIngestionQueue().getJobSchedulers();
    const active = schedulers.find((s) => s.key === MAIL_POLL_SCHEDULER_ID);
    return { paused: !active, pattern: active?.pattern ?? null };
  }

  /**
   * Super Admin's platform-wide "last sync per RTA" glance — same idea as
   * NAV Sync's "Last Sync" card, but split by RTA type since CAMS and
   * KFintech are independent mailboxes that can genuinely fall out of sync
   * with each other. Not distributor-scoped (this is the operator's own
   * shared inbox, seen across every onboarded MFD at once).
   */
  async getLastSyncByRta() {
    const rtaTypes = await prisma.mailIngestionLog.findMany({ distinct: ["rtaType"], select: { rtaType: true } });
    return Promise.all(
      rtaTypes.map(async ({ rtaType }) => {
        const [lastAttempt, lastCompleted] = await Promise.all([
          prisma.mailIngestionLog.findFirst({
            where: { rtaType },
            orderBy: { createdAt: "desc" },
            select: { status: true, createdAt: true },
          }),
          prisma.mailIngestionLog.findFirst({
            where: { rtaType, status: "COMPLETED" },
            orderBy: { updatedAt: "desc" },
            select: { updatedAt: true },
          }),
        ]);
        return {
          rtaType,
          lastAttemptAt: lastAttempt?.createdAt ?? null,
          lastAttemptStatus: lastAttempt?.status ?? null,
          lastCompletedAt: lastCompleted?.updatedAt ?? null,
        };
      }),
    ).then((rows) => rows.sort((a, b) => a.rtaType.localeCompare(b.rtaType)));
  }

  listLogs(filters: MailLogFilters) {
    const where: Record<string, unknown> = { ...sourceWhereClause(filters.source) };
    if (filters.rtaType) where.rtaType = filters.rtaType;
    if (filters.status) where.status = filters.status;
    if (filters.distributorId) where.distributorId = filters.distributorId;
    if (filters.arnProfileId) where.arnProfileId = filters.arnProfileId;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
        ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
      };
    }
    // messageId isn't select-limited (findMany with `include` returns all
    // scalar fields by default) — it's a plain column on MailIngestionLog,
    // present for the admin's manual Gmail lookup on a failed row.
    return prisma.mailIngestionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        distributor: { select: { name: true } },
        arnProfile: { select: { arnNumber: true, arnHolderName: true } },
      },
    });
  }

  /**
   * Per-day, per-RTA, per-ARN counts (seen/completed/failed/rows) for the
   * admin audit dashboard — grouped by ARN, not just MFD, so a distributor
   * with a parent + child ARN can tell which one's data is actually
   * missing rather than only seeing a combined MFD-level total.
   */
  async summarize(range: MailLogSummaryRange) {
    const where: Record<string, unknown> = { ...sourceWhereClause(range.source) };
    if (range.distributorId) where.distributorId = range.distributorId;
    if (range.arnProfileId) where.arnProfileId = range.arnProfileId;
    if (range.from || range.to) {
      where.createdAt = {
        ...(range.from ? { gte: new Date(`${range.from}T00:00:00.000Z`) } : {}),
        ...(range.to ? { lte: new Date(`${range.to}T23:59:59.999Z`) } : {}),
      };
    }
    const logs = await prisma.mailIngestionLog.findMany({
      where,
      select: {
        rtaType: true,
        status: true,
        createdAt: true,
        rowsInserted: true,
        errorMessage: true,
        arnProfileId: true,
        arnProfile: { select: { arnNumber: true } },
      },
    });

    const buckets = new Map<
      string,
      {
        date: string;
        rtaType: string;
        arnProfileId: string | null;
        arnNumber: string | null;
        seen: number;
        completed: number;
        failed: number;
        rowsInserted: number;
        failureReasons: Record<string, number>;
      }
    >();
    for (const log of logs) {
      const date = log.createdAt.toISOString().slice(0, 10);
      const key = `${date}|${log.rtaType}|${log.arnProfileId ?? "unattributed"}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          date,
          rtaType: log.rtaType,
          arnProfileId: log.arnProfileId,
          arnNumber: log.arnProfile?.arnNumber ?? null,
          seen: 0,
          completed: 0,
          failed: 0,
          rowsInserted: 0,
          failureReasons: {},
        };
        buckets.set(key, bucket);
      }
      bucket.seen++;
      if (log.status === "COMPLETED") {
        bucket.completed++;
        bucket.rowsInserted += log.rowsInserted ?? 0;
      } else if (FAILED_STATUSES.has(log.status)) {
        bucket.failed++;
        const reason = log.errorMessage ?? log.status;
        bucket.failureReasons[reason] = (bucket.failureReasons[reason] ?? 0) + 1;
      }
    }

    return Array.from(buckets.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  /**
   * Per-RTA, per-report-type counts (seen/completed/failed/rows), for the
   * "expand RTA -> report types" data explorer — same shape idea as
   * summarize() but grouped by reportCode instead of by day, since the
   * explorer's own date-range filter already scopes the time window.
   */
  async getReportTypesSummary(filters: MailLogSummaryRange & { rtaType?: string }) {
    const where: Record<string, unknown> = { ...sourceWhereClause(filters.source) };
    if (filters.rtaType) where.rtaType = filters.rtaType;
    if (filters.distributorId) where.distributorId = filters.distributorId;
    if (filters.arnProfileId) where.arnProfileId = filters.arnProfileId;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
        ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
      };
    }
    const logs = await prisma.mailIngestionLog.findMany({
      where,
      select: { rtaType: true, reportCode: true, status: true, rowsInserted: true },
    });

    const buckets = new Map<
      string,
      { rtaType: string; reportCode: string | null; seen: number; completed: number; failed: number; rowsInserted: number }
    >();
    for (const log of logs) {
      const key = `${log.rtaType}|${log.reportCode ?? "unresolved"}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { rtaType: log.rtaType, reportCode: log.reportCode, seen: 0, completed: 0, failed: 0, rowsInserted: 0 };
        buckets.set(key, bucket);
      }
      bucket.seen++;
      if (log.status === "COMPLETED") {
        bucket.completed++;
        bucket.rowsInserted += log.rowsInserted ?? 0;
      } else if (FAILED_STATUSES.has(log.status)) {
        bucket.failed++;
      }
    }
    return Array.from(buckets.values()).sort((a, b) => a.rtaType.localeCompare(b.rtaType) || b.completed - a.completed);
  }

  /**
   * The actual DATA a set of COMPLETED mails put into the CRM — not just
   * file metadata (which listLogs/summarize already cover), but the real
   * Transaction rows and Folio balance updates those mails caused, via the
   * mailLogId/lastBalanceMailLogId traceability added specifically for
   * this ("RTA source tag" work). Two entry points share this: the Daily
   * Summary's per-bucket "View" button (date = one exact day) and the
   * RTA -> report-type explorer's own date-range filter (from/to, no
   * single date). A mail log with zero matching Transaction/Folio rows is
   * normal, not a bug — e.g. a re-processed file that deduped to nothing
   * new, or a report type (like WBR9 investor-master) that updates client
   * demographic fields rather than transactions/balances at all.
   */
  async getInsertedData(filters: {
    rtaType?: string;
    reportCode?: string;
    date?: string;
    from?: string;
    to?: string;
    distributorId?: string;
    arnProfileId?: string;
    source?: MailSourceFilter;
  }) {
    const where: Record<string, unknown> = { status: "COMPLETED", ...sourceWhereClause(filters.source) };
    if (filters.rtaType) where.rtaType = filters.rtaType;
    if (filters.reportCode) where.reportCode = filters.reportCode;
    if (filters.distributorId) where.distributorId = filters.distributorId;
    if (filters.arnProfileId) where.arnProfileId = filters.arnProfileId;
    if (filters.date) {
      where.createdAt = { gte: new Date(`${filters.date}T00:00:00.000Z`), lte: new Date(`${filters.date}T23:59:59.999Z`) };
    } else if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
        ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
      };
    }

    const mailLogs = await prisma.mailIngestionLog.findMany({ where, select: { id: true } });
    const mailLogIds = mailLogs.map((m) => m.id);
    if (mailLogIds.length === 0) {
      return { transactions: [], folioBalances: [], sipRegistrations: [], brokerageWithheld: [], systematicExpiry: [], rawRecords: [] };
    }

    const [transactions, folios, sipRegistrations, brokerageWithheldRows, systematicExpiryRows, rawLedgerRows] = await Promise.all([
      prisma.transaction.findMany({
        where: { mailLogId: { in: mailLogIds } },
        orderBy: { transactionDate: "desc" },
        take: 5000,
        select: {
          id: true,
          transactionType: true,
          transactionDescription: true,
          transactionDate: true,
          amount: true,
          units: true,
          folio: {
            select: {
              folioNumber: true,
              amcCode: true,
              schemeCode: true,
              schemeName: true,
              client: { select: { name: true, panNumber: true } },
            },
          },
        },
      }),
      prisma.folio.findMany({
        where: { lastBalanceMailLogId: { in: mailLogIds } },
        take: 5000,
        select: {
          id: true,
          folioNumber: true,
          amcCode: true,
          schemeCode: true,
          schemeName: true,
          balanceUnits: true,
          valuationAmount: true,
          balanceAsOfDate: true,
          client: { select: { name: true, panNumber: true } },
        },
      }),
      prisma.sipRegistration.findMany({
        where: { mailLogId: { in: mailLogIds } },
        orderBy: { registrationDate: "desc" },
        take: 5000,
        select: {
          id: true,
          schemeCode: true,
          sipAmount: true,
          frequency: true,
          startDate: true,
          endDate: true,
          registrationDate: true,
          ceaseDate: true,
          isActive: true,
          folio: {
            select: { folioNumber: true, amcCode: true, schemeName: true, client: { select: { name: true, panNumber: true } } },
          },
        },
      }),
      prisma.brokerageWithheld.findMany({
        where: { mailLogId: { in: mailLogIds } },
        orderBy: { reportDate: "desc" },
        take: 5000,
        select: {
          id: true,
          folioNumber: true,
          investorName: true,
          investorPan: true,
          amcCode: true,
          schemeCode: true,
          kycStatusAtWithholding: true,
          trailFeeWithheld: true,
          transactionIncentiveWithheld: true,
          upfrontWithheld: true,
          reportDate: true,
        },
      }),
      prisma.rtaSystematicExpiry.findMany({
        where: { mailLogId: { in: mailLogIds } },
        orderBy: { expiryDate: "desc" },
        take: 5000,
        select: {
          id: true,
          folioNumber: true,
          investorName: true,
          schemeName: true,
          toSchemeName: true,
          transactionType: true,
          amount: true,
          units: true,
          expiryDate: true,
        },
      }),
      // The universal fallback: written unconditionally for every record of
      // every report type (see RtaInsightLedger.mailLogId's doc comment) —
      // unlike the specific queries above, this isn't gated by "only if the
      // report data was actually newer/applied", so it's the one view
      // that's reliably populated for report types with no dedicated CRM
      // table (Investor Master, KYC Status) and for cases where the
      // specific table's own update got skipped as stale.
      prisma.rtaInsightLedger.findMany({
        where: { mailLogId: { in: mailLogIds } },
        orderBy: { uploadedAt: "desc" },
        take: 5000,
        select: {
          id: true,
          rtaType: true,
          reportCode: true,
          investorPan: true,
          folioNumber: true,
          amcCode: true,
          schemeCode: true,
          transactionDate: true,
          rawStructuredPayload: true,
        },
      }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        id: t.id,
        clientName: t.folio.client.name,
        panNumber: t.folio.client.panNumber,
        folioNumber: t.folio.folioNumber,
        amcCode: t.folio.amcCode,
        schemeName: t.folio.schemeName,
        transactionType: t.transactionType,
        transactionDescription: t.transactionDescription,
        transactionDate: t.transactionDate,
        amount: t.amount?.toString() ?? null,
        units: t.units?.toString() ?? null,
      })),
      folioBalances: folios.map((f) => ({
        id: f.id,
        clientName: f.client.name,
        panNumber: f.client.panNumber,
        folioNumber: f.folioNumber,
        amcCode: f.amcCode,
        schemeName: f.schemeName,
        balanceUnits: f.balanceUnits?.toString() ?? null,
        valuationAmount: f.valuationAmount?.toString() ?? null,
        balanceAsOfDate: f.balanceAsOfDate,
      })),
      sipRegistrations: sipRegistrations.map((s) => ({
        id: s.id,
        clientName: s.folio.client.name,
        panNumber: s.folio.client.panNumber,
        folioNumber: s.folio.folioNumber,
        amcCode: s.folio.amcCode,
        schemeName: s.folio.schemeName ?? s.schemeCode,
        sipAmount: s.sipAmount?.toString() ?? null,
        frequency: s.frequency,
        startDate: s.startDate,
        endDate: s.endDate,
        registrationDate: s.registrationDate,
        ceaseDate: s.ceaseDate,
        isActive: s.isActive,
      })),
      brokerageWithheld: brokerageWithheldRows.map((b) => ({
        id: b.id,
        investorName: b.investorName,
        investorPan: b.investorPan,
        folioNumber: b.folioNumber,
        amcCode: b.amcCode,
        schemeCode: b.schemeCode,
        kycStatusAtWithholding: b.kycStatusAtWithholding,
        trailFeeWithheld: b.trailFeeWithheld?.toString() ?? null,
        transactionIncentiveWithheld: b.transactionIncentiveWithheld?.toString() ?? null,
        upfrontWithheld: b.upfrontWithheld?.toString() ?? null,
        reportDate: b.reportDate,
      })),
      systematicExpiry: systematicExpiryRows.map((e) => ({
        id: e.id,
        investorName: e.investorName,
        folioNumber: e.folioNumber,
        schemeName: e.schemeName,
        toSchemeName: e.toSchemeName,
        transactionType: e.transactionType,
        amount: e.amount?.toString() ?? null,
        units: e.units?.toString() ?? null,
        expiryDate: e.expiryDate,
      })),
      rawRecords: rawLedgerRows.map((r) => ({
        id: r.id,
        rtaType: r.rtaType,
        reportCode: r.reportCode,
        investorPan: r.investorPan,
        folioNumber: r.folioNumber,
        amcCode: r.amcCode,
        schemeCode: r.schemeCode,
        transactionDate: r.transactionDate,
        rawStructuredPayload: r.rawStructuredPayload,
      })),
    };
  }
}
