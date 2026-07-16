import { Job } from "bullmq";

export interface MailIngestionJobData {
  mfdId: string;
  rawMessage: string;
}

/**
 * Phase 1 / Step 2.2: parse the forwarded RTA notification email, extract
 * the CAMS/KFintech secure download link via regex, and hand off to the
 * archive-decryption queue. Not yet implemented — mailparser + link-router
 * land here.
 */
export async function processMailIngestion(job: Job<MailIngestionJobData>) {
  const { mfdId } = job.data;
  throw new Error(`processMailIngestion not implemented (mfdId=${mfdId})`);
}
