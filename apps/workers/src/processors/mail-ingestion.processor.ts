import { Job } from "bullmq";

export interface MailIngestionJobData {
  distributorId: string;
  rawMessage: string;
}

/**
 * Phase 1 / Step 2.2: parse the forwarded RTA notification email, extract
 * the CAMS/KFintech secure download link via regex, and hand off to the
 * archive-decryption queue. Not yet implemented — mailparser + link-router
 * land here.
 */
export async function processMailIngestion(job: Job<MailIngestionJobData>) {
  const { distributorId } = job.data;
  throw new Error(`processMailIngestion not implemented (distributorId=${distributorId})`);
}
