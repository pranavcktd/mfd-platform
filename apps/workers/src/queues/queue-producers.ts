import { Queue } from "bullmq";
import { createRedisConnection } from "../redis-connection";
import { QueueNames } from "@mfd/shared";
import type { MailIngestionJobData } from "../processors/mail-ingestion.processor";
import type { ArchiveDecryptionJobData } from "../processors/archive-decryption.processor";
import type { SchemaMappingJobData } from "../processors/schema-mapping.processor";
import type { AnalyticsCalcJobData } from "../processors/analytics-calc.processor";
import type { SyncHealthCheckJobData } from "../processors/sync-health-check.processor";

/**
 * Producer-side Queue handles, separate from the Worker (consumer) side in
 * index.ts, so a processor can enqueue the next pipeline stage's job
 * (mail-ingestion -> archive-decryption -> schema-mapping) without needing
 * a circular import on the Worker instances themselves.
 *
 * Lazily constructed (not at module scope): a Queue opens a Redis
 * connection as a side effect of construction, and pure/testable exports
 * that live in the same file as a job handler (e.g. decryptArchive in
 * archive-decryption.processor.ts) would otherwise drag in a live Redis
 * dependency just from being imported, which broke isolated testing of
 * that logic without Redis running.
 */
let connection: ReturnType<typeof createRedisConnection> | undefined;
function getConnection() {
  if (!connection) {
    connection = createRedisConnection();
  }
  return connection;
}

let _mailIngestionQueue: Queue<MailIngestionJobData> | undefined;
export function mailIngestionQueue(): Queue<MailIngestionJobData> {
  return (_mailIngestionQueue ??= new Queue(QueueNames.MAIL_INGESTION, { connection: getConnection() }));
}

let _archiveDecryptionQueue: Queue<ArchiveDecryptionJobData> | undefined;
export function archiveDecryptionQueue(): Queue<ArchiveDecryptionJobData> {
  return (_archiveDecryptionQueue ??= new Queue(QueueNames.ARCHIVE_DECRYPTION, { connection: getConnection() }));
}

let _schemaMappingQueue: Queue<SchemaMappingJobData> | undefined;
export function schemaMappingQueue(): Queue<SchemaMappingJobData> {
  return (_schemaMappingQueue ??= new Queue(QueueNames.SCHEMA_MAPPING, { connection: getConnection() }));
}

let _analyticsCalcQueue: Queue<AnalyticsCalcJobData> | undefined;
export function analyticsCalcQueue(): Queue<AnalyticsCalcJobData> {
  return (_analyticsCalcQueue ??= new Queue(QueueNames.ANALYTICS_CALC, { connection: getConnection() }));
}

let _syncHealthCheckQueue: Queue<SyncHealthCheckJobData> | undefined;
export function syncHealthCheckQueue(): Queue<SyncHealthCheckJobData> {
  return (_syncHealthCheckQueue ??= new Queue(QueueNames.SYNC_HEALTH_CHECK, { connection: getConnection() }));
}
