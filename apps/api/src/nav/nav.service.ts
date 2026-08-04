import { BadRequestException, Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { prisma } from "@mfd/db";
import { QueueNames } from "@mfd/shared";
import { createRedisConnection } from "../mail/redis-connection";
import { logAdminAction } from "../admin/audit-log";

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

  /** Real per-run audit trail (timestamps, status, row counts) — same shape of visibility MailIngestionLog already gives the RTA mail sync. */
  async listLogs() {
    return prisma.navSyncLog.findMany({ orderBy: { triggeredAt: "desc" }, take: 50 });
  }
}
