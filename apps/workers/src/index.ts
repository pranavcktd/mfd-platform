import { config } from "dotenv";
import { resolve } from "node:path";
// Must run before any processor import — schema-mapping.processor.ts pulls
// in @mfd/db, which constructs PrismaClient at module-load time and needs
// DATABASE_URL already in process.env. Root .env is 3 levels up from
// apps/workers/src.
config({ path: resolve(__dirname, "../../../.env") });

import { Worker } from "bullmq";
import { createRedisConnection } from "./redis-connection";
import { QueueNames } from "@mfd/shared";
import { mailIngestionQueue, syncHealthCheckQueue, navSyncQueue } from "./queues/queue-producers";
import { processMailIngestion } from "./processors/mail-ingestion.processor";
import { processArchiveDecryption } from "./processors/archive-decryption.processor";
import { processSchemaMapping } from "./processors/schema-mapping.processor";
import { processAnalyticsCalc } from "./processors/analytics-calc.processor";
import { processFolderImport } from "./processors/folder-import.processor";
import { processSyncHealthCheck } from "./processors/sync-health-check.processor";
import { processNavSync } from "./processors/nav-sync.processor";
import { processNavHistoryBackfill } from "./processors/nav-history-backfill.processor";

const connection = createRedisConnection();

const workers = [
  new Worker(QueueNames.MAIL_INGESTION, processMailIngestion, { connection }),
  new Worker(QueueNames.ARCHIVE_DECRYPTION, processArchiveDecryption, { connection }),
  new Worker(QueueNames.SCHEMA_MAPPING, processSchemaMapping, { connection }),
  new Worker(QueueNames.ANALYTICS_CALC, processAnalyticsCalc, { connection }),
  // Long-running (walks a whole folder, shells out to 7z per zip) — its own
  // worker so a big one-time import can't starve the twice/thrice-daily
  // mail-ingestion poll's concurrency slot.
  new Worker(QueueNames.FOLDER_IMPORT, processFolderImport, { connection, concurrency: 1 }),
  new Worker(QueueNames.SYNC_HEALTH_CHECK, processSyncHealthCheck, { connection }),
  new Worker(QueueNames.NAV_SYNC, processNavSync, { connection }),
  new Worker(QueueNames.NAV_HISTORY_BACKFILL, processNavHistoryBackfill, { connection }),
];

for (const worker of workers) {
  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[${worker.name}] job ${job?.id} failed:`, err.message);
  });
  worker.on("completed", (job) => {
    // eslint-disable-next-line no-console
    console.log(`[${worker.name}] job ${job.id} completed:`, JSON.stringify(job.returnvalue));
  });
}

// Thrice-daily mail poll (morning/afternoon/night, default 8am/2pm/8pm) —
// configurable via env since the exact times are a business preference, not
// a technical constant. upsertJobScheduler is idempotent by schedulerId, so
// restarting the worker process doesn't create duplicate schedules.
const MAIL_POLL_CRON = process.env.MAIL_POLL_CRON ?? "0 8,14,20 * * *";
mailIngestionQueue().upsertJobScheduler("mail-poll-schedule", { pattern: MAIL_POLL_CRON }, { name: "mail-poll" }).catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[workers] failed to register mail poll schedule:", err);
});

// Daily sync-health check — see sync-health-check.processor.ts. Runs once
// a day (default 9am) rather than after every poll, since a single
// DECRYPT_FAILED is expected noise; the check itself requires 2+
// consecutive failures before flagging anything.
const SYNC_HEALTH_CRON = process.env.SYNC_HEALTH_CRON ?? "0 9 * * *";
syncHealthCheckQueue()
  .upsertJobScheduler("sync-health-check-schedule", { pattern: SYNC_HEALTH_CRON }, { name: "sync-health-check" })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[workers] failed to register sync health check schedule:", err);
  });

// Daily AMFI NAV pull — real mutual fund NAVs are published once a day
// (not intraday), typically after market close, so a single evening run
// covers it. Default 9:30pm; override via NAV_SYNC_CRON.
const NAV_SYNC_CRON = process.env.NAV_SYNC_CRON ?? "30 21 * * *";
navSyncQueue().upsertJobScheduler("nav-sync-schedule", { pattern: NAV_SYNC_CRON }, { name: "nav-sync" }).catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[workers] failed to register NAV sync schedule:", err);
});

// eslint-disable-next-line no-console
console.log(`[workers] started: ${workers.map((w) => w.name).join(", ")}, mail poll cron: ${MAIL_POLL_CRON}, nav sync cron: ${NAV_SYNC_CRON}`);

process.on("SIGTERM", async () => {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
});
