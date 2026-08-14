function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  triggerDownload(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }), filename);
}

/**
 * Dynamically imports `xlsx` (SheetJS) only when actually invoked — keeps it
 * out of the main bundle for the vast majority of sessions that never
 * export to Excel. Only ever WRITES a file from our own already-fetched
 * data via `aoa_to_sheet`/`writeFile` — never calls `XLSX.read`/`readFile`
 * on any user-supplied input, since the published `xlsx` package has two
 * known high-severity advisories (prototype pollution, ReDoS) in its
 * parsing code path with no fix currently published; the write-only path
 * used here doesn't exercise either.
 */
export async function downloadXlsx(filename: string, sheetName: string, headers: string[], rows: Array<Array<string | number>>) {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

/** Plain tab-delimited .txt — for admins who want to eyeball/grep the raw export outside a spreadsheet tool. */
export function downloadTxt(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const lines = [headers.join("\t"), ...rows.map((r) => r.map(String).join("\t"))];
  triggerDownload(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8;" }), filename);
}
