import { BadRequestException, Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { stat } from "node:fs/promises";
import { prisma } from "@mfd/db";
import { QueueNames } from "@mfd/shared";
import { createRedisConnection } from "./redis-connection";
import { logAdminAction } from "../admin/audit-log";
import { FolderImportDto } from "./dto/folder-import.dto";

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

export interface MailLogFilters {
  rtaType?: string;
  status?: string;
  from?: string;
  to?: string;
  distributorId?: string;
  arnProfileId?: string;
}

export interface MailLogSummaryRange {
  from?: string;
  to?: string;
  distributorId?: string;
  arnProfileId?: string;
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

  async getScheduleStatus() {
    // BullMQ's getJobSchedulers() returns the scheduler id under `key`, not
    // `id` — confirmed live against a real registered scheduler; using `id`
    // silently never matched, so this always reported "paused" even with
    // the scheduler active in Redis.
    const schedulers = await mailIngestionQueue().getJobSchedulers();
    const active = schedulers.find((s) => s.key === MAIL_POLL_SCHEDULER_ID);
    return { paused: !active, pattern: active?.pattern ?? null };
  }

  listLogs(filters: MailLogFilters) {
    const where: Record<string, unknown> = {};
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
    const where: Record<string, unknown> = {};
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
}
