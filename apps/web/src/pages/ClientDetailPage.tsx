import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useClientDetail } from "../hooks/useCrm";
import { Card } from "../components/ui/Card";
import { formatDate, formatInrCompact } from "../lib/format";

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { data, isLoading, isError } = useClientDetail(clientId);

  if (isLoading) {
    return <p className="text-sm text-ink-secondary">Loading…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-status-critical">Client not found.</p>;
  }

  const totalAum = data.folios.reduce((sum, f) => sum + Number(f.valuationAmount ?? 0), 0);
  const address = [data.address1, data.address2, data.city, data.pincode].filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      <Link to="/crm" className="flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={14} />
        Back to CRM
      </Link>

      <div>
        <h1 className="text-lg font-semibold text-ink">{data.name}</h1>
        <p className="text-sm text-ink-secondary">
          {data.panNumber ?? "No PAN on file"}
          {data.familyName ? ` · Family: ${data.familyName}` : ""}
          {" · Client since "}
          {formatDate(data.createdAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Total AUM</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatInrCompact(totalAum)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Folios</p>
          <p className="mt-1 text-xl font-semibold text-ink">{data.folios.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Email</p>
          <p className="mt-1 text-sm text-ink">{data.email ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Phone</p>
          <p className="mt-1 text-sm text-ink">{data.phone ?? "—"}</p>
        </div>
      </div>

      <Card title="Personal & Bank Details">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-ink-secondary">Address</p>
            <p className="mt-1 text-sm text-ink">{address || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Date of Birth</p>
            <p className="mt-1 text-sm text-ink">{data.dateOfBirth ? formatDate(data.dateOfBirth) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Tax Status</p>
            <p className="mt-1 text-sm text-ink">{data.taxStatus ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Bank Name</p>
            <p className="mt-1 text-sm text-ink">{data.bankName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Bank Account No.</p>
            <p className="mt-1 text-sm text-ink">{data.bankAccountNumber ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">KYC Status</p>
            <p className="mt-1 text-sm text-ink">{data.kycStatus ?? "Not captured by source reports"}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Nominee details aren't shown — the RTA's investor-master report doesn't include a nominee field in what's
          ingested today.
        </p>
      </Card>

      <Card title="Folios">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-secondary">
                <th className="py-1.5 pr-4 font-medium">Folio</th>
                <th className="py-1.5 pr-4 font-medium">Scheme</th>
                <th className="py-1.5 pr-4 font-medium">Asset Class</th>
                <th className="py-1.5 pr-4 text-right font-medium">Units</th>
                <th className="py-1.5 pr-4 text-right font-medium">NAV</th>
                <th className="py-1.5 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gridline)]">
              {data.folios.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-ink-muted">
                    No folios.
                  </td>
                </tr>
              )}
              {data.folios.map((f) => (
                <tr key={f.id}>
                  <td className="py-1.5 pr-4 text-ink">{f.folioNumber}</td>
                  <td className="py-1.5 pr-4 text-ink-secondary">
                    {f.schemeName ?? `${f.amcCode}/${f.schemeCode}`}
                  </td>
                  <td className="py-1.5 pr-4 text-ink-secondary">{f.assetClass ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">
                    {f.balanceUnits ?? "—"}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{f.navPerUnit ?? "—"}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink">
                    {f.valuationAmount ? formatInrCompact(f.valuationAmount) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
              <span className="tabular-nums text-ink-secondary">{formatInrCompact(a.value)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Recent Transactions">
        <ul className="divide-y divide-[var(--gridline)]">
          {data.recentTransactions.length === 0 && (
            <li className="py-2 text-sm text-ink-muted">No transactions.</li>
          )}
          {data.recentTransactions.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink-secondary">{t.transactionDescription ?? t.transactionType}</span>
              <span className="tabular-nums text-ink-secondary">{t.amount ? formatInrCompact(t.amount) : "—"}</span>
              <span className="tabular-nums text-ink-muted">{formatDate(t.transactionDate)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
