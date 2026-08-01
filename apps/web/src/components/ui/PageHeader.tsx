import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Accent = "series-1" | "series-2" | "series-3" | "series-4" | "series-5" | "series-6";

// Tailwind's content scanner needs literal class strings, not runtime
// template interpolation — same convention as StatTile's ACCENT_CLASSES.
const ACCENT_CLASSES: Record<Accent, { bg: string; text: string }> = {
  "series-1": { bg: "bg-series-1/10", text: "text-series-1" },
  "series-2": { bg: "bg-series-2/10", text: "text-series-2" },
  "series-3": { bg: "bg-series-3/10", text: "text-series-3" },
  "series-4": { bg: "bg-series-4/10", text: "text-series-4" },
  "series-5": { bg: "bg-series-5/10", text: "text-series-5" },
  "series-6": { bg: "bg-series-6/10", text: "text-series-6" },
};

/** Icon badge + title, used at the top of every module page for a consistent, branded identity per module (matches the icon assigned to that module in nav-config.ts). */
export function PageHeader({
  icon: Icon,
  accent = "series-1",
  title,
  children,
}: {
  icon: LucideIcon;
  accent?: Accent;
  title: string;
  children?: ReactNode;
}) {
  const accentClasses = ACCENT_CLASSES[accent];
  return (
    <div className="flex items-center gap-3">
      <div className={`rounded-lg p-2.5 ${accentClasses.bg}`}>
        <Icon size={20} className={accentClasses.text} strokeWidth={2} />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        {children}
      </div>
    </div>
  );
}
