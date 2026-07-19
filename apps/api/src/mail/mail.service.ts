import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { prisma } from "@mfd/db";
import { QueueNames } from "@mfd/shared";
import { createRedisConnection } from "./redis-connection";

type MailIngestionJobData = Record<string, never>;

const FAILED_STATUSES = new Set(["DOWNLOAD_FAILED", "DECRYPT_FAILED", "PARSE_FAILED"]);

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

export interface MailLogFilters {
  rtaType?: string;
  status?: string;
  date?: string;
}

export interface MailLogSummaryRange {
  from?: string;
  to?: string;
}

@Injectable()
export class MailService {
  /** Enqueues an immediate mail-ingestion poll, same job the scheduled cron runs — the admin "check now" button. */
  async triggerCheckNow() {
    const job = await mailIngestionQueue().add("mail-poll-manual", {});
    return { jobId: job.id, triggeredAt: new Date().toISOString() };
  }

  listLogs(filters: MailLogFilters) {
    const where: Record<string, unknown> = {};
    if (filters.rtaType) where.rtaType = filters.rtaType;
    if (filters.status) where.status = filters.status;
    if (filters.date) {
      where.createdAt = {
        gte: new Date(`${filters.date}T00:00:00.000Z`),
        lte: new Date(`${filters.date}T23:59:59.999Z`),
      };
    }
    return prisma.mailIngestionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { distributor: { select: { name: true } } },
    });
  }

  /** Per-day, per-RTA counts (seen/completed/failed/rows) for the admin audit dashboard. */
  async summarize(range: MailLogSummaryRange) {
    const where: Record<string, unknown> = {};
    if (range.from || range.to) {
      where.createdAt = {
        ...(range.from ? { gte: new Date(`${range.from}T00:00:00.000Z`) } : {}),
        ...(range.to ? { lte: new Date(`${range.to}T23:59:59.999Z`) } : {}),
      };
    }
    const logs = await prisma.mailIngestionLog.findMany({
      where,
      select: { rtaType: true, status: true, createdAt: true, rowsInserted: true },
    });

    const buckets = new Map<
      string,
      { date: string; rtaType: string; seen: number; completed: number; failed: number; rowsInserted: number }
    >();
    for (const log of logs) {
      const date = log.createdAt.toISOString().slice(0, 10);
      const key = `${date}|${log.rtaType}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { date, rtaType: log.rtaType, seen: 0, completed: 0, failed: 0, rowsInserted: 0 };
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

    return Array.from(buckets.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }
}
