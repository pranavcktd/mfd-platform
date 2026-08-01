import type { LucideIcon } from "lucide-react";

export interface ChartTypeOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

export function ChartTypeToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<ChartTypeOption<T>>;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-[var(--border)] p-0.5 print:hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            value === opt.value ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"
          }`}
        >
          <opt.icon size={13} />
          {opt.label}
        </button>
      ))}
    </div>
  );
}
