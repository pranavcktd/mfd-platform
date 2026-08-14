import { useState } from "react";
import { Mail } from "lucide-react";
import { Card } from "../components/ui/Card";
import { useRtaSenderConfig, useUpdateRtaSenderConfig } from "../hooks/useSuperAdmin";
import { formatDateTime } from "../lib/format";

const RTA_LABELS: Record<string, string> = { CAMS: "CAMS", KFINTECH: "KFintech" };

function RtaConfigRow({ rtaType, senderIdentifier, updatedAt }: { rtaType: string; senderIdentifier: string; updatedAt: string }) {
  const [value, setValue] = useState(senderIdentifier);
  const [saved, setSaved] = useState(false);
  const update = useUpdateRtaSenderConfig();

  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] py-3 last:border-b-0">
      <div className="w-28 shrink-0 text-sm font-medium text-ink">{RTA_LABELS[rtaType] ?? rtaType}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setSaved(false); }}
        placeholder="e.g. camsonline.com"
        className="w-80 rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm text-ink"
      />
      <button
        onClick={() => update.mutate({ rtaType, senderIdentifier: value }, { onSuccess: () => setSaved(true) })}
        disabled={!value.trim() || update.isPending}
        className="rounded-md bg-series-1 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {update.isPending ? "Saving…" : "Save"}
      </button>
      {saved && <span className="text-xs text-status-good">Saved</span>}
      <span className="ml-auto shrink-0 text-xs text-ink-muted">Last updated {formatDateTime(updatedAt)}</span>
    </div>
  );
}

/**
 * CAMS/KFintech sender identification used to be a hardcoded constant
 * (mail-link-extraction.ts) — a real code change + deploy was needed if
 * either RTA ever changed the address they send mailback reports from.
 * Editable here now; mail-ingestion.processor.ts reads it fresh each poll.
 */
export function SuperAdminRtaConfigPage() {
  const { data, isLoading } = useRtaSenderConfig();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">RTA Mail Configuration</h1>
        <p className="text-sm text-ink-secondary">
          Which real email address/domain identifies mail from each RTA — checked as a case-insensitive substring
          against the sender's From address. If CAMS or KFintech ever changes their sending address, update it here
          instead of requiring a code change.
        </p>
      </div>

      <Card title="Sender Identification" action={<Mail size={15} className="text-ink-muted" />}>
        {isLoading && <p className="py-4 text-center text-sm text-ink-muted">Loading…</p>}
        {!isLoading && data?.map((row) => (
          <RtaConfigRow key={row.rtaType} rtaType={row.rtaType} senderIdentifier={row.senderIdentifier} updatedAt={row.updatedAt} />
        ))}
      </Card>
    </div>
  );
}
