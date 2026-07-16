import { Worker } from "bullmq";
import { createRedisConnection } from "./redis-connection";
import { QueueNames } from "./queues/queue-names";
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

// eslint-disable-next-line no-console
console.log(`[workers] started: ${workers.map((w) => w.name).join(", ")}`);

process.on("SIGTERM", async () => {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
});
