import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DBFFile } from "dbffile";

/**
 * dbffile only opens files by path, not in-memory buffers, so the decrypted
 * DBF bytes have to touch disk briefly. We isolate that to a per-call temp
 * directory (0700-equivalent via mkdtemp's random suffix) and remove it in
 * a finally block regardless of read success, keeping the "never leave
 * decrypted RTA data on disk" rule intact in spirit even though the DBF
 * library forces a transient file.
 */
export async function readDbfRecords(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const dir = await mkdtemp(join(tmpdir(), "mfd-dbf-"));
  const filePath = join(dir, "report.dbf");
  try {
    await writeFile(filePath, buffer);
    const dbf = await DBFFile.open(filePath, { readMode: "loose" });
    return await dbf.readRecords(dbf.recordCount);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
