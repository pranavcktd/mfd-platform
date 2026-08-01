import { useState, type FormEvent } from "react";
import { Card } from "../components/ui/Card";
import { useEquityIsinMasterImport } from "../hooks/useSuperAdmin";
import { ApiError } from "../lib/api-client";
import { formatCount } from "../lib/format";

export function SuperAdminEquityMasterPage() {
  const [folderPath, setFolderPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const importMutation = useEquityIsinMasterImport();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await importMutation.mutateAsync(folderPath);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not import the equity master");
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Equity ISIN Master</h1>
        <p className="text-sm text-ink-secondary">
          The global NSE + BSE listed-equity reference every MFD's "Other Assets → Equity Shares" form searches
          against. Re-run this any time you have a fresher NSE/BSE export — it's a full refresh (upsert by ISIN),
          not a one-time seed.
        </p>
      </div>

      {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>}

      <form onSubmit={handleSubmit}>
        <Card title="Import from Server Folder">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">Server Folder Path</label>
              <input
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                required
                placeholder={String.raw`e.g. D:\Form_137_Project\basic requirements\Equity Stock Asset ISIN`}
                className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus:border-series-1"
              />
              <p className="mt-1 text-xs text-ink-muted">
                A path on the server's own filesystem — not a browser upload. The folder must contain one
                NSE_EQUITY_List* file and one BSE_EQUITY_List* file (any date suffix); they're joined on ISIN.
              </p>
            </div>
            <button
              type="submit"
              disabled={importMutation.isPending}
              className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {importMutation.isPending ? "Importing…" : "Import / Refresh Master"}
            </button>
          </div>
        </Card>
      </form>

      {importMutation.data && (
        <Card title="Import Result">
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
            <div>
              <p className="text-xs text-ink-secondary">Total Unique ISINs</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatCount(importMutation.data.totalIsins)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">Upserted</p>
              <p className="mt-1 text-lg font-semibold text-status-good">{formatCount(importMutation.data.upserted)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">Traded on Both</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatCount(importMutation.data.tradedOnBoth)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">NSE Only</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatCount(importMutation.data.nseOnly)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">BSE Only</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatCount(importMutation.data.bseOnly)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">With Close Price</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatCount(importMutation.data.withPriceData)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Files used: {importMutation.data.nseFile}, {importMutation.data.bseFile}
          </p>
        </Card>
      )}
    </div>
  );
}
