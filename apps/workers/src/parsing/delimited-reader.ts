import { parse } from "csv-parse/sync";

// KFintech's inception ".txt" exports use "~" (tilde) as the field
// delimiter, confirmed against a real MFSD201 sample export.
const CANDIDATE_DELIMITERS = [",", "|", "\t", ";", "~"];

/** Picks whichever candidate delimiter appears most consistently across the first few lines. */
export function sniffDelimiter(text: string): string {
  const sampleLines = text.split(/\r\n|\n/).filter((line) => line.length > 0).slice(0, 5);
  if (sampleLines.length === 0) {
    throw new Error("Cannot sniff delimiter: file has no content");
  }

  let bestDelimiter = CANDIDATE_DELIMITERS[0];
  let bestScore = -1;
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const counts = sampleLines.map((line) => line.split(delimiter).length);
    const allMatchFirst = counts.every((count) => count === counts[0]);
    const score = counts[0] > 1 && allMatchFirst ? counts[0] : -1;
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }

  if (bestScore <= 1) {
    throw new Error("Cannot sniff delimiter: no consistent delimiter found in first lines");
  }
  return bestDelimiter;
}

export function readDelimitedRecords(buffer: Buffer): Record<string, unknown>[] {
  const text = buffer.toString("utf8");
  const delimiter = sniffDelimiter(text);
  return parse(text, {
    delimiter,
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}
