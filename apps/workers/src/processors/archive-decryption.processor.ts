import { Job } from "bullmq";
import AdmZip from "adm-zip";
import { listDecryptedCredentials } from "../credential-lookup";
import { schemaMappingQueue } from "../queues/queue-producers";

export interface ArchiveDecryptionJobData {
  downloadUrl: string;
  rtaType: "CAMS" | "KFINTECH";
  /** Header-match candidate from mail-ingestion, if any — narrows which stored credential to try first/only, and is cross-checked against the ARN embedded in the parsed data downstream. */
  expectedDistributorId?: string;
}

interface ExtractedFile {
  fileName: string;
  contents: Buffer;
}

function detectSourceFormat(fileName: string): "DBF" | "CSV" | "TXT" {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "dbf") return "DBF";
  if (ext === "csv") return "CSV";
  if (ext === "txt") return "TXT";
  throw new Error(`Unrecognized file extension in archive entry: ${fileName}`);
}

function extractFirstEntry(zipBuffer: Buffer, password: string): ExtractedFile {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (entries.length === 0) {
    throw new Error("Archive contains no files");
  }
  const entry = entries[0];
  const contents = zip.readFile(entry, password);
  if (!contents) {
    throw new Error("Wrong password or corrupted archive");
  }
  return { fileName: entry.entryName, contents };
}

async function downloadZip(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MFDPlatformIngestion/1.0)" },
  });
  if (!response.ok) {
    throw new Error(`Failed to download archive: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export interface DecryptedArchive {
  fileContents: Buffer;
  sourceFormat: "DBF" | "CSV" | "TXT";
  /** Which stored credential's zip password worked — a candidate tenant match, not yet the final word (schema-mapping cross-checks against the ARN embedded in the data). */
  candidateDistributorId?: string;
}

/**
 * Both CAMS and KFintech zip passwords are modeled as per-ArnProfile stored
 * credentials (ExternalCredential.payload.zipPassword) — even though CAMS's
 * is currently the same universal value for every onboarded MFD, it's
 * captured per-tenant at onboarding rather than hardcoded, so it can vary
 * later without a code change. Tries stored credentials in turn (narrowed
 * to expectedDistributorId if given) until one successfully decrypts;
 * whichever works identifies a candidate tenant.
 */
export async function decryptArchive(
  zipBuffer: Buffer,
  rtaType: "CAMS" | "KFINTECH",
  expectedDistributorId?: string,
): Promise<DecryptedArchive> {
  const candidates = await listDecryptedCredentials(rtaType, expectedDistributorId);

  for (const candidate of candidates) {
    const zipPassword = candidate.payload.zipPassword;
    if (!zipPassword) {
      continue;
    }
    try {
      const { fileName, contents } = extractFirstEntry(zipBuffer, zipPassword);
      return {
        fileContents: contents,
        sourceFormat: detectSourceFormat(fileName),
        candidateDistributorId: candidate.distributorId,
      };
    } catch {
      continue; // wrong password for this candidate — try the next
    }
  }

  throw new Error(
    `Could not decrypt ${rtaType} archive with any onboarded distributor's stored zip password` +
      (expectedDistributorId ? ` (narrowed to distributorId=${expectedDistributorId})` : ""),
  );
}

/**
 * Phase 1 / Step 2.3: download the RTA zip, decrypt it, and hand the
 * extracted file off to schema-mapping. Streams into memory only — the
 * decrypted content is never written to disk.
 *
 * NOTE: the download step itself is unverified against a real RTA link —
 * no live CAMS/KFintech session was available to test against. If the RTA
 * portal requires more than a plain HTTPS GET (session cookies, JS
 * challenges), this will need a headless-browser fallback (Playwright),
 * per the original architecture notes.
 */
export async function processArchiveDecryption(job: Job<ArchiveDecryptionJobData>) {
  const { downloadUrl, rtaType, expectedDistributorId } = job.data;

  const zipBuffer = await downloadZip(downloadUrl);
  const decrypted = await decryptArchive(zipBuffer, rtaType, expectedDistributorId);

  await schemaMappingQueue().add("schema-mapping", {
    rtaType,
    sourceFormat: decrypted.sourceFormat,
    // Base64, not the raw Buffer — see the field comment on SchemaMappingJobData.
    fileContents: decrypted.fileContents.toString("base64"),
    expectedDistributorId: expectedDistributorId ?? decrypted.candidateDistributorId,
  });

  return { sourceFormat: decrypted.sourceFormat, bytes: decrypted.fileContents.length };
}
