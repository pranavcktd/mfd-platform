import { Job } from "bullmq";

export interface SchemaMappingJobData {
  distributorId: string;
  rtaType: "CAMS" | "KFINTECH";
  sourceFormat: "DBF" | "CSV" | "TXT";
  fileContents: Buffer;
}

/**
 * Phase 1: for DBF, read via a dedicated DBF reader; for CSV/TXT, sniff the
 * delimiter/header. Either way, look up a cached ReportSchemaDefinition by
 * layout fingerprint, or fall back to the LLM schema broker for an
 * unrecognized layout. Upserts rows into rta_insight_ledger keyed by
 * idempotencyHash. Not yet implemented.
 */
export async function processSchemaMapping(job: Job<SchemaMappingJobData>) {
  const { distributorId, rtaType, sourceFormat } = job.data;
  throw new Error(
    `processSchemaMapping not implemented (distributorId=${distributorId}, rtaType=${rtaType}, sourceFormat=${sourceFormat})`,
  );
}
