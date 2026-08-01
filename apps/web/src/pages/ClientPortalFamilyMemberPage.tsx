import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card } from "../components/ui/Card";
import { FolioHoldingsExplorer } from "../components/holdings/FolioHoldingsExplorer";
import { useClientPortalFamilyMember, useClientPortalFamilyMemberFolioTransactions } from "../hooks/useClientPortal";
import { formatInrCompact, formatInrExact } from "../lib/format";

export function ClientPortalFamilyMemberPage() {
  const { memberId } = useParams<{ memberId: string }>();
  const { data, isLoading, isError } = useClientPortalFamilyMember(memberId);

  if (isLoading) {
    return <p className="text-sm text-ink-secondary">Loading…</p>;
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

      <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
        <p className="text-xs text-ink-secondary">Total Portfolio Value</p>
        <p className="mt-1 text-xl font-semibold text-ink">{formatInrCompact(data.totalAum)}</p>
        <p className="text-xs text-ink-muted">{formatInrExact(data.totalAum)}</p>
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
