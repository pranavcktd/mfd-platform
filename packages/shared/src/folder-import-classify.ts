import { readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

export interface WalkedFile {
  absolutePath: string;
  relativePath: string;
}

export async function walkFolder(dir: string, root: string): Promise<WalkedFile[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: WalkedFile[] = [];
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFolder(absolutePath, root)));
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath: relative(root, absolutePath) });
    }
  }
  return files;
}

/**
 * Infers CAMS vs KFintech from the file's own path segments (matches the
 * real folder convention: a "cams"/"kfintech" segment anywhere in the
 * path — nesting inside it is otherwise free), falling back to the file
 * extension per NOTES.txt ("cams data in .dbf format, kfintech data in
 * .csv") when the path gives no hint. Extracted to packages/shared so both
 * the real folder-import processor (apps/workers) and the dry-run preview
 * (apps/api) share exactly one classification rule — a preview that could
 * silently drift from what the real import actually does would defeat the
 * whole point of previewing.
 */
export function inferRtaType(relativePath: string, ext: string): "CAMS" | "KFINTECH" | undefined {
  const segments = relativePath.toLowerCase().split(sep);
  if (segments.some((s) => s.includes("kfintech") || s.includes("karvy"))) return "KFINTECH";
  if (segments.some((s) => s.includes("cams"))) return "CAMS";
  if (ext === ".dbf") return "CAMS";
  if (ext === ".csv") return "KFINTECH";
  return undefined;
}

export const RECOGNIZED_EXTENSIONS = new Set([".zip", ".dbf", ".csv", ".txt"]);

export { extname };
