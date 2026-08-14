import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card } from "../components/ui/Card";
import { GainLossStat } from "../components/ui/GainLossStat";
import { PageLoading } from "../components/ui/PageLoading";
import { FolioHoldingsExplorer } from "../components/holdings/FolioHoldingsExplorer";
import { useClientPortalFamilyMember, useClientPortalFamilyMemberFolioTransactions } from "../hooks/useClientPortal";
import { formatInrCompact, formatInrExact } from "../lib/format";

export function ClientPortalFamilyMemberPage() {
  const { memberId } = useParams<{ memberId: string }>();
  const { data, isLoading, isError } = useClientPortalFamilyMember(memberId);

  if (isLoading) {
    return <PageLoading />;
  }
  if (isError || !data) {
    return <p className="text-sm text-status-critical">Could not load this family member's portfolio.</p>;
  }

  return (
    <div className="space-y-4">
      <Link to="/client-portal" className="flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={14} />
        Back
      </Link>
      <h1 className="text-lg font-semibold text-ink">{data.name}</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Current Value</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatInrCompact(data.totalCurrentValue)}</p>
          <p className="text-xs text-ink-muted">{formatInrExact(data.totalCurrentValue)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Total Invested</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatInrCompact(data.totalInvestedValue)}</p>
          <p className="text-xs text-ink-muted">{formatInrExact(data.totalInvestedValue)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Gain / Loss</p>
          <p className="mt-1 text-xl font-semibold">
            <GainLossStat investedAmount={data.totalInvestedValue} currentValue={Number(data.totalCurrentValue)} />
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Folios</p>
          <p className="mt-1 text-xl font-semibold text-ink">{data.folios.length}</p>
        </div>
      </div>

      <Card title="Portfolio (by AMC)">
        <FolioHoldingsExplorer
          folios={data.folios}
          useTransactions={(folioId) => useClientPortalFamilyMemberFolioTransactions(memberId, folioId)}
        />
      </Card>
    </div>
  );
}
