import { Job } from "bullmq";

export interface MailIngestionJobData {
  rawMessage: string;
}

/**
 * Phase 1 / Step 2.2: parse a forwarded RTA notification email from the
 * shared backend inbox, extract the CAMS/KFintech secure download link via
 * regex, and hand off to the archive-decryption queue. Not yet implemented
 * — blocked on choosing Gmail access (IMAP+App Password vs Gmail API
 * OAuth) and building the actual polling/reading logic; mailparser + a
 * CAMS/KFintech link-router regex land here.
 *
 * No distributorId here by design: the backend inbox is shared across
 * potentially many onboarded MFDs (they each auto-forward from their own
 * RTA-registered mail into one platform inbox), so this stage can't know
 * the tenant yet. Two candidate signals, meant to cross-check each other:
 *  - match the email's original recipient (`To:`/`Delivered-To:` header,
 *    if forwarding preserves it — unconfirmed) against ArnProfile.camsMailId;
 *  - the broker ARN code embedded in the report data itself, resolved by
 *    schema-mapping.processor.ts (see resolveTenantFromRecords in
 *    tenant-resolution.ts) once the file is downloaded and parsed.
 * If a header-based match is found here, pass it downstream as
 * ArchiveDecryptionJobData.expectedDistributorId so schema-mapping can
 * verify the two signals agree rather than trusting either alone.
 */
export async function processMailIngestion(job: Job<MailIngestionJobData>) {
  throw new Error(`processMailIngestion not implemented (rawMessage length=${job.data.rawMessage.length})`);
}
