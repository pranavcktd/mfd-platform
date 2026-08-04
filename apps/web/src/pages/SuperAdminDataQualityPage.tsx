import { Fragment, useState } from "react";
import { CheckCircle2, Users, Wrench } from "lucide-react";
import { Card } from "../components/ui/Card";
import {
  useDataQualitySummary,
  useDataQualityGaps,
  useDataQualitySuggestions,
  useApplyDataQualityFix,
  useBulkApplyDataQualityFix,
  type GapType,
  type DataQualityFolioRow,
  type SiblingFolio,
} from "../hooks/useSuperAdmin";

type CorrectionFields = { isin?: string; assetClass?: string; rtaType?: string };
type SiblingPrompt = { fields: CorrectionFields; siblings: SiblingFolio[] };

const GAP_TABS: Array<{ value: GapType; label: string; explain: string }> = [
  { value: "NO_ISIN", label: "No ISIN", explain: "Can't get a live NAV at all — no ISIN captured for this folio's scheme." },
  {
    value: "NO_LIVE_NAV_MATCH",
    label: "ISIN set, no live NAV",
    explain: "Has an ISIN, but no scheme with that ISIN is known yet (or AMFI hasn't priced it today).",
  },
  { value: "NO_RTA_TYPE", label: "No RTA identified", explain: "Neither CAMS nor KFintech could be determined for this folio — blocks every RTA-specific enrichment." },
  { value: "NO_ASSET_CLASS", label: "No asset class", explain: "Equity vs Debt/Other is unknown — affects capital-gains tax classification (STCG/LTCG thresholds, rates)." },
];

function Amount({ value }: { value: string | null }) {
  const n = value ? Number(value) : 0;
  return <>₹{n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</>;
}

const ASSET_CLASS_OPTIONS = ["EQUITY", "ELSS", "DEBT", "HYBRID", "LIQUID", "INDEX", "FOF"];

/**
 * Rendered by the PARENT, not inside the fixed row — a successful fix
 * invalidates the gap list query, which removes that row from the table
 * (it no longer has the gap) almost immediately. When this banner used to
 * live inside that row's own Fragment, the row's removal from `rows`
 * unmounted the banner before anyone could see or click "Fix all" — a real
 * bug, not just a caching quirk. Living at the page level means it survives
 * the list refresh regardless of whether the original row is still shown.
 */
function SiblingFixBanner({ prompt, onDismiss }: { prompt: SiblingPrompt; onDismiss: () => void }) {
  const bulkApply = useBulkApplyDataQualityFix();
  const clientCount = new Set(prompt.siblings.map((s) => s.clientName)).size;

  if (bulkApply.isSuccess) {
    return (
      <div className="rounded-md border border-status-good/30 bg-status-good/5 p-3 text-xs text-status-good">
        Fixed {bulkApply.data.fixed} more folio(s) with the same scheme.
        <button onClick={onDismiss} className="ml-3 underline">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-status-warning/30 bg-status-warning/5 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <Users size={13} />
        Fixed ({Object.entries(prompt.fields).map(([k, v]) => `${k}: ${v}`).join(", ")}). Found {prompt.siblings.length}{" "}
        other folio(s) across {clientCount} client(s) with this same scheme and the same issue — this scheme is also
        remembered for future ingestion.
      </p>
      <p className="mt-1 max-h-20 overflow-y-auto text-ink-muted">
        {prompt.siblings.map((s) => `${s.clientName} (${s.distributorName})`).join(", ")}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => bulkApply.mutate({ folioIds: prompt.siblings.map((s) => s.id), fields: prompt.fields })}
          disabled={bulkApply.isPending}
          className="rounded-md bg-series-1 px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {bulkApply.isPending ? "Fixing…" : `Fix all ${prompt.siblings.length}`}
        </button>
        <button
          onClick={onDismiss}
          className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-ink-secondary hover:bg-[var(--gridline)]/50"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

function FixPanel({
  row,
  gapType,
  onFixed,
}: {
  row: DataQualityFolioRow;
  gapType: GapType;
  onFixed: (result: { appliedFields: CorrectionFields; siblingFolios: SiblingFolio[] }) => void;
}) {
  const { data: suggestions, isLoading: suggestionsLoading } = useDataQualitySuggestions(
    gapType === "NO_ISIN" || gapType === "NO_LIVE_NAV_MATCH" ? row.id : null,
  );
  const applyFix = useApplyDataQualityFix();
  const [manualIsin, setManualIsin] = useState("");
  const [rtaType, setRtaType] = useState<string>("");
  const [assetClass, setAssetClass] = useState<string>("");

  function apply(fields: CorrectionFields) {
    applyFix.mutate(
      { folioId: row.id, fields },
      { onSuccess: (result) => onFixed({ appliedFields: result.appliedFields, siblingFolios: result.siblingFolios }) },
    );
  }

  return (
    <tr>
      <td colSpan={7} className="bg-[var(--gridline)]/20 px-4 py-3">
        {(gapType === "NO_ISIN" || gapType === "NO_LIVE_NAV_MATCH") && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-secondary">Suggested matches (ranked by name/AMC similarity)</p>
            {suggestionsLoading && <p className="text-xs text-ink-muted">Searching known schemes…</p>}
            {suggestions?.length === 0 && <p className="text-xs text-ink-muted">No close match found — enter the ISIN manually below.</p>}
            <div className="space-y-1">
              {suggestions?.map((s) => (
                <div key={s.schemeMasterId} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-surface px-3 py-1.5 text-xs">
                  <div>
                    <span className="font-medium text-ink">{s.schemeName}</span>
                    <span className="ml-2 text-ink-muted">{s.amcName ?? s.amcCode} · ISIN {s.isin} · NAV {s.latestNav ?? "—"} · match {(s.score * 100).toFixed(0)}%</span>
                  </div>
                  <button
                    onClick={() => apply({ isin: s.isin! })}
                    disabled={applyFix.isPending}
                    className="shrink-0 rounded-md bg-series-1 px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Use this
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder="Or type the ISIN manually (e.g. INF204K01HY3)"
                value={manualIsin}
                onChange={(e) => setManualIsin(e.target.value.toUpperCase())}
                className="w-72 rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-xs text-ink"
              />
              <button
                onClick={() => apply({ isin: manualIsin })}
                disabled={!manualIsin || applyFix.isPending}
                className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-ink-secondary hover:bg-[var(--gridline)]/50 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {gapType === "NO_RTA_TYPE" && (
          <div className="flex items-center gap-2">
            <select value={rtaType} onChange={(e) => setRtaType(e.target.value)} className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-xs text-ink">
              <option value="">Select RTA…</option>
              <option value="CAMS">CAMS</option>
              <option value="KFINTECH">KFintech</option>
            </select>
            <button
              onClick={() => apply({ rtaType })}
              disabled={!rtaType || applyFix.isPending}
              className="rounded-md bg-series-1 px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        )}

        {gapType === "NO_ASSET_CLASS" && (
          <div className="flex items-center gap-2">
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)} className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-xs text-ink">
              <option value="">Select asset class…</option>
              {ASSET_CLASS_OPTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <button
              onClick={() => apply({ assetClass })}
              disabled={!assetClass || applyFix.isPending}
              className="rounded-md bg-series-1 px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function SuperAdminDataQualityPage() {
  const [gapType, setGapType] = useState<GapType>("NO_ISIN");
  const [openFolioId, setOpenFolioId] = useState<string | null>(null);
  const [siblingPrompt, setSiblingPrompt] = useState<SiblingPrompt | null>(null);
  const { data: summary } = useDataQualitySummary();
  const { data: rows, isLoading } = useDataQualityGaps(gapType);

  const countFor = (g: GapType) => summary?.find((s) => s.gapType === g)?.count ?? 0;

  function handleFixed(result: { appliedFields: CorrectionFields; siblingFolios: SiblingFolio[] }) {
    setOpenFolioId(null);
    if (result.siblingFolios.length > 0) {
      setSiblingPrompt({ fields: result.appliedFields, siblings: result.siblingFolios });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Data Quality</h1>
        <p className="text-sm text-ink-secondary">
          Real gaps in RTA-sourced data that block live NAV valuation or correct tax classification — fix them here
          instead of waiting for the next ingestion run to (maybe) resolve them automatically. Suggestions are ranked
          by scheme-name + AMC similarity against every known scheme; a manual entry always overrides the automated
          pipeline going forward.
        </p>
      </div>

      {siblingPrompt && <SiblingFixBanner prompt={siblingPrompt} onDismiss={() => setSiblingPrompt(null)} />}

      <div className="grid grid-cols-4 gap-4">
        {GAP_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setGapType(t.value)}
            className={`rounded-lg border p-4 text-left transition-colors ${
              gapType === t.value ? "border-series-1 bg-series-1/5" : "border-[var(--border)] bg-surface hover:bg-[var(--gridline)]/30"
            }`}
          >
            <p className="text-xs text-ink-secondary">{t.label}</p>
            <p className="mt-1 text-xl font-semibold text-ink">{countFor(t.value)}</p>
          </button>
        ))}
      </div>

      <Card title={GAP_TABS.find((t) => t.value === gapType)?.label ?? ""}>
        <p className="mb-3 text-xs text-ink-muted">{GAP_TABS.find((t) => t.value === gapType)?.explain}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-secondary">
              <th className="py-1.5 pr-4 font-medium">MFD</th>
              <th className="py-1.5 pr-4 font-medium">Client</th>
              <th className="py-1.5 pr-4 font-medium">Folio / Scheme</th>
              <th className="py-1.5 pr-4 font-medium">AMC Code</th>
              <th className="py-1.5 pr-4 text-right font-medium">Units</th>
              <th className="py-1.5 pr-4 text-right font-medium">Value</th>
              <th className="py-1.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {isLoading && <tr><td colSpan={7} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-status-good">
                  <CheckCircle2 className="mx-auto mb-1" size={18} />
                  No gaps of this type — fully clean.
                </td>
              </tr>
            )}
            {rows?.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <td className="py-1.5 pr-4 text-ink-secondary">{row.distributorName}</td>
                  <td className="py-1.5 pr-4 text-ink">{row.clientName}</td>
                  <td className="py-1.5 pr-4 text-ink-secondary">
                    {row.folioNumber} · {row.schemeName ?? "—"}
                  </td>
                  <td className="py-1.5 pr-4 text-ink-secondary">{row.amcCode}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{row.balanceUnits ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink">
                    <Amount value={row.valuationAmount} />
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      onClick={() => setOpenFolioId(openFolioId === row.id ? null : row.id)}
                      className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50"
                    >
                      <Wrench size={12} />
                      {openFolioId === row.id ? "Close" : "Fix"}
                    </button>
                  </td>
                </tr>
                {openFolioId === row.id && <FixPanel row={row} gapType={gapType} onFixed={handleFixed} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
