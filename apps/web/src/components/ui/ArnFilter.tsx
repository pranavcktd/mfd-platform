import { ChevronDown } from "lucide-react";
import type { ArnProfile } from "../../hooks/useDashboard";

interface ArnFilterProps {
  arnProfiles: ArnProfile[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

function arnLabel(arn: ArnProfile): string {
  const name = arn.displayName || arn.arnHolderName;
  return `ARN-${arn.arnNumber} — ${name}`;
}

/** Empty selectedIds means "all ARNs" (the merged parent+children view) — matches how the summary endpoint interprets an omitted filter. */
export function ArnFilter({ arnProfiles, selectedIds, onChange }: ArnFilterProps) {
  if (arnProfiles.length <= 1) {
    return null;
  }

  const allSelected = selectedIds.length === 0;
  const summary = allSelected
    ? "All ARNs"
    : selectedIds.length === 1
      ? `ARN-${arnProfiles.find((a) => a.id === selectedIds[0])?.arnNumber ?? "?"}`
      : `${selectedIds.length} ARNs selected`;

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-[var(--border)] bg-surface px-3 py-1.5 text-sm text-ink-secondary hover:border-[color:var(--baseline)]">
        {summary}
        <ChevronDown size={14} className="text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-10 mt-1.5 w-72 rounded-lg border border-[var(--border)] bg-surface p-2 shadow-lg">
        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--gridline)]/50">
          <input type="checkbox" checked={allSelected} onChange={() => onChange([])} />
          <span className="text-ink">All ARNs (merged)</span>
        </label>
        <div className="my-1 h-px bg-[var(--gridline)]" />
        {arnProfiles.map((arn) => (
          <label
            key={arn.id}
            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--gridline)]/50 ${arn.parentArnProfileId ? "pl-5" : ""}`}
          >
            <input type="checkbox" checked={selectedIds.includes(arn.id)} onChange={() => toggle(arn.id)} />
            <span className="text-ink">{arnLabel(arn)}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
