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

/** Formats a whole-number count with Indian digit grouping (e.g. "1,296"). */
export function formatCount(value: number): string {
  return value.toLocaleString("en-IN");
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
