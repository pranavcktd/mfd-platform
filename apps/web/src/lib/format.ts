/** Formats a rupee amount using the Indian Cr/L convention the dashboard KPI cards use (e.g. "₹28.9 Cr", "₹33.7 L"). */
export function formatInrCompact(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) {
    return "₹0";
  }
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) {
    return `₹${(n / 1_00_00_000).toFixed(1)} Cr`;
  }
  if (abs >= 1_00_000) {
    return `₹${(n / 1_00_000).toFixed(1)} L`;
  }
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Exact rupee amount with Indian digit grouping and paise (e.g. "₹28,94,231.50") — the cross-verifiable figure Cr/L rounding hides. */
export function formatInrExact(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) {
    return "₹0";
  }
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Formats a whole-number count with Indian digit grouping (e.g. "1,296"). */
export function formatCount(value: number): string {
  return value.toLocaleString("en-IN");
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** "YYYY-MM" (a month-bucket key, e.g. from a GROUP BY date_trunc('month', ...)) to "Jul 2026" — bare month numbers/two-digit years are ambiguous once a chart spans a year boundary. */
export function formatMonthYear(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

/** Date + exact time (e.g. "23 Jul 2026, 5:49:02 pm") — for admin/audit views where "how long ago" isn't precise enough to manually cross-reference against a mail log or external system. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/** Builds a Gmail search-by-Message-ID deep link so an admin can open the exact source email directly, given the RFC822 Message-ID captured at ingestion time. */
export function gmailSearchLink(messageId: string): string {
  const bare = messageId.replace(/^<|>$/g, "");
  return `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(bare)}`;
}

/** The exact same search gmailSearchLink opens, as copy-paste-able plain text — for pasting into an already-open Gmail tab's own search box rather than following a link. */
export function gmailMessageIdSearchText(messageId: string): string {
  return `rfc822msgid:${messageId.replace(/^<|>$/g, "")}`;
}

/** Fallback Gmail search text for a failed mail with no captured Message-ID (rows from before that field existed) — built from whatever the ingestion pipeline still knows, so there's always something to paste and search with instead of nothing. A ±1 day window around receivedAt absorbs timezone rounding between our stored UTC timestamp and the admin's own Gmail account timezone. */
export function gmailFallbackSearchText(fromAddress: string, subject: string | null, receivedAt: string | null): string {
  const parts = [`from:${fromAddress}`];
  if (subject) parts.push(`subject:"${subject}"`);
  if (receivedAt) {
    const received = new Date(receivedAt);
    const after = new Date(received);
    after.setUTCDate(after.getUTCDate() - 1);
    const before = new Date(received);
    before.setUTCDate(before.getUTCDate() + 1);
    const fmt = (d: Date) => `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
    parts.push(`after:${fmt(after)}`, `before:${fmt(before)}`);
  }
  return parts.join(" ");
}
