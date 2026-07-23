import { useState, type FormEvent } from "react";
import { Card } from "../components/ui/Card";
import { useClientList } from "../hooks/useCrm";
import { useCreateOtherAsset, useOtherAssets } from "../hooks/useOtherAssets";
import { formatDate, formatInrCompact } from "../lib/format";

export function OtherAssetsPage() {
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState("");
  const [assetType, setAssetType] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: clientResults } = useClientList(clientSearch, 1);
  const { data: assets, isLoading } = useOtherAssets();
  const createAsset = useCreateOtherAsset();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedClientId || !assetType || !value) return;
    createAsset.mutate(
      { clientId: selectedClientId, assetType, description: description || undefined, value: Number(value), asOfDate },
      {
        onSuccess: () => {
          setAssetType("");
          setDescription("");
          setValue("");
          setSelectedClientId(null);
          setSelectedClientName("");
          setClientSearch("");
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Other Assets</h1>
        <p className="text-sm text-ink-secondary">
          Manually record a client's non-MF holdings (real estate, FDs, gold, direct equity, etc.) so their net worth
          report reflects more than just mutual fund AUM.
        </p>
      </div>

      <Card title="Add an Asset">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Client</label>
            {selectedClientId ? (
              <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm">
                <span className="text-ink">{selectedClientName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClientId(null);
                    setSelectedClientName("");
                  }}
                  className="text-xs text-series-1 hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search client by name or PAN…"
                  className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
                />
                {clientSearch && clientResults && clientResults.clients.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-[var(--border)] bg-surface shadow-lg">
                    {clientResults.clients.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClientId(c.id);
                            setSelectedClientName(c.name);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-[var(--gridline)]/50"
                        >
                          {c.name} {c.panNumber ? `(${c.panNumber})` : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Asset Type</label>
            <input
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
              placeholder="Real Estate, FD, Gold, Direct Equity…"
              required
              className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Value (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">As of Date</label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              required
              className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!selectedClientId || createAsset.isPending}
              className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {createAsset.isPending ? "Saving…" : "Add Asset"}
            </button>
          </div>
        </form>
      </Card>

      <Card title="All Recorded Assets">
        <ul className="divide-y divide-[var(--gridline)]">
          {isLoading && <li className="py-2 text-sm text-ink-muted">Loading…</li>}
          {assets?.length === 0 && <li className="py-2 text-sm text-ink-muted">No assets recorded yet.</li>}
          {assets?.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="text-ink">{a.clientName}</span>
                <span className="ml-2 text-ink-secondary">
                  {a.assetType}
                  {a.description ? ` — ${a.description}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="tabular-nums text-ink">{formatInrCompact(a.value)}</span>
                <span className="tabular-nums text-ink-muted">{formatDate(a.asOfDate)}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
