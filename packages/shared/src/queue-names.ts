export const QueueNames = {
  MAIL_INGESTION: "mail-ingestion",
  ARCHIVE_DECRYPTION: "archive-decryption",
  SCHEMA_MAPPING: "schema-mapping",
  ANALYTICS_CALC: "analytics-calc",
  FOLDER_IMPORT: "folder-import",
  SYNC_HEALTH_CHECK: "sync-health-check",
  NAV_SYNC: "nav-sync",
  NAV_HISTORY_BACKFILL: "nav-history-backfill",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];
