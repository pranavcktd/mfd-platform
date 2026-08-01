import { Card } from "../components/ui/Card";
import { OtherAssetValue } from "../components/ui/OtherAssetValue";
import { FolioHoldingsExplorer } from "../components/holdings/FolioHoldingsExplorer";
import { useClientPortalFolioTransactions, useClientPortalMe } from "../hooks/useClientPortal";

export function ClientPortalHoldingsPage() {
  const { data, isLoading, isError } = useClientPortalMe();

  if (isLoading) {
    return <p className="text-sm text-ink-secondary">Loading…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-status-critical">Could not load your holdings.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Holdings</h1>
        <p className="text-sm text-ink-secondary">
          Every folio on record, grouped by AMC — expand a fund house to see its folios, and a folio to see its full
          date-wise transaction history.
        </p>
      </div>

      <Card title={`${data.folios.length} Folios`}>
        <FolioHoldingsExplorer
          folios={data.folios}
          useTransactions={(folioId) => useClientPortalFolioTransactions(folioId)}
        />
      </Card>

      <Card title="Other Assets">
        <ul className="divide-y divide-[var(--gridline)]">
          {data.otherAssets.length === 0 && <li className="py-2 text-sm text-ink-muted">None recorded.</li>}
          {data.otherAssets.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink">
                {a.assetType}
                {a.description ? ` — ${a.description}` : ""}
              </span>
              <OtherAssetValue assetType={a.assetType} details={a.details} value={a.value} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
