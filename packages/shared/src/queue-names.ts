export const QueueNames = {
  MAIL_INGESTION: "mail-ingestion",
  ARCHIVE_DECRYPTION: "archive-decryption",
  SCHEMA_MAPPING: "schema-mapping",
  ANALYTICS_CALC: "analytics-calc",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];
