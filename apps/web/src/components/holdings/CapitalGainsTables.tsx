import { Amount } from "../ui/Amount";
import { formatDate } from "../../lib/format";
import type { CapitalGainRow, CapitalGainLotRow } from "../../lib/holdings-types";

/** Folio-level capital gains summary table — shared by the MFD's CRM Reports page and the client portal's own capital gains view (both call the same backend FIFO/tax engine, just scoped differently). */
export function CapitalGainsResultsTable({ data }: { data: CapitalGainRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-ink-secondary">
          <th className="py-1.5 pr-4 font-medium">Folio / Scheme</th>
          <th className="py-1.5 pr-4 font-medium">Category</th>
          <th className="py-1.5 pr-4 text-right font-medium">STCG</th>
          <th className="py-1.5 pr-4 text-right font-medium">LTCG</th>
          <th className="py-1.5 text-right font-medium">Est. Tax</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--gridline)]">
        {data.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">No data for this selection.</td></tr>}
        {data.map((r) => (
          <tr key={r.folioId}>
            <td className="py-1.5 pr-4 text-ink-secondary">
              {r.folioNumber} · {r.schemeName ?? "—"}
              {r.grandfatheringNote && !r.grandfatheringApplied && (
                <span
                  className="ml-1.5 rounded bg-status-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-status-warning"
                  title="Includes a lot purchased before Jan 31, 2018 — grandfathering not applied (no backfilled 2018-01-31 NAV for this scheme yet), gain overstated for that lot"
                >
                  pre-2018 lot
                </span>
              )}
              {r.grandfatheringApplied && (
                <span
                  className="ml-1.5 rounded bg-status-good/15 px-1.5 py-0.5 text-[10px] font-medium text-status-good"
                  title="Grandfathering cost-basis floor applied using the real Jan 31, 2018 AMFI NAV"
                >
                  grandfathered
                </span>
              )}
              {r.valuationSource === "LIVE_NAV" && (
                <span className="ml-1.5 rounded bg-series-6/15 px-1.5 py-0.5 text-[10px] font-medium text-series-6" title="Current value uses today's live AMFI NAV">
                  live NAV
                </span>
              )}
              {r.hasIncompleteHistory && (
                <span
                  className="ml-1.5 rounded bg-status-critical/15 px-1.5 py-0.5 text-[10px] font-medium text-status-critical"
                  title={`No matching purchase found in the ingested transaction history for at least one sale — ₹${r.incompleteHistoryGain} of the gain shown is a placeholder (100% gain, STCG), not necessarily correct. Will resolve once since-inception import captures this folio's full history.`}
                >
                  history gap
                </span>
              )}
            </td>
            <td className="py-1.5 pr-4 text-ink-secondary">{r.taxCategory === "EQUITY" ? "Equity" : "Debt / Other"}</td>
            <td className={`py-1.5 pr-4 text-right tabular-nums ${Number(r.stcgGain) >= 0 ? "text-status-good" : "text-status-critical"}`}>
              <Amount value={r.stcgGain} />
            </td>
            <td className={`py-1.5 pr-4 text-right tabular-nums ${Number(r.ltcgGain) >= 0 ? "text-status-good" : "text-status-critical"}`}>
              <Amount value={r.ltcgGain} />
            </td>
            <td className="py-1.5 text-right tabular-nums text-ink">
              {r.estimatedTax !== null ? <Amount value={r.estimatedTax} /> : <span className="text-ink-muted" title="Taxed at your income slab rate — not computable here">at slab rate</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One row per FIFO lot — the line-by-line detail an actual ITR Schedule 112A/CG filing needs, not a folio-level summary. */
export function CapitalGainsLotDetailTable({ data, notional }: { data: CapitalGainLotRow[]; notional: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-ink-secondary">
          <th className="py-1.5 pr-4 font-medium">Folio / Scheme</th>
          <th className="py-1.5 pr-4 font-medium">Acquisition Date</th>
          {!notional && <th className="py-1.5 pr-4 font-medium">Sale Date</th>}
          <th className="py-1.5 pr-4 text-right font-medium">Units</th>
          <th className="py-1.5 pr-4 text-right font-medium">Cost</th>
          <th className="py-1.5 pr-4 text-right font-medium">{notional ? "Current Value" : "Sale Value"}</th>
          <th className="py-1.5 pr-4 text-right font-medium">Gain/Loss</th>
          <th className="py-1.5 pr-4 font-medium">Holding (days)</th>
          <th className="py-1.5 pr-4 font-medium">Type</th>
          <th className="py-1.5 text-right font-medium">Est. Tax</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--gridline)]">
        {data.length === 0 && <tr><td colSpan={10} className="py-4 text-center text-ink-muted">No data for this selection.</td></tr>}
        {data.map((r, i) => (
          <tr key={`${r.folioId}-${i}`}>
            <td className="py-1.5 pr-4 text-ink-secondary">
              {r.folioNumber} · {r.schemeName ?? "—"}
              {r.grandfatheringApplied && (
                <span className="ml-1.5 rounded bg-status-good/15 px-1.5 py-0.5 text-[10px] font-medium text-status-good" title="Grandfathering cost-basis floor applied (real Jan 31, 2018 AMFI NAV)">
                  grandfathered
                </span>
              )}
              {r.costBasisUnknown && (
                <span
                  className="ml-1.5 rounded bg-status-critical/15 px-1.5 py-0.5 text-[10px] font-medium text-status-critical"
                  title="No matching purchase found in the ingested transaction history — cost/holding period/classification here is a placeholder, not necessarily correct. Will resolve once since-inception import captures this folio's full history."
                >
                  no purchase found
                </span>
              )}
            </td>
            <td className="py-1.5 pr-4 text-ink-secondary">{formatDate(r.purchaseDate)}</td>
            {!notional && <td className="py-1.5 pr-4 text-ink-secondary">{r.saleDate ? formatDate(r.saleDate) : "—"}</td>}
            <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{r.units}</td>
            <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary"><Amount value={r.costBasis} /></td>
            <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary"><Amount value={r.saleProceeds} /></td>
            <td className={`py-1.5 pr-4 text-right tabular-nums ${Number(r.gain) >= 0 ? "text-status-good" : "text-status-critical"}`}>
              <Amount value={r.gain} />
            </td>
            <td className="py-1.5 pr-4 text-ink-secondary">{r.holdingDays}</td>
            <td className="py-1.5 pr-4 text-ink-secondary">{r.classification}</td>
            <td className="py-1.5 text-right tabular-nums text-ink">
              {r.estimatedTax !== null ? <Amount value={r.estimatedTax} /> : <span className="text-ink-muted" title="Taxed at your income slab rate — not computable here">at slab rate</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
