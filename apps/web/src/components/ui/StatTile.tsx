import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface StatTileProps {
  label: string;
  value: string;
  /** Exact figure shown beneath the compact one (e.g. "₹28,94,231.50") — for money tiles, so the rounded Cr/L headline can still be cross-checked against source data. */
  subValue?: string;
  icon: LucideIcon;
  href?: string;
  accent?: "series-1" | "series-2" | "series-3" | "series-4" | "series-5" | "series-6";
  /** Colors the headline value green/red for change tiles (day/month AUM change) — omit for a plain tile. */
  trend?: "up" | "down";
}

// Tailwind's content scanner needs literal class strings, not runtime template
// interpolation, so each accent gets its own fully-written-out class pair.
const ACCENT_CLASSES: Record<NonNullable<StatTileProps["accent"]>, { bg: string; text: string }> = {
  "series-1": { bg: "bg-series-1/10", text: "text-series-1" },
  "series-2": { bg: "bg-series-2/10", text: "text-series-2" },
  "series-3": { bg: "bg-series-3/10", text: "text-series-3" },
  "series-4": { bg: "bg-series-4/10", text: "text-series-4" },
  "series-5": { bg: "bg-series-5/10", text: "text-series-5" },
  "series-6": { bg: "bg-series-6/10", text: "text-series-6" },
};

export function StatTile({ label, value, subValue, icon: Icon, href, accent = "series-1", trend }: StatTileProps) {
  const accentClasses = ACCENT_CLASSES[accent];
  const valueColorClass = trend === "up" ? "text-status-good" : trend === "down" ? "text-status-critical" : "text-ink";

  const content = (
    <div className="flex items-start justify-between rounded-lg border border-[var(--border)] bg-surface p-4 transition-colors hover:border-[color:var(--baseline)]">
      <div>
        <p className="text-xs font-medium text-ink-secondary">{label}</p>
        <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${valueColorClass}`}>{value}</p>
        {subValue && <p className="mt-0.5 text-xs tabular-nums text-ink-muted">{subValue}</p>}
      </div>
      <div className={`rounded-md p-2 ${accentClasses.bg}`}>
        <Icon size={18} className={accentClasses.text} strokeWidth={2} />
      </div>
    </div>
  );

  return href ? (
    <Link to={href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}
