import { useState } from "react";
import { Search, X } from "lucide-react";
import { useClientList } from "../../hooks/useCrm";

interface ClientPickerProps {
  selectedClientId?: string;
  selectedClientName?: string;
  onSelect: (clientId: string | undefined, clientName: string | undefined) => void;
}

/** A type-ahead client search box used for "filter this report by one client" controls — searches the same CRM client list endpoint (name/PAN/email). */
export function ClientPicker({ selectedClientId, selectedClientName, onSelect }: ClientPickerProps) {
  const [query, setQuery] = useState("");
  const { data } = useClientList(query, 1);
  const showResults = query.length >= 2 && !selectedClientId;

  if (selectedClientId) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm">
        <span className="text-ink">{selectedClientName}</span>
        <button onClick={() => onSelect(undefined, undefined)} className="text-ink-muted hover:text-ink" aria-label="Clear client filter">
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by client…"
        className="w-56 rounded-md border border-[var(--border)] bg-surface py-1.5 pl-8 pr-3 text-sm text-ink outline-none focus:border-series-1"
      />
      {showResults && data && data.clients.length > 0 && (
        <div className="absolute z-10 mt-1 w-72 rounded-lg border border-[var(--border)] bg-surface p-1 shadow-lg">
          {data.clients.slice(0, 8).map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onSelect(c.id, c.name);
                setQuery("");
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-[var(--gridline)]/50"
            >
              {c.name}
              {c.panNumber && <span className="ml-1.5 text-xs text-ink-muted">({c.panNumber})</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
