export function buildHeaderLookup(rawRecord: Record<string, unknown>): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const key of Object.keys(rawRecord)) {
    lookup.set(key.trim().toLowerCase(), key);
  }
  return lookup;
}

export function parseRtaDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value instanceof Date) {
    return value;
  }
  const text = String(value).trim();
  // DD-MMM-YYYY, e.g. 15-JUL-2026
  const monthNameMatch = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (monthNameMatch) {
    const [, day, mon, year] = monthNameMatch;
    const parsed = new Date(`${day} ${mon} ${year} UTC`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const numericMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numericMatch) {
    const [, day, month, year] = numericMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }
  // YYYYMMDD or YYYY-MM-DD
  const isoMatch = text.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }
  throw new Error(`Unrecognized date format in RTA file: "${text}"`);
}

export function parseRtaNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function requireString(value: unknown, field: string, reportCode: string): string {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`Missing required ${reportCode} field: ${field}`);
  }
  return String(value).trim();
}

export function optionalString(value: unknown): string | undefined {
  return value !== undefined && value !== null && String(value).trim() !== ""
    ? String(value).trim()
    : undefined;
}
