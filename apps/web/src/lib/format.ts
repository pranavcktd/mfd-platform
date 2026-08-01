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
