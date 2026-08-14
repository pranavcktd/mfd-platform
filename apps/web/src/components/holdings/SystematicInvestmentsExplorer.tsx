import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "../ui/Card";
import { Amount } from "../ui/Amount";
import { formatDate } from "../../lib/format";
import { formatFrequencyLabel } from "../../lib/sip-frequency-labels";
import type { SystematicInvestmentRegistration } from "../../lib/holdings-types";

const SYSTEMATIC_TYPE_LABELS: Record<"SIP" | "STP" | "SWP" | "UNCLASSIFIED", string> = {
  SIP: "SIP",
  STP: "STP",
  SWP: "SWP",
  UNCLASSIFIED: "Unclassified",
};

/** One expandable bucket (SIP, STP, SWP, or Unclassified) within the systematic-investments card — same collapsible-group pattern as FolioHoldingsExplorer's AMC groups. */
function SystematicInvestmentGroup({
  type,
  registrations,
  expanded,
  onToggle,
}: {
  type: "SIP" | "STP" | "SWP" | "UNCLASSIFIED";
  registrations: SystematicInvestmentRegistration[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const activeCount = registrations.filter((s) => s.isActive).length;

  return (
    <div className="rounded-md border border-[var(--border)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--gridline)]/30"
      >
        <div className="flex items-center gap-1.5">
          {expanded ? <ChevronDown size={15} className="text-ink-muted" /> : <ChevronRight size={15} className="text-ink-muted" />}
          <span className="text-sm font-medium text-ink">{SYSTEMATIC_TYPE_LABELS[type]}</span>
          <span className="text-xs text-ink-muted">
            ({registrations.length}{activeCount !== registrations.length ? `, ${activeCount} active` : ""})
          </span>
        </div>
        <Amount
          value={registrations.filter((s) => s.isActive).reduce((sum, s) => sum + Number(s.sipAmount ?? 0), 0)}
          className="tabular-nums text-xs text-ink-secondary"
        />
      </button>
      {expanded && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-[var(--border)] text-left text-xs text-ink-secondary">
              <th className="py-1.5 pl-8 pr-4 font-medium">Scheme</th>
              <th className="py-1.5 pr-4 font-medium">Folio</th>
              <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
              <th className="py-1.5 pr-4 font-medium">Frequency</th>
              <th className="py-1.5 pr-4 text-right font-medium">Next Due</th>
              <th className="py-1.5 pr-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {registrations.map((s) => (
              <tr key={s.id}>
                <td className="py-1.5 pl-8 pr-4 text-ink">{s.schemeName ?? s.amcCode}</td>
                <td className="py-1.5 pr-4 text-ink-secondary">{s.folioNumber}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={s.sipAmount} /></td>
                <td className="py-1.5 pr-4 text-ink-secondary">{formatFrequencyLabel(s.frequency)}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink-muted">
                  {s.estimatedNextDueDate ? formatDate(s.estimatedNextDueDate) : "—"}
                </td>
                <td className={`py-1.5 pr-3 text-right ${s.isActive ? "text-status-good" : "text-ink-muted"}`}>
                  {s.isActive ? "Active" : "Ceased"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Every SIP/STP/SWP registration on record (active + ceased), grouped into
 * an expandable section per type with a count — only types actually present
 * get a section. Shared by the MFD's CRM client-detail page and the client
 * portal (same underlying data shape, just scoped to "this client" vs
 * "yourself" by whichever hook the caller passes in). registrationType
 * comes from the RTA's own WBR49 AUT_TRNTYP code / MFSD243 Trtype column;
 * rows synced before that was captured, or with an unrecognized code, land
 * in "Unclassified" rather than being guessed into the wrong bucket.
 */
export function SystematicInvestmentsExplorer({
  registrations,
  isLoading,
}: {
  registrations: SystematicInvestmentRegistration[] | undefined;
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["SIP"]));

  function toggle(type: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const groups: Array<{ type: "SIP" | "STP" | "SWP" | "UNCLASSIFIED"; registrations: SystematicInvestmentRegistration[] }> = (
    ["SIP", "STP", "SWP", "UNCLASSIFIED"] as const
  )
    .map((type) => ({
      type,
      registrations: (registrations ?? []).filter((s) => (s.registrationType ?? "UNCLASSIFIED") === type),
    }))
    .filter((g) => g.registrations.length > 0);

  return (
    <Card title="Systematic Investments (SIP / STP / SWP)">
      {isLoading && <p className="py-4 text-center text-sm text-ink-muted">Loading…</p>}
      {!isLoading && groups.length === 0 && (
        <p className="py-4 text-center text-sm text-ink-muted">No SIP/STP/SWP registrations on record.</p>
      )}
      {!isLoading && groups.length > 0 && (
        <div className="space-y-2">
          {groups.map((g) => (
            <SystematicInvestmentGroup
              key={g.type}
              type={g.type}
              registrations={g.registrations}
              expanded={expanded.has(g.type)}
              onToggle={() => toggle(g.type)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
