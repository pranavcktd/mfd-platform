import { Search } from "lucide-react";

export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
  className = "w-64",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-[var(--border)] bg-surface py-1.5 pl-8 pr-3 text-sm text-ink outline-none focus:border-series-1"
      />
    </div>
  );
}
