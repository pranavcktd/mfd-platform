import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { Card } from "../components/ui/Card";
import { PrintableModal } from "../components/ui/PrintableModal";
import { PageLoading } from "../components/ui/PageLoading";
import { CapitalGainsResultsTable, CapitalGainsLotDetailTable } from "../components/holdings/CapitalGainsTables";
import {
  useClientPortalCapitalGains,
  useClientPortalCapitalGainsDetail,
  useClientPortalTransactionDateRange,
} from "../hooks/useClientPortal";
import { financialYearOptions } from "../lib/financial-year";
import { downloadCsv, downloadXlsx } from "../lib/export";
import { formatDate } from "../lib/format";
import type { CapitalGainRow, CapitalGainLotRow } from "../lib/holdings-types";

/**
 * Client-portal counterpart to ReportsPage.tsx's CapitalGainsTab — same
 * underlying data (both call ClientPortalService.getMyCapitalGains, which
 * reuses ReportsService's real FIFO/tax engine directly), but simpler:
 * no client picker (always "yourself"), no ARN filter (a client isn't
 * ARN-scoped).
 */
export function ClientPortalCapitalGainsPage() {
  const [realized, setRealized] = useState(true);
  const [fyKey, setFyKey] = useState<string>("all");
  const [generated, setGenerated] = useState(false);
  const [viewMode, setViewMode] = useState<"summary" | "detail">("summary");
  const [pdfOpen, setPdfOpen] = useState(false);

  const { data: dateRange, isLoading: dateRangeLoading } = useClientPortalTransactionDateRange();
  const fyOptions = useMemo(() => financialYearOptions(dateRange?.minDate, dateRange?.maxDate), [dateRange]);
  const selectedFy = fyOptions.find((f) => f.key === fyKey);

  const filters = {
    type: (realized ? "realized" : "notional") as "realized" | "notional",
    fyStartDate: realized ? selectedFy?.startDate : undefined,
    fyEndDate: realized ? selectedFy?.endDate : undefined,
  };
  const summary = useClientPortalCapitalGains(filters, generated && viewMode === "summary");
  const detail = useClientPortalCapitalGainsDetail(filters, generated && viewMode === "detail");
  const { data, isLoading, isFetching } = viewMode === "summary" ? summary : detail;

  const reportTitle = realized ? "Capital Gain Report (Realized)" : "Notional (Unrealized) Capital Gain Report";
  const exportBaseName = `${realized ? "realized" : "notional"}-capital-gains-${viewMode}${realized && selectedFy ? `-FY${selectedFy.key}` : ""}`;

  function exportCsv() {
    if (!data) return;
    if (viewMode === "summary") {
      const rows = data as CapitalGainRow[];
      downloadCsv(
        `${exportBaseName}.csv`,
        ["Folio", "Scheme", "Category", "STCG", "LTCG", "Estimated Tax", "Grandfathering Applied", "History Gap"],
        rows.map((r) => [r.folioNumber, r.schemeName ?? "", r.taxCategory, r.stcgGain, r.ltcgGain, r.estimatedTax ?? "at slab rate", r.grandfatheringApplied ? "Yes" : "No", r.hasIncompleteHistory ? `Yes (₹${r.incompleteHistoryGain})` : "No"]),
      );
    } else {
      const rows = data as CapitalGainLotRow[];
      downloadCsv(
        `${exportBaseName}.csv`,
        ["Folio", "Scheme", "Category", "Acquisition Date", "Sale Date", "Units", "Cost", realized ? "Sale Value" : "Current Value", "Gain/Loss", "Holding Days", "Type", "Estimated Tax", "Grandfathering Applied", "No Purchase Found"],
        rows.map((r) => [
          r.folioNumber, r.schemeName ?? "", r.taxCategory, formatDate(r.purchaseDate), r.saleDate ? formatDate(r.saleDate) : "",
          r.units, r.costBasis, r.saleProceeds, r.gain, r.holdingDays, r.classification, r.estimatedTax ?? "at slab rate", r.grandfatheringApplied ? "Yes" : "No", r.costBasisUnknown ? "Yes" : "No",
        ]),
      );
    }
  }
  function exportXlsx() {
    if (!data) return;
    if (viewMode === "summary") {
      const rows = data as CapitalGainRow[];
      downloadXlsx(
        `${exportBaseName}.xlsx`,
        "Capital Gains",
        ["Folio", "Scheme", "Category", "STCG", "LTCG", "Estimated Tax", "Grandfathering Applied", "History Gap"],
        rows.map((r) => [r.folioNumber, r.schemeName ?? "", r.taxCategory, r.stcgGain, r.ltcgGain, r.estimatedTax ?? "at slab rate", r.grandfatheringApplied ? "Yes" : "No", r.hasIncompleteHistory ? `Yes (₹${r.incompleteHistoryGain})` : "No"]),
      );
    } else {
      const rows = data as CapitalGainLotRow[];
      downloadXlsx(
        `${exportBaseName}.xlsx`,
        "Capital Gains Detail",
        ["Folio", "Scheme", "Category", "Acquisition Date", "Sale Date", "Units", "Cost", realized ? "Sale Value" : "Current Value", "Gain/Loss", "Holding Days", "Type", "Estimated Tax", "Grandfathering Applied", "No Purchase Found"],
        rows.map((r) => [
          r.folioNumber, r.schemeName ?? "", r.taxCategory, formatDate(r.purchaseDate), r.saleDate ? formatDate(r.saleDate) : "",
          r.units, r.costBasis, r.saleProceeds, r.gain, r.holdingDays, r.classification, r.estimatedTax ?? "at slab rate", r.grandfatheringApplied ? "Yes" : "No", r.costBasisUnknown ? "Yes" : "No",
        ]),
      );
    }
  }

  if (dateRangeLoading) {
    return <PageLoading />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Capital Gains</h1>
        <p className="text-sm text-ink-secondary">Realized and unrealized gains across every folio, FIFO-matched lot by lot.</p>
      </div>

      <Card title={reportTitle}>
        <div className="mb-3 rounded-md border border-status-warning/30 bg-status-warning/5 p-2.5 text-xs text-ink-secondary">
          <p className="font-medium text-ink">Best-effort estimate — not a tax-filing document.</p>
          <p className="mt-1">
            Uses real FIFO lot matching and current STCG/LTCG rates. Equity units bought before Jan 31, 2018 get the
            Section 112A grandfathering cost-basis floor wherever a real backfilled Jan 31, 2018 AMFI NAV exists for
            that scheme (marked "grandfathered"). Debt-fund gains are taxed at your income slab rate, which this
            platform doesn't know — shown as gain only. The ₹1.25L/year equity LTCG exemption is not netted out (an
            annual, cross-folio concept). "Transaction-wise Detail" is the line-by-line lot breakdown actually needed
            for return filing — "Summary" is just a quick per-folio overview.
            {!realized && " Financial year doesn't apply here — this shows the current unrealized position as of today."}
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Type</label>
            <div className="flex rounded-md border border-[var(--border)] text-sm">
              <button
                onClick={() => { setRealized(true); setGenerated(false); }}
                className={`rounded-l-md px-3 py-1.5 font-medium ${realized ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
              >
                Realized
              </button>
              <button
                onClick={() => { setRealized(false); setGenerated(false); }}
                className={`rounded-r-md px-3 py-1.5 font-medium ${!realized ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
              >
                Notional (Unrealized)
              </button>
            </div>
          </div>
          {realized && (
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">Financial Year</label>
              <select
                value={fyKey}
                onChange={(e) => { setFyKey(e.target.value); setGenerated(false); }}
                className="rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm text-ink"
              >
                <option value="all">All available data</option>
                {fyOptions.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">View</label>
            <div className="flex rounded-md border border-[var(--border)] text-sm">
              <button
                onClick={() => setViewMode("summary")}
                className={`rounded-l-md px-3 py-1.5 font-medium ${viewMode === "summary" ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
              >
                Summary
              </button>
              <button
                onClick={() => setViewMode("detail")}
                className={`rounded-r-md px-3 py-1.5 font-medium ${viewMode === "detail" ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
              >
                Transaction-wise Detail
              </button>
            </div>
          </div>
          <button
            onClick={() => setGenerated(true)}
            disabled={isFetching}
            className="rounded-md bg-series-1 px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isFetching ? "Generating…" : "Generate Report"}
          </button>

          {generated && data && data.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
                <Download size={13} /> CSV
              </button>
              <button onClick={exportXlsx} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button onClick={() => setPdfOpen(true)} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
                <Printer size={13} /> PDF
              </button>
            </div>
          )}
        </div>

        {!generated && <p className="py-6 text-center text-sm text-ink-muted">Choose a financial year (or all available data) and click Generate Report.</p>}
        {generated && data && data.length > 0 && (() => {
          const incompleteRows = viewMode === "summary" ? (data as CapitalGainRow[]).filter((r) => r.hasIncompleteHistory) : [];
          const incompleteLotCount = viewMode === "detail" ? (data as CapitalGainLotRow[]).filter((r) => r.costBasisUnknown).length : 0;
          if (incompleteRows.length === 0 && incompleteLotCount === 0) return null;
          const incompleteGainTotal = incompleteRows.reduce((sum, r) => sum + Number(r.incompleteHistoryGain), 0);
          return (
            <div className="mb-3 rounded-md border border-status-critical/30 bg-status-critical/5 p-2.5 text-xs text-status-critical">
              {viewMode === "summary"
                ? `${incompleteRows.length} folio(s) below have at least one sale with no matching purchase in the ingested history (₹${incompleteGainTotal.toFixed(2)} of gain shown is a placeholder) — look for the "history gap" badge. These figures should be treated as provisional.`
                : `${incompleteLotCount} lot(s) below have no matching purchase in the ingested history (marked "no purchase found") — their cost/holding period/classification is a placeholder, not necessarily correct.`}
            </div>
          );
        })()}
        {generated && (
          isLoading
            ? <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
            : viewMode === "summary"
              ? <CapitalGainsResultsTable data={(data as CapitalGainRow[]) ?? []} />
              : <CapitalGainsLotDetailTable data={(data as CapitalGainLotRow[]) ?? []} notional={!realized} />
        )}

        {pdfOpen && data && (
          <PrintableModal
            title={reportTitle}
            subtitle={`${realized && selectedFy ? selectedFy.label : "All available data"} · ${viewMode === "summary" ? "Summary" : "Transaction-wise Detail"}`}
            onClose={() => setPdfOpen(false)}
          >
            {viewMode === "summary" ? (
              <CapitalGainsResultsTable data={data as CapitalGainRow[]} />
            ) : (
              <CapitalGainsLotDetailTable data={data as CapitalGainLotRow[]} notional={!realized} />
            )}
          </PrintableModal>
        )}
      </Card>
    </div>
  );
}
