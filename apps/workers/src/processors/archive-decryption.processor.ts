import { Job } from "bullmq";

export interface ArchiveDecryptionJobData {
  mfdId: string;
  downloadUrl: string;
  rtaType: "CAMS" | "KFINTECH";
}

/**
 * Phase 1 / Step 2.3: stream the RTA zip into memory (never to disk),
 * fetch the tenant's archive password from the encrypted credential cache,
 * and extract the contained CSV/TXT into memory for the schema-mapping
 * queue. Not yet implemented.
 */
export async function processArchiveDecryption(job: Job<ArchiveDecryptionJobData>) {
  const { mfdId, rtaType } = job.data;
  throw new Error(`processArchiveDecryption not implemented (mfdId=${mfdId}, rtaType=${rtaType})`);
}
