import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface StatTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  href?: string;
  accent?: "series-1" | "series-2" | "series-4" | "series-5";
}

// Tailwind's content scanner needs literal class strings, not runtime template
// interpolation, so each accent gets its own fully-written-out class pair.
const ACCENT_CLASSES: Record<NonNullable<StatTileProps["accent"]>, { bg: string; text: string }> = {
  "series-1": { bg: "bg-series-1/10", text: "text-series-1" },
  "series-2": { bg: "bg-series-2/10", text: "text-series-2" },
  "series-4": { bg: "bg-series-4/10", text: "text-series-4" },
  "series-5": { bg: "bg-series-5/10", text: "text-series-5" },
};

export function StatTile({ label, value, icon: Icon, href, accent = "series-1" }: StatTileProps) {
  const accentClasses = ACCENT_CLASSES[accent];

  const content = (
    <div className="flex items-start justify-between rounded-lg border border-[var(--border)] bg-surface p-4 transition-colors hover:border-[color:var(--baseline)]">
      <div>
        <p className="text-xs font-medium text-ink-secondary">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{value}</p>
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
