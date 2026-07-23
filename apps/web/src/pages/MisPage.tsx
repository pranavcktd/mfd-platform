import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { useMisSummary } from "../hooks/useMis";
import { formatDate } from "../lib/format";

export function MisPage() {
  const { data, isLoading } = useMisSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">MIS — Compliance & Hygiene</h1>
        <p className="text-sm text-ink-secondary">
          Data-quality checks derived from your ingested RTA data. "Clients without nominee" isn't shown — nominee
          isn't captured by any of the CAMS/KFintech report types ingested today.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={`Non-SIP Clients${data ? ` (${data.nonSipClients.length})` : ""}`}>
          <p className="mb-2 text-xs text-ink-muted">Clients with folios but no active SIP registration.</p>
          <ul className="max-h-72 divide-y divide-[var(--gridline)] overflow-y-auto">
            {isLoading && <li className="py-2 text-sm text-ink-muted">Loading…</li>}
            {data?.nonSipClients.length === 0 && <li className="py-2 text-sm text-ink-muted">None.</li>}
            {data?.nonSipClients.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <Link to={`/crm/${c.id}`} className="text-series-1 hover:underline">
                  {c.name}
                </Link>
                <span className="text-ink-secondary">{c.panNumber ?? "No PAN"}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={`Clients Without Any Folio${data ? ` (${data.clientsWithoutFolio.length})` : ""}`}>
          <p className="mb-2 text-xs text-ink-muted">Client records with zero linked folios.</p>
          <ul className="max-h-72 divide-y divide-[var(--gridline)] overflow-y-auto">
            {isLoading && <li className="py-2 text-sm text-ink-muted">Loading…</li>}
            {data?.clientsWithoutFolio.length === 0 && <li className="py-2 text-sm text-ink-muted">None.</li>}
            {data?.clientsWithoutFolio.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <Link to={`/crm/${c.id}`} className="text-series-1 hover:underline">
                  {c.name}
                </Link>
                <span className="tabular-nums text-ink-muted">{formatDate(c.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={`Zero-Balance Folios${data ? ` (${data.zeroBalanceFolios.length})` : ""}`}>
          <p className="mb-2 text-xs text-ink-muted">Folios with no valuation amount or a zero balance.</p>
          <ul className="max-h-72 divide-y divide-[var(--gridline)] overflow-y-auto">
            {isLoading && <li className="py-2 text-sm text-ink-muted">Loading…</li>}
            {data?.zeroBalanceFolios.length === 0 && <li className="py-2 text-sm text-ink-muted">None.</li>}
            {data?.zeroBalanceFolios.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{f.clientName}</span>
                <span className="text-ink-secondary">
                  {f.folioNumber} · {f.amcCode}/{f.schemeCode}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={`Folios Without PAN${data ? ` (${data.foliosWithoutPan.length})` : ""}`}>
          <p className="mb-2 text-xs text-ink-muted">Folios whose client has no PAN on record.</p>
          <ul className="max-h-72 divide-y divide-[var(--gridline)] overflow-y-auto">
            {isLoading && <li className="py-2 text-sm text-ink-muted">Loading…</li>}
            {data?.foliosWithoutPan.length === 0 && <li className="py-2 text-sm text-ink-muted">None.</li>}
            {data?.foliosWithoutPan.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{f.clientName}</span>
                <span className="text-ink-secondary">
                  {f.folioNumber} · {f.amcCode}/{f.schemeCode}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
