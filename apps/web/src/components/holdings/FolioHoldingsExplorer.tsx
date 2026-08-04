import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Mail } from "lucide-react";
import { Amount } from "../ui/Amount";
import { formatDate } from "../../lib/format";
import { isNonZeroHolding, type HoldingFolio, type HoldingTransaction, type SourceMailInfo } from "../../lib/holdings-types";

function SourceBadge({ source }: { source: string }) {
  if (source === "RTA_MAILBACK") return null;
  return (
    <span className="ml-2 rounded bg-series-4/15 px-1.5 py-0.5 text-[10px] font-medium text-series-4">
      External ({source === "CAS_IMPORT" ? "CAS import" : source})
    </span>
  );
}

/** "Which RTA file did this come from" — real traceability, not guessed: the mail's own subject/sender/received date, captured at ingestion time. */
function sourceMailTitle(mail: SourceMailInfo | null | undefined): string | undefined {
  if (!mail) return undefined;
  const parts = [`${mail.rtaType} mail`];
  if (mail.receivedAt) parts.push(`received ${formatDate(mail.receivedAt)}`);
  if (mail.subject) parts.push(`— "${mail.subject}"`);
  return parts.join(" ");
}

function SourceMailIcon({ mail }: { mail: SourceMailInfo | null | undefined }) {
  if (!mail) return null;
  return (
    <span title={sourceMailTitle(mail)} className="inline-flex shrink-0">
      <Mail size={11} className="text-ink-muted" />
    </span>
  );
}

function TransactionRow({ t }: { t: HoldingTransaction }) {
  return (
    <tr className={t.isRejection ? "bg-status-critical/5" : undefined}>
      <td className="py-1.5 pr-3 text-ink-muted">
        <span className="inline-flex items-center gap-1">
          {formatDate(t.transactionDate)}
          <SourceMailIcon mail={t.sourceMail} />
        </span>
      </td>
      <td className="py-1.5 pr-3 text-ink-secondary">
        {t.transactionDescription ?? t.transactionType}
        {t.isRejection && (
          <span
            className="ml-2 inline-flex items-center gap-1 rounded bg-status-critical/15 px-1.5 py-0.5 text-[10px] font-medium text-status-critical"
            title={t.rejectionReason ?? undefined}
          >
            <AlertTriangle size={10} />
            {t.rejectionReason ? `Failed: ${t.rejectionReason}` : "Reverted / Failed"}
          </span>
        )}
        <SourceBadge source={t.source} />
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-ink"><Amount value={t.amount} /></td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-ink-secondary">{t.units ?? "—"}</td>
      <td className="py-1.5 text-right tabular-nums text-ink-secondary">{t.navPerUnit ?? "—"}</td>
    </tr>
  );
}

function FolioTransactions({
  folioId,
  useTransactions,
}: {
  folioId: string;
  useTransactions: (folioId: string | null) => { data?: HoldingTransaction[]; isLoading: boolean };
}) {
  const { data, isLoading } = useTransactions(folioId);
  return (
    <div className="overflow-x-auto border-t border-[var(--border)] bg-page px-3 py-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-ink-secondary">
            <th className="py-1 pr-3 font-medium">Date</th>
            <th className="py-1 pr-3 font-medium">Description</th>
            <th className="py-1 pr-3 text-right font-medium">Amount</th>
            <th className="py-1 pr-3 text-right font-medium">Units</th>
            <th className="py-1 text-right font-medium">NAV</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && (
            <tr><td colSpan={5} className="py-3 text-center text-ink-muted">Loading transactions…</td></tr>
          )}
          {!isLoading && data?.length === 0 && (
            <tr><td colSpan={5} className="py-3 text-center text-ink-muted">No transactions on this folio.</td></tr>
          )}
          {data?.map((t) => <TransactionRow key={t.id} t={t} />)}
        </tbody>
      </table>
    </div>
  );
}

function FolioRow({
  folio,
  expanded,
  onToggle,
  useTransactions,
}: {
  folio: HoldingFolio;
  expanded: boolean;
  onToggle: () => void;
  useTransactions: (folioId: string | null) => { data?: HoldingTransaction[]; isLoading: boolean };
}) {
  return (
    <div>
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--gridline)]/30">
        <div className="flex min-w-0 items-center gap-1.5">
          {expanded ? <ChevronDown size={14} className="shrink-0 text-ink-muted" /> : <ChevronRight size={14} className="shrink-0 text-ink-muted" />}
          <div className="min-w-0">
            <p className="truncate text-ink">
              {folio.schemeName ?? `${folio.amcCode}/${folio.schemeCode}`}
              <SourceBadge source={folio.source} />
            </p>
            <p className="inline-flex items-center gap-1 text-xs text-ink-muted">
              {folio.folioNumber} · {folio.assetClass ?? "—"} · {folio.balanceUnits ?? "0"} units
              {folio.balanceAsOfDate ? ` · as of ${formatDate(folio.balanceAsOfDate)}` : ""}
              <SourceMailIcon mail={folio.balanceSourceMail} />
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-4 text-right text-xs">
          <div>
            <p className="text-ink-muted">Invested</p>
            <Amount value={folio.investedAmount} className="tabular-nums text-ink-secondary" />
          </div>
          <div>
            <p className="text-ink-muted">Current (RTA)</p>
            <Amount value={folio.valuationAmount} className="tabular-nums font-medium text-ink" />
          </div>
          {folio.liveValue !== null && (
            <div title={folio.liveNavDate ? `NAV ${folio.liveNav} as of ${formatDate(folio.liveNavDate)}` : undefined}>
              <p className="text-ink-muted">Live (AMFI)</p>
              <Amount value={folio.liveValue} className="tabular-nums font-medium text-series-6" />
            </div>
          )}
        </div>
      </button>
      {expanded && <FolioTransactions folioId={folio.id} useTransactions={useTransactions} />}
    </div>
  );
}

/**
 * AMC-wise collapsible portfolio view shared by the MFD's CRM client detail
 * page and the client portal's own Holdings page — same grouping/toggle/
 * drill-down behavior in both, just wired to a different transactions hook
 * (CRM's is scoped by clientId, the portal's is scoped to "yourself").
 */
export function FolioHoldingsExplorer({
  folios,
  useTransactions,
}: {
  folios: HoldingFolio[];
  useTransactions: (folioId: string | null) => { data?: HoldingTransaction[]; isLoading: boolean };
}) {
  const [showAll, setShowAll] = useState(false);
  const [expandedAmc, setExpandedAmc] = useState<Set<string>>(new Set());
  const [expandedFolio, setExpandedFolio] = useState<string | null>(null);

  const nonZeroCount = folios.filter(isNonZeroHolding).length;
  const visible = showAll ? folios : folios.filter(isNonZeroHolding);

  const groupMap = new Map<string, { amcName: string; folios: HoldingFolio[] }>();
  for (const f of visible) {
    const g = groupMap.get(f.amcCode) ?? { amcName: f.amcName, folios: [] };
    g.folios.push(f);
    groupMap.set(f.amcCode, g);
  }
  const groups = Array.from(groupMap.entries())
    .map(([amcCode, g]) => ({
      amcCode,
      amcName: g.amcName,
      folios: g.folios,
      totalInvested: g.folios.reduce((sum, f) => sum + Number(f.investedAmount || 0), 0),
      totalCurrent: g.folios.reduce((sum, f) => sum + Number(f.valuationAmount || 0), 0),
    }))
    .sort((a, b) => b.totalCurrent - a.totalCurrent);

  function toggleAmc(amcCode: string) {
    setExpandedAmc((prev) => {
      const next = new Set(prev);
      if (next.has(amcCode)) next.delete(amcCode);
      else next.add(amcCode);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowAll(false)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${!showAll ? "bg-series-1 text-white" : "border border-[var(--border)] text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
        >
          Non-Zero Holdings ({nonZeroCount})
        </button>
        <button
          onClick={() => setShowAll(true)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${showAll ? "bg-series-1 text-white" : "border border-[var(--border)] text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
        >
          View All ({folios.length})
        </button>
      </div>

      {groups.length === 0 && <p className="py-4 text-center text-sm text-ink-muted">No folios to show.</p>}

      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.amcCode} className="rounded-md border border-[var(--border)]">
            <button
              onClick={() => toggleAmc(g.amcCode)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--gridline)]/30"
            >
              <div className="flex items-center gap-1.5">
                {expandedAmc.has(g.amcCode) ? <ChevronDown size={15} className="text-ink-muted" /> : <ChevronRight size={15} className="text-ink-muted" />}
                <span className="text-sm font-medium text-ink">{g.amcName}</span>
                <span className="text-xs text-ink-muted">({g.folios.length} folio{g.folios.length > 1 ? "s" : ""})</span>
              </div>
              <div className="flex gap-4 text-right text-xs">
                <div>
                  <p className="text-ink-muted">Invested</p>
                  <Amount value={g.totalInvested} className="tabular-nums text-ink-secondary" />
                </div>
                <div>
                  <p className="text-ink-muted">Current</p>
                  <Amount value={g.totalCurrent} className="tabular-nums font-semibold text-ink" />
                </div>
              </div>
            </button>
            {expandedAmc.has(g.amcCode) && (
              <div className="divide-y divide-[var(--gridline)] border-t border-[var(--border)]">
                {g.folios.map((f) => (
                  <FolioRow
                    key={f.id}
                    folio={f}
                    expanded={expandedFolio === f.id}
                    onToggle={() => setExpandedFolio(expandedFolio === f.id ? null : f.id)}
                    useTransactions={useTransactions}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
