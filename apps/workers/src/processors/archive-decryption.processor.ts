import { Job } from "bullmq";

export interface ArchiveDecryptionJobData {
  downloadUrl: string;
  rtaType: "CAMS" | "KFINTECH";
  /** Header-match candidate from mail-ingestion, if any — passed through to schema-mapping as a cross-check, not trusted alone. */
  expectedDistributorId?: string;
}

/**
 * Phase 1 / Step 2.3: stream the RTA zip into memory (never to disk),
 * decrypt it, and extract the contained file (CAMS daily: .dbf, KFintech
 * daily: .csv, either RTA's inception backfill: .txt) into memory for the
 * schema-mapping queue. Not yet implemented — blocked on the same Gmail
 * access decision as mail-ingestion.
 *
 * Zip password strategy differs by RTA (confirmed real values, not stored
 * here — pull from CREDENTIAL_ENCRYPTION_KEY-protected sources at runtime):
 *  - CAMS: a single platform-wide constant password, same for every
 *    tenant. Candidate: an env var (e.g. CAMS_ZIP_PASSWORD), not the
 *    per-ArnProfile credential vault.
 *  - KFintech: the zip password IS the tenant's own KFintech/Karvy DSS
 *    login password, already stored in ExternalCredential (provider
 *    KFINTECH) per ArnProfile — no separate zip-password field needed.
 *    If expectedDistributorId is set (from a mail-header match upstream),
 *    look up that ArnProfile's stored password directly. If not, this
 *    stage doesn't yet know the tenant — try decrypting with every
 *    onboarded ArnProfile's stored KFintech password until one succeeds;
 *    whichever works is a candidate distributorId to pass downstream as
 *    expectedDistributorId, for schema-mapping to cross-check against the
 *    ARN code embedded in the parsed data (see tenant-resolution.ts).
 */
export async function processArchiveDecryption(job: Job<ArchiveDecryptionJobData>) {
  const { rtaType, expectedDistributorId } = job.data;
  throw new Error(
    `processArchiveDecryption not implemented (rtaType=${rtaType}, expectedDistributorId=${expectedDistributorId ?? "none"})`,
  );
}
