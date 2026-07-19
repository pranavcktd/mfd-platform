import { config } from "dotenv";
import { resolve } from "node:path";
// Must run before any processor import — schema-mapping.processor.ts pulls
// in @mfd/db, which constructs PrismaClient at module-load time and needs
// DATABASE_URL already in process.env. Root .env is 3 levels up from
// apps/workers/src.
config({ path: resolve(__dirname, "../../../.env") });

import { Worker } from "bullmq";
import { createRedisConnection } from "./redis-connection";
import { QueueNames } from "./queues/queue-names";
import { mailIngestionQueue } from "./queues/queue-producers";
import { processMailIngestion } from "./processors/mail-ingestion.processor";
import { processArchiveDecryption } from "./processors/archive-decryption.processor";
import { processSchemaMapping } from "./processors/schema-mapping.processor";
import { processAnalyticsCalc } from "./processors/analytics-calc.processor";

const connection = createRedisConnection();

const workers = [
  new Worker(QueueNames.MAIL_INGESTION, processMailIngestion, { connection }),
  new Worker(QueueNames.ARCHIVE_DECRYPTION, processArchiveDecryption, { connection }),
  new Worker(QueueNames.SCHEMA_MAPPING, processSchemaMapping, { connection }),
  new Worker(QueueNames.ANALYTICS_CALC, processAnalyticsCalc, { connection }),
];

for (const worker of workers) {
  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[${worker.name}] job ${job?.id} failed:`, err.message);
  });
}

// Twice-daily mail poll (morning + evening, default 8am/6pm) — configurable
// via env since "morning and evening" is a business preference, not a
// technical constant. addJobScheduler is idempotent by schedulerId, so
// restarting the worker process doesn't create duplicate schedules.
const MAIL_POLL_CRON = process.env.MAIL_POLL_CRON ?? "0 8,18 * * *";
mailIngestionQueue().upsertJobScheduler("mail-poll-schedule", { pattern: MAIL_POLL_CRON }, { name: "mail-poll" }).catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[workers] failed to register mail poll schedule:", err);
});

// eslint-disable-next-line no-console
console.log(`[workers] started: ${workers.map((w) => w.name).join(", ")}, mail poll cron: ${MAIL_POLL_CRON}`);

process.on("SIGTERM", async () => {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
});
