import { Job } from "bullmq";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/**
 * Shells out to 7-Zip rather than a pure-JS zip library — confirmed the
 * hard way against a real CAMS archive: adm-zip cannot decrypt AES-256
 * zips at all (it throws "Wrong Password" even given the objectively
 * correct password on a synthetic AES-256 test archive), and CAMS's real
 * mailback zips use AES-256, not the legacy ZipCrypto method most small JS
 * zip libraries support. 7-Zip handles both correctly. SEVEN_ZIP_PATH env
 * lets this point at a specific binary (e.g. the Windows install path on
 * this dev machine); defaults to "7z" assuming it's on PATH, which is the
 * case after `apt-get install p7zip-full` in the eventual Docker image.
 *
 * Needs a transient temp file (7z is a CLI, not a Buffer-native library) —
 * same trade-off already made in dbf-reader.ts for the same reason; the
 * temp directory is removed in a finally block regardless of outcome.
 */
async function extractFirstEntry(zipBuffer: Buffer, password: string): Promise<ExtractedFile> {
  const sevenZipPath = process.env.SEVEN_ZIP_PATH ?? "7z";
  const dir = await mkdtemp(join(tmpdir(), "mfd-archive-"));
  const zipPath = join(dir, "archive.zip");
  const outDir = join(dir, "out");
  try {
    await writeFile(zipPath, zipBuffer);
    execFileSync(sevenZipPath, ["x", zipPath, `-o${outDir}`, `-p${password}`, "-y"], { stdio: "pipe" });

    const entries = await readdir(outDir, { withFileTypes: true });
    const fileEntry = entries.find((e) => e.isFile());
    if (!fileEntry) {
      throw new Error("Archive contains no files");
    }
    const contents = await readFile(join(outDir, fileEntry.name));
    return { fileName: fileEntry.name, contents };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
      const { fileName, contents } = await extractFirstEntry(zipBuffer, zipPassword);
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
 * extracted file off to schema-mapping. The decrypted content only ever
 * touches disk transiently inside extractFirstEntry's temp dir, which is
 * removed immediately after reading — never left behind, never passed
 * further as a file path.
 *
 * The download step IS verified against real live CAMS links (see
 * mfd_ingestion_engine memory / commit history): a fresh CAMS mailback
 * link downloads correctly with a plain HTTPS GET, no anti-bot blocking
 * observed. KFintech's own domains (mfs.kfintech.com, www.kfintech.com)
 * were unreachable (connection timeout) from the dev environment this was
 * built in — unconfirmed whether that's an environment-specific network
 * restriction or a genuine reachability issue; needs re-testing from
 * wherever this actually deploys.
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
