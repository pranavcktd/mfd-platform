import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { prisma } from "@mfd/db";
import { QueueNames } from "@mfd/shared";
import { createRedisConnection } from "../mail/redis-connection";

let connection: ReturnType<typeof createRedisConnection> | undefined;
function getConnection() {
  return (connection ??= createRedisConnection());
}

const queues = new Map<string, Queue>();
function getQueue(name: string): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: getConnection() });
    queues.set(name, q);
  }
  return q;
}

@Injectable()
export class StatusService {
  /**
   * A real operator status view, not just the public /health liveness
   * check — Redis/Postgres connectivity, per-queue job counts, and when
   * mail was last actually checked/ingested. "We are a tech company" means
   * we should notice an outage before an MFD complains about stale data.
   */
  async getStatus() {
    const [redis, postgres, queueDepths, lastLog, lastCompleted] = await Promise.all([
      this.checkRedis(),
      this.checkPostgres(),
      this.getQueueDepths(),
      prisma.mailIngestionLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      prisma.mailIngestionLog.findFirst({
        where: { status: "COMPLETED" },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);

    return {
      redis,
      postgres,
      queueDepths,
      lastMailCheckedAt: lastLog?.createdAt ?? null,
      lastSuccessfulIngestAt: lastCompleted?.updatedAt ?? null,
    };
  }

  /**
   * Per (distributor, RTA) sync health, so a broken credential or a
   * silently-stalled feed surfaces on its own rather than waiting for
   * someone to notice stale data or scroll the Mail Sync log. Two
   * independent signals, either one enough to flag a row:
   * - staleCredential: the most recent attempts in a row all came back
   *   DECRYPT_FAILED — confirmed via real data (2026-07-23, see
   *   [[mfd_ingestion_engine]]) that RTAs rotate zip passwords per
   *   report-scheduling request, so this is a real, recurring failure mode,
   *   not a hypothetical one. Requires >=2 in a row so one transient
   *   hiccup doesn't false-positive.
   * - noRecentSync: no COMPLETED row in the configured window (default 2
   *   days — the poll runs 3x/day, so 2 days silent means ~6 missed cycles,
   *   a real gap not a fluke).
   * Only returns rows that are actually flagged — an empty array means
   * everything's healthy, not "no data yet".
   */
  async getSyncHealth(staleSyncDays = 2) {
    const distributors = await prisma.distributor.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const rtaTypes = ["CAMS", "KFINTECH"] as const;
    const flagged: Array<{
      distributorId: string;
      distributorName: string;
      rtaType: string;
      consecutiveDecryptFailures: number;
      lastSuccessAt: Date | null;
      staleCredential: boolean;
      noRecentSync: boolean;
    }> = [];

    for (const d of distributors) {
      for (const rtaType of rtaTypes) {
        const recentLogs = await prisma.mailIngestionLog.findMany({
          where: { distributorId: d.id, rtaType },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { status: true },
        });
        if (recentLogs.length === 0) {
          continue; // no mail seen yet for this MFD+RTA combo — nothing to flag
        }

        let consecutiveDecryptFailures = 0;
        for (const log of recentLogs) {
          if (log.status !== "DECRYPT_FAILED") break;
          consecutiveDecryptFailures++;
        }

        const lastSuccess = await prisma.mailIngestionLog.findFirst({
          where: { distributorId: d.id, rtaType, status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        const daysSinceSuccess = lastSuccess
          ? (Date.now() - lastSuccess.createdAt.getTime()) / (24 * 60 * 60 * 1000)
          : null;

        const staleCredential = consecutiveDecryptFailures >= 2;
        const noRecentSync = daysSinceSuccess === null || daysSinceSuccess > staleSyncDays;

        if (staleCredential || noRecentSync) {
          flagged.push({
            distributorId: d.id,
            distributorName: d.name,
            rtaType,
            consecutiveDecryptFailures,
            lastSuccessAt: lastSuccess?.createdAt ?? null,
            staleCredential,
            noRecentSync,
          });
        }
      }
    }

    return flagged;
  }

  private async checkRedis(): Promise<{ ok: boolean; error?: string }> {
    try {
      const pong = await getConnection().ping();
      return { ok: pong === "PONG" };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async checkPostgres(): Promise<{ ok: boolean; error?: string }> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getQueueDepths() {
    const names = Object.values(QueueNames);
    const entries = await Promise.all(
      names.map(async (name) => [name, await getQueue(name).getJobCounts()] as const),
    );
    return Object.fromEntries(entries);
  }
}
