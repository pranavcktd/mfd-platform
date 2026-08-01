import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Amount } from "../components/ui/Amount";
import { useClientPortalMe } from "../hooks/useClientPortal";
import { formatInrCompact, formatInrExact } from "../lib/format";

const SERIES_CLASSES = ["bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4", "bg-series-5", "bg-series-6"];

export function ClientPortalDashboardPage() {
  const { data, isLoading, isError } = useClientPortalMe();

  if (isLoading) {
    return <p className="text-sm text-ink-secondary">Loading…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-status-critical">Could not load your portfolio.</p>;
  }

  const maxAllocation = Math.max(...data.assetAllocation.map((a) => Number(a.aum)), 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Welcome, {data.name}</h1>
        {data.familyName && (
          <p className="text-sm text-ink-secondary">
            Family: {data.familyName}
            {data.isFamilyHead && " (you're the family head — you can view every member's holdings below)"}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Total Portfolio Value</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatInrCompact(data.totalAum)}</p>
          <p className="text-xs text-ink-muted">{formatInrExact(data.totalAum)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Folios</p>
          <p className="mt-1 text-xl font-semibold text-ink">{data.folios.length}</p>
        </div>
      </div>

      <Card title="Asset Allocation">
        {data.assetAllocation.length === 0 ? (
          <p className="text-sm text-ink-muted">No asset-class data yet.</p>
        ) : (
          <div className="space-y-3">
            {data.assetAllocation.map((a, i) => (
              <div key={a.assetClass}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-ink">{a.assetClass}</span>
                  <span className="tabular-nums text-ink-secondary">
                    {formatInrCompact(a.aum)} · {a.percentOfTotal}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--gridline)]">
                  <div
                    className={`h-full rounded-full ${SERIES_CLASSES[i % SERIES_CLASSES.length]}`}
                    style={{ width: `${(Number(a.aum) / maxAllocation) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {data.familyMembers && (
        <Card title="Family Members">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-secondary">
                <th className="py-1.5 pr-4 font-medium">Name</th>
                <th className="py-1.5 text-right font-medium">Portfolio Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gridline)]">
              {data.familyMembers.map((m) => (
                <tr key={m.id}>
                  <td className="py-1.5 pr-4">
                    {m.isSelf ? (
                      <span className="text-ink">{m.name} (you)</span>
                    ) : (
                      <Link to={`/client-portal/family/${m.id}`} className="text-series-1 hover:underline">
                        {m.name}
                      </Link>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={m.totalAum} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
