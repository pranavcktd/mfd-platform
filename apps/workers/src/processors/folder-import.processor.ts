import { Job } from "bullmq";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { Prisma, prisma } from "@mfd/db";
import { decryptArchive, detectSourceFormat } from "./archive-decryption.processor";
import { schemaMappingQueue } from "../queues/queue-producers";

export interface FolderImportJobData {
  distributorId: string;
  arnProfileId?: string;
  /** Server-local path to walk (e.g. "basic data/data as on 17-07-2026") — same convention as the existing basic-data folder, not a client upload. */
  folderPath: string;
  /**
   * Optional one-off zip passwords for THIS import only — an older
   * since-inception archive can use a different password than what's
   * currently live for fresh mail (RTAs reissue zip passwords per
   * report-scheduling request; confirmed against a real archive, see
   * decryptArchive's passwordOverride doc). When given, used instead of —
   * never written back to — the MFD's stored ExternalCredential.
   */
  camsZipPassword?: string;
  kfintechZipPassword?: string;
}

interface WalkedFile {
  absolutePath: string;
  relativePath: string;
}

async function walk(dir: string, root: string): Promise<WalkedFile[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: WalkedFile[] = [];
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath, root)));
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath: relative(root, absolutePath) });
    }
  }
  return files;
}

/** Infers CAMS vs KFintech from the file's own path segments (matches the real folder convention: top-level "cams"/"kfintech" subfolders), falling back to the file extension per NOTES.txt ("cams data in .dbf format, kfintech data in .csv") when the path gives no hint. */
function inferRtaType(relativePath: string, ext: string): "CAMS" | "KFINTECH" | undefined {
  const segments = relativePath.toLowerCase().split(sep);
  if (segments.some((s) => s.includes("kfintech") || s.includes("karvy"))) return "KFINTECH";
  if (segments.some((s) => s.includes("cams"))) return "CAMS";
  if (ext === ".dbf") return "CAMS";
  if (ext === ".csv") return "KFINTECH";
  return undefined;
}

const RECOGNIZED_EXTENSIONS = new Set([".zip", ".dbf", ".csv", ".txt"]);

/**
 * One-time "since inception" bulk import: walks an admin-specified local
 * folder (the same convention as the existing basic-data/ folder — real
 * CAMS/KFintech zips alongside their already-extracted DBF/CSV siblings),
 * decrypts any zips using that MFD's already-onboarded stored credential
 * (see saveOnboardingCredentials in AdminService), and feeds every
 * recognized file through the exact same schema-mapping queue the regular
 * mail pipeline uses — so historical data lands through one code path, not
 * a separate parser. Each file gets its own MailIngestionLog row (fromAddress
 * "folder-import") so progress/failures show up in the existing admin Mail
 * Sync log, filterable by distributor/ARN/date range like any other log
 * entry. A bad file (unrecognized extension, wrong zip password, unparsable
 * content) is logged and skipped — never aborts the rest of the batch,
 * consistent with the bulk-CSV-onboarding isolated-failure pattern.
 */
export async function processFolderImport(job: Job<FolderImportJobData>) {
  const { distributorId, arnProfileId, folderPath, camsZipPassword, kfintechZipPassword } = job.data;

  let files: WalkedFile[];
  try {
    files = await walk(folderPath, folderPath);
  } catch (err) {
    throw new Error(`Could not read folder "${folderPath}": ${err instanceof Error ? err.message : String(err)}`);
  }

  let enqueued = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const ext = extname(file.absolutePath).toLowerCase();
    if (!RECOGNIZED_EXTENSIONS.has(ext)) {
      skipped++;
      continue;
    }

    const rtaType = inferRtaType(file.relativePath, ext);
    if (!rtaType) {
      failed++;
      await prisma.mailIngestionLog.create({
        data: {
          rtaType: "UNKNOWN",
          fromAddress: "folder-import",
          subject: file.relativePath,
          status: "PARSE_FAILED",
          distributorId,
          arnProfileId,
          errorMessage: "Could not determine RTA type (CAMS vs KFintech) from file path or extension",
        },
      });
      continue;
    }

    const mailLog = await prisma.mailIngestionLog.create({
      data: {
        rtaType,
        fromAddress: "folder-import",
        subject: file.relativePath,
        status: "ENQUEUED",
        distributorId,
        arnProfileId,
      },
    });

    try {
      const raw = await readFile(file.absolutePath);
      let fileContents: Buffer;
      let sourceFormat: "DBF" | "CSV" | "TXT";

      if (ext === ".zip") {
        const passwordOverride = rtaType === "CAMS" ? camsZipPassword : kfintechZipPassword;
        const decrypted = await decryptArchive(raw, rtaType, distributorId, passwordOverride);
        fileContents = decrypted.fileContents;
        sourceFormat = decrypted.sourceFormat;
      } else {
        fileContents = raw;
        sourceFormat = detectSourceFormat(file.absolutePath);
      }

      await schemaMappingQueue().add("schema-mapping", {
        rtaType,
        sourceFormat,
        fileContents: fileContents.toString("base64"),
        expectedDistributorId: distributorId,
        mailLogId: mailLog.id,
      });
      enqueued++;
    } catch (err) {
      failed++;
      await prisma.mailIngestionLog.update({
        where: { id: mailLog.id },
        data: {
          status: ext === ".zip" ? "DECRYPT_FAILED" : "PARSE_FAILED",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  const summary = { filesFound: files.length, enqueued, skipped, failed };
  // Inlined rather than shared with apps/api's audit-log.ts — apps/workers
  // and apps/api are separate TS projects, not set up to import across
  // that boundary; both just write to the same AdminAuditLog table directly.
  await prisma.adminAuditLog.create({
    data: {
      action: "FOLDER_IMPORT",
      distributorId,
      detail: { folderPath, ...summary } as Prisma.InputJsonValue,
    },
  });
  return summary;
}
