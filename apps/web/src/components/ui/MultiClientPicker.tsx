import { useState } from "react";
import { Search, X } from "lucide-react";
import { useClientList } from "../../hooks/useCrm";

interface SelectedClient {
  id: string;
  name: string;
}

/** Search-and-check multi-select for "pick several clients" flows (family members) — excludeIds keeps already-picked clients (e.g. the family head) out of the search results. */
export function MultiClientPicker({
  selected,
  onChange,
  excludeIds = [],
  placeholder = "Search clients to add…",
}: {
  selected: SelectedClient[];
  onChange: (next: SelectedClient[]) => void;
  excludeIds?: string[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const { data } = useClientList(query, 1);
  const selectedIds = new Set(selected.map((c) => c.id));
  const excluded = new Set(excludeIds);
  const results = (data?.clients ?? []).filter((c) => !selectedIds.has(c.id) && !excluded.has(c.id));

  function toggle(client: SelectedClient) {
    if (selectedIds.has(client.id)) {
      onChange(selected.filter((c) => c.id !== client.id));
    } else {
      onChange([...selected, client]);
    }
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 rounded-full bg-series-1/10 px-2.5 py-1 text-xs text-series-1">
              {c.name}
              <button onClick={() => toggle(c)} aria-label={`Remove ${c.name}`} className="hover:text-status-critical">
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-[var(--border)] bg-surface py-1.5 pl-8 pr-3 text-sm text-ink outline-none focus:border-series-1"
        />
        {query.length >= 2 && results.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-surface p-1 shadow-lg">
            {results.slice(0, 10).map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--gridline)]/50"
              >
                <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggle({ id: c.id, name: c.name })} />
                <span className="text-ink">
                  {c.name}
                  {c.panNumber && <span className="ml-1.5 text-xs text-ink-muted">({c.panNumber})</span>}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
