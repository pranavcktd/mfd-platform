import { Job } from "bullmq";

export interface ArchiveDecryptionJobData {
  distributorId: string;
  downloadUrl: string;
  rtaType: "CAMS" | "KFINTECH";
}

/**
 * Phase 1 / Step 2.3: stream the RTA zip into memory (never to disk),
 * fetch the tenant's archive password from the encrypted credential vault,
 * and extract the contained file (CAMS daily: .dbf, KFintech daily: .csv,
 * either RTA's inception backfill: .txt) into memory for the
 * schema-mapping queue. Not yet implemented.
 */
export async function processArchiveDecryption(job: Job<ArchiveDecryptionJobData>) {
  const { distributorId, rtaType } = job.data;
  throw new Error(
    `processArchiveDecryption not implemented (distributorId=${distributorId}, rtaType=${rtaType})`,
  );
}
