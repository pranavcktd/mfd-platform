import { Job } from "bullmq";

export interface SchemaMappingJobData {
  mfdId: string;
  rtaType: "CAMS" | "KFINTECH";
  fileContents: string;
}

/**
 * Phase 2: sniff the delimiter/header, look up a cached ReportSchemaDefinition
 * by layout fingerprint, or fall back to the LLM schema broker for an
 * unrecognized layout. Upserts rows into rta_insight_ledger keyed by
 * idempotencyHash. Not yet implemented.
 */
export async function processSchemaMapping(job: Job<SchemaMappingJobData>) {
  const { mfdId, rtaType } = job.data;
  throw new Error(`processSchemaMapping not implemented (mfdId=${mfdId}, rtaType=${rtaType})`);
}
