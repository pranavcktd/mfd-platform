import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Search, X, Download, FileSpreadsheet, Printer } from "lucide-react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import {
  useAumReport,
  useBrokerageWithheldReport,
  useBusinessDevelopmentReport,
  useCapitalGainsReport,
  useCapitalGainsDetailReport,
  useCasReport,
  useClientReturnsReport,
  useClientTransactionDateRange,
  useDividendReport,
  useFamilyAllocationReport,
  useNetWorthReport,
  useSipDueReport,
  useSipExpiringReport,
  useSipReport,
  useSipStpExpiringCamsReport,
  useStpReport,
  useSwpReport,
  useTransactionSummaryReport,
  useTransactionsReport,
  type CapitalGainRow,
  type CapitalGainLotRow,
  type ClientReturnRow,
} from "../hooks/useReports";
import { useArnProfiles } from "../hooks/useDashboard";
import { useClientList, useClientDetail, useFolioTransactions, type ClientFolio } from "../hooks/useCrm";
import { FolioHoldingsExplorer } from "../components/holdings/FolioHoldingsExplorer";
import { Amount } from "../components/ui/Amount";
import { Pager } from "../components/ui/Pager";
import { ArnFilter } from "../components/ui/ArnFilter";
import { SearchBox } from "../components/ui/SearchBox";
import { PrintableModal } from "../components/ui/PrintableModal";
import { downloadCsv, downloadXlsx } from "../lib/export";
import { formatCount, formatDate } from "../lib/format";

type Section = "client" | "distributor";
type ClientTab = "capital-gains" | "notional-gains" | "holdings" | "net-worth" | "family-allocation" | "valuation" | "cas";
type DistributorTab =
  | "aum" | "business-development" | "dividend" | "sip-addition" | "sip-bounced" | "sip-ceased"
  | "sip-due" | "sip-expiring" | "sip-stp-expiring-cams" | "stp" | "swp" | "brokerage-withheld"
  | "transactions" | "transaction-summary" | "client-returns";

const CLIENT_TABS: Array<{ id: ClientTab; label: string }> = [
  { id: "capital-gains", label: "Capital Gain Report" },
  { id: "holdings", label: "Client Holding Report" },
  { id: "net-worth", label: "Client Net Worth Report" },
  { id: "family-allocation", label: "Family Wise Allocation Report" },
  { id: "valuation", label: "Portfolio Valuation Report" },
  { id: "notional-gains", label: "Notional Capital Gain Report" },
  { id: "cas", label: "CAS Report" },
];

const DISTRIBUTOR_TABS: Array<{ id: DistributorTab; label: string }> = [
  { id: "aum", label: "AUM Report" },
  { id: "business-development", label: "Business Development Report" },
  { id: "dividend", label: "Dividend Report" },
  { id: "sip-addition", label: "SIP Addition Report" },
  { id: "sip-bounced", label: "SIP Bounced Report" },
  { id: "sip-ceased", label: "SIP Ceased Report" },
  { id: "sip-due", label: "SIP Due Report" },
  { id: "sip-expiring", label: "SIP Expiring Report" },
  { id: "sip-stp-expiring-cams", label: "SIP/STP Expiring (CAMS)" },
  { id: "stp", label: "STP Report" },
  { id: "swp", label: "SWP Report" },
  { id: "brokerage-withheld", label: "Brokerage Withheld" },
  { id: "transactions", label: "Transaction Report" },
  { id: "transaction-summary", label: "Transaction Summary Report" },
  { id: "client-returns", label: "Client Returns" },
];

function NotAvailableCard({ title, reason }: { title: string; reason: string }) {
  return (
    <Card title={title}>
      <p className="text-sm text-ink-muted">{reason}</p>
    </Card>
  );
}

interface TabProps {
  arnIds: string[];
}

// --- Client reports ---

interface FinancialYearOption {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
}

/** April 1 - March 31 — only offers FYs that actually overlap the client's real transaction history, not a fixed hardcoded list. */
function financialYearOptions(minDate: string | null | undefined, maxDate: string | null | undefined): FinancialYearOption[] {
  if (!minDate || !maxDate) return [];
  const min = new Date(minDate);
  const max = new Date(maxDate);
  const fyStartYear = (d: Date) => (d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1);
  const minYear = fyStartYear(min);
  const maxYear = fyStartYear(max);
  const options: FinancialYearOption[] = [];
  for (let y = maxYear; y >= minYear; y--) {
    options.push({
      key: String(y),
      label: `FY ${y}-${String(y + 1).slice(2)}`,
      startDate: `${y}-04-01`,
      endDate: `${y + 1}-03-31`,
    });
  }
  return options;
}

function ClientPicker({
  clientId,
  clientName,
  onSelect,
  onClear,
}: {
  clientId: string | null;
  clientName: string | null;
  onSelect: (id: string, name: string) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useClientList(search, 1);
  const results = search.length >= 2 ? data?.clients ?? [] : [];

  if (clientId && clientName) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-page px-3 py-1.5 text-sm">
        <span className="text-ink">{clientName}</span>
        <button onClick={onClear} className="text-ink-muted hover:text-ink" aria-label="Clear selected client">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-72">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search client by name, PAN, email…"
        className="w-full rounded-md border border-[var(--border)] bg-surface py-1.5 pl-8 pr-3 text-sm text-ink outline-none focus:border-series-1"
      />
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-[var(--border)] bg-surface shadow-lg">
          {results.map((c) => (
            <button
              key={c.id}
              onMouseDown={() => onSelect(c.id, c.name)}
              className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-[var(--gridline)]/50"
            >
              {c.name}
              {c.panNumber && <span className="ml-2 text-xs text-ink-muted">{c.panNumber}</span>}
            </button>
          ))}
        </div>
      )}
      {open && search.length >= 2 && results.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-[var(--border)] bg-surface p-3 text-xs text-ink-muted shadow-lg">
          No clients match "{search}".
        </div>
      )}
    </div>
  );
}

function CapitalGainsResultsTable({ data }: { data: CapitalGainRow[] }) {
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
function CapitalGainsLotDetailTable({ data, notional }: { data: CapitalGainLotRow[]; notional: boolean }) {
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

function CapitalGainsTab({ notional, arnIds }: { notional: boolean } & TabProps) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [fyKey, setFyKey] = useState<string>("all");
  const [generated, setGenerated] = useState(false);
  const [viewMode, setViewMode] = useState<"summary" | "detail">("detail");
  const [pdfOpen, setPdfOpen] = useState(false);

  const { data: dateRange } = useClientTransactionDateRange(clientId ?? undefined);
  const fyOptions = useMemo(() => financialYearOptions(dateRange?.minDate, dateRange?.maxDate), [dateRange]);
  const selectedFy = fyOptions.find((f) => f.key === fyKey);

  const filters = {
    type: (notional ? "notional" : "realized") as "realized" | "notional",
    clientId: clientId ?? undefined,
    arnProfileIds: arnIds,
    fyStartDate: !notional ? selectedFy?.startDate : undefined,
    fyEndDate: !notional ? selectedFy?.endDate : undefined,
  };
  const shouldFetch = generated && !!clientId;
  const summary = useCapitalGainsReport(filters, shouldFetch && viewMode === "summary");
  const detail = useCapitalGainsDetailReport(filters, shouldFetch && viewMode === "detail");
  const { data, isLoading, isFetching } = viewMode === "summary" ? summary : detail;

  function handleClientSelect(id: string, name: string) {
    setClientId(id);
    setClientName(name);
    setFyKey("all");
    setGenerated(false);
  }
  function handleClientClear() {
    setClientId(null);
    setClientName(null);
    setGenerated(false);
  }

  const reportTitle = notional ? "Notional (Unrealized) Capital Gain Report" : "Capital Gain Report (Realized)";
  const exportBaseName = `${notional ? "notional" : "realized"}-capital-gains-${viewMode}-${clientName?.replace(/\s+/g, "_") ?? "report"}${!notional && selectedFy ? `-FY${selectedFy.key}` : ""}`;

  function exportCsv() {
    if (!data) return;
    if (viewMode === "summary") {
      const rows = data as CapitalGainRow[];
      downloadCsv(
        `${exportBaseName}.csv`,
        ["Folio", "Scheme", "Category", "STCG", "LTCG", "Estimated Tax", "Grandfathering Applied"],
        rows.map((r) => [r.folioNumber, r.schemeName ?? "", r.taxCategory, r.stcgGain, r.ltcgGain, r.estimatedTax ?? "at slab rate", r.grandfatheringApplied ? "Yes" : "No"]),
      );
    } else {
      const rows = data as CapitalGainLotRow[];
      downloadCsv(
        `${exportBaseName}.csv`,
        ["Folio", "Scheme", "Category", "Acquisition Date", "Sale Date", "Units", "Cost", notional ? "Current Value" : "Sale Value", "Gain/Loss", "Holding Days", "Type", "Estimated Tax", "Grandfathering Applied"],
        rows.map((r) => [
          r.folioNumber, r.schemeName ?? "", r.taxCategory, formatDate(r.purchaseDate), r.saleDate ? formatDate(r.saleDate) : "",
          r.units, r.costBasis, r.saleProceeds, r.gain, r.holdingDays, r.classification, r.estimatedTax ?? "at slab rate", r.grandfatheringApplied ? "Yes" : "No",
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
        ["Folio", "Scheme", "Category", "STCG", "LTCG", "Estimated Tax", "Grandfathering Applied"],
        rows.map((r) => [r.folioNumber, r.schemeName ?? "", r.taxCategory, r.stcgGain, r.ltcgGain, r.estimatedTax ?? "at slab rate", r.grandfatheringApplied ? "Yes" : "No"]),
      );
    } else {
      const rows = data as CapitalGainLotRow[];
      downloadXlsx(
        `${exportBaseName}.xlsx`,
        "Capital Gains Detail",
        ["Folio", "Scheme", "Category", "Acquisition Date", "Sale Date", "Units", "Cost", notional ? "Current Value" : "Sale Value", "Gain/Loss", "Holding Days", "Type", "Estimated Tax", "Grandfathering Applied"],
        rows.map((r) => [
          r.folioNumber, r.schemeName ?? "", r.taxCategory, formatDate(r.purchaseDate), r.saleDate ? formatDate(r.saleDate) : "",
          r.units, r.costBasis, r.saleProceeds, r.gain, r.holdingDays, r.classification, r.estimatedTax ?? "at slab rate", r.grandfatheringApplied ? "Yes" : "No",
        ]),
      );
    }
  }

  return (
    <Card title={reportTitle}>
      <div className="mb-3 rounded-md border border-status-warning/30 bg-status-warning/5 p-2.5 text-xs text-ink-secondary">
        <p className="font-medium text-ink">Best-effort estimate — not a tax-filing document.</p>
        <p className="mt-1">
          Uses real FIFO lot matching and current (FY2025-26/26-27) STCG/LTCG rates. Equity units bought before Jan
          31, 2018 get the Section 112A grandfathering cost-basis floor wherever a real backfilled Jan 31, 2018 AMFI
          NAV exists for that scheme (marked "grandfathered"). Debt-fund gains are taxed at your income slab rate,
          which this platform doesn't know — shown as gain only. The ₹1.25L/year equity LTCG exemption is not netted
          out (an annual, cross-folio concept). "Transaction-wise Detail" is the line-by-line lot breakdown (dates,
          holding period, cost, sale value per lot) actually needed for return filing — "Summary" is just a quick
          per-folio overview.
          {notional && " Financial year doesn't apply here — this shows the current unrealized position as of today."}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-secondary">Client</label>
          <ClientPicker clientId={clientId} clientName={clientName} onSelect={handleClientSelect} onClear={handleClientClear} />
        </div>
        {!notional && (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Financial Year</label>
            <select
              value={fyKey}
              onChange={(e) => { setFyKey(e.target.value); setGenerated(false); }}
              disabled={!clientId}
              className="rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-sm text-ink disabled:opacity-50"
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
          disabled={!clientId || isFetching}
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

      {!clientId && <p className="py-6 text-center text-sm text-ink-muted">Select a client to generate their capital gains report.</p>}
      {clientId && !generated && <p className="py-6 text-center text-sm text-ink-muted">Choose a financial year (or all available data) and click Generate Report.</p>}
      {clientId && generated && (
        isLoading
          ? <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
          : viewMode === "summary"
            ? <CapitalGainsResultsTable data={(data as CapitalGainRow[]) ?? []} />
            : <CapitalGainsLotDetailTable data={(data as CapitalGainLotRow[]) ?? []} notional={notional} />
      )}

      {pdfOpen && data && (
        <PrintableModal
          title={reportTitle}
          subtitle={`${clientName ?? ""}${!notional && selectedFy ? ` · ${selectedFy.label}` : ""} · ${viewMode === "summary" ? "Summary" : "Transaction-wise Detail"}`}
          onClose={() => setPdfOpen(false)}
        >
          {viewMode === "summary" ? (
            <CapitalGainsResultsTable data={data as CapitalGainRow[]} />
          ) : (
            <CapitalGainsLotDetailTable data={data as CapitalGainLotRow[]} notional={notional} />
          )}
        </PrintableModal>
      )}
    </Card>
  );
}

/** Flat, sorted, print/export-friendly folio list shared by the Holdings and Valuation report redesigns. */
function FolioExportTable({ folios }: { folios: ClientFolio[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-ink-secondary">
          <th className="py-1.5 pr-4 font-medium">AMC</th>
          <th className="py-1.5 pr-4 font-medium">Folio</th>
          <th className="py-1.5 pr-4 font-medium">Scheme</th>
          <th className="py-1.5 pr-4 text-right font-medium">Units</th>
          <th className="py-1.5 pr-4 text-right font-medium">NAV</th>
          <th className="py-1.5 pr-4 text-right font-medium">Invested</th>
          <th className="py-1.5 text-right font-medium">Current Value</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--gridline)]">
        {folios.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-ink-muted">No folios.</td></tr>}
        {folios.map((f) => (
          <tr key={f.id}>
            <td className="py-1.5 pr-4 text-ink-secondary">{f.amcName}</td>
            <td className="py-1.5 pr-4 text-ink-secondary">{f.folioNumber}</td>
            <td className="py-1.5 pr-4 text-ink-secondary">{f.schemeName ?? `${f.amcCode}/${f.schemeCode}`}</td>
            <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{f.balanceUnits ?? "—"}</td>
            <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{f.navPerUnit ?? "—"}</td>
            <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary"><Amount value={f.investedAmount} /></td>
            <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={f.valuationAmount} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Per-client folio explorer shared by the Client Holding Report and Portfolio
 * Valuation Report tabs — both need the same "pick a client, drill AMC-wise
 * then scheme-wise, export/print" shape, reusing the exact AMC-wise
 * collapsible component already proven on the CRM client-detail page rather
 * than inventing a second accordion.
 */
function ClientFolioExplorerSection({
  title,
  description,
  exportBaseName,
  printSheetName,
}: {
  title: string;
  description: string;
  exportBaseName: string;
  printSheetName: string;
}) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const { data, isLoading } = useClientDetail(clientId ?? undefined);

  function handleSelect(id: string, name: string) {
    setClientId(id);
    setClientName(name);
  }
  function handleClear() {
    setClientId(null);
    setClientName(null);
  }

  const exportRows = useMemo(
    () => [...(data?.folios ?? [])].sort((a, b) => a.amcName.localeCompare(b.amcName) || (a.schemeName ?? "").localeCompare(b.schemeName ?? "")),
    [data],
  );
  const fileBase = `${exportBaseName}-${clientName?.replace(/\s+/g, "_") ?? "report"}`;
  const exportHeaders = ["AMC", "Folio", "Scheme", "Units", "NAV", "Invested", "Current Value"];
  const exportBody = () =>
    exportRows.map((f) => [
      f.amcName, f.folioNumber, f.schemeName ?? `${f.amcCode}/${f.schemeCode}`,
      f.balanceUnits ?? "", f.navPerUnit ?? "", f.investedAmount, f.valuationAmount ?? "",
    ]);

  return (
    <Card title={title}>
      <p className="mb-3 text-xs text-ink-secondary">{description}</p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-secondary">Client</label>
          <ClientPicker clientId={clientId} clientName={clientName} onSelect={handleSelect} onClear={handleClear} />
        </div>
        {clientId && data && (
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => downloadCsv(`${fileBase}.csv`, exportHeaders, exportBody())} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
              <Download size={13} /> CSV
            </button>
            <button onClick={() => downloadXlsx(`${fileBase}.xlsx`, printSheetName, exportHeaders, exportBody())} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
              <FileSpreadsheet size={13} /> Excel
            </button>
            <button onClick={() => setPdfOpen(true)} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
              <Printer size={13} /> PDF
            </button>
          </div>
        )}
      </div>

      {!clientId && <p className="py-6 text-center text-sm text-ink-muted">Select a client to view their portfolio.</p>}
      {clientId && isLoading && <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>}
      {clientId && data && (
        <FolioHoldingsExplorer folios={data.folios} useTransactions={(folioId) => useFolioTransactions(clientId, folioId)} />
      )}

      {pdfOpen && data && (
        <PrintableModal title={title} subtitle={clientName ?? ""} onClose={() => setPdfOpen(false)}>
          <FolioExportTable folios={exportRows} />
        </PrintableModal>
      )}
    </Card>
  );
}

function HoldingsTab() {
  return (
    <ClientFolioExplorerSection
      title="Client Holding Report"
      description="Select a client to see their holdings, grouped AMC-wise then scheme/folio-wise — expand a folio for its full transaction history. Export or print the flattened folio list."
      exportBaseName="holdings"
      printSheetName="Holdings"
    />
  );
}

function NetWorthTab({ arnIds }: TabProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useNetWorthReport(page, arnIds, search);
  return (
    <Card title="Client Net Worth Report">
      <div className="mb-2 flex justify-end">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search client…" />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Client</th>
            <th className="py-1.5 pr-4 text-right font-medium">MF AUM</th>
            <th className="py-1.5 pr-4 text-right font-medium">Other Assets</th>
            <th className="py-1.5 text-right font-medium">Net Worth</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={4} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.clients.map((c) => (
            <tr key={c.id}>
              <td className="py-1.5 pr-4 text-ink">{c.name}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary"><Amount value={c.mfAum} /></td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary"><Amount value={c.otherAssetsTotal} /></td>
              <td className="py-1.5 text-right tabular-nums font-medium text-ink"><Amount value={c.netWorth} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

function FamilyAllocationTab({ arnIds }: TabProps) {
  const { data, isLoading } = useFamilyAllocationReport(arnIds);
  return (
    <Card title="Family Wise Allocation Report">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Family</th>
            <th className="py-1.5 pr-4 text-right font-medium">Members</th>
            <th className="py-1.5 pr-4 text-right font-medium">AUM</th>
            <th className="py-1.5 text-right font-medium">% of Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={4} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.map((f) => (
            <tr key={f.familyId ?? "unassigned"}>
              <td className="py-1.5 pr-4 text-ink">
                {f.familyId ? <Link to="/crm/families" className="text-series-1 hover:underline">{f.familyName}</Link> : f.familyName}
              </td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{f.memberCount}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={f.aum} /></td>
              <td className="py-1.5 text-right tabular-nums text-ink-secondary">{f.percentOfTotal}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ValuationTab() {
  return (
    <ClientFolioExplorerSection
      title="Portfolio Valuation Report"
      description={
        "Select a client to see their valuation, folio-wise, with a zero/non-zero holding toggle: \"Non-Zero Holdings\" is " +
        "the current live picture (as of today), \"View All\" is the since-inception picture (includes fully-redeemed, " +
        "zero-balance folios too). Note: valuation is always the RTA's latest reported balance snapshot — no day-by-day " +
        "valuation history is stored yet, so a true point-in-time \"as on a past date\" figure isn't available."
      }
      exportBaseName="valuation"
      printSheetName="Valuation"
    />
  );
}

function CasTab({ arnIds }: TabProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useCasReport(page, arnIds);
  return (
    <Card title="CAS Report (imported external holdings)">
      <p className="mb-2 text-xs text-ink-muted">
        Folios that came from a CAS import (Import External Data), not your regular RTA mail — may include AMCs you
        don't directly service. These never carry an ARN attribution, so filtering by a specific ARN above will
        always show none here — that's expected, not a bug.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Client</th>
            <th className="py-1.5 pr-4 font-medium">AMC</th>
            <th className="py-1.5 pr-4 font-medium">Scheme</th>
            <th className="py-1.5 pr-4 text-right font-medium">Value</th>
            <th className="py-1.5 text-right font-medium">Transactions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.folios.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">No CAS-imported data yet.</td></tr>}
          {data?.folios.map((f) => (
            <tr key={f.id}>
              <td className="py-1.5 pr-4"><Link to={`/crm/${f.clientId}`} className="text-series-1 hover:underline">{f.clientName}</Link></td>
              <td className="py-1.5 pr-4 text-ink-secondary">{f.amcCode.replace(/^CAS:/, "")}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{f.schemeName}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={f.valuationAmount} /></td>
              <td className="py-1.5 text-right tabular-nums text-ink-secondary">{f.transactionCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

// --- Distributor reports ---

/** Common export toolbar (CSV/Excel/PDF print) shared mechanically across every distributor report tab, so each one only needs to supply its own flattened headers/rows. */
function ExportToolbar({
  filenameBase,
  sheetName,
  title,
  headers,
  rows,
}: {
  filenameBase: string;
  sheetName: string;
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  const [pdfOpen, setPdfOpen] = useState(false);
  if (rows.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => downloadCsv(`${filenameBase}.csv`, headers, rows)} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
        <Download size={13} /> CSV
      </button>
      <button onClick={() => downloadXlsx(`${filenameBase}.xlsx`, sheetName, headers, rows)} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
        <FileSpreadsheet size={13} /> Excel
      </button>
      <button onClick={() => setPdfOpen(true)} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
        <Printer size={13} /> PDF
      </button>
      {pdfOpen && (
        <PrintableModal title={title} onClose={() => setPdfOpen(false)}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-secondary">
                {headers.map((h) => <th key={h} className="py-1.5 pr-4 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gridline)]">
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => <td key={j} className="py-1.5 pr-4 text-ink-secondary">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </PrintableModal>
      )}
    </div>
  );
}

function AumTab({ arnIds }: TabProps) {
  const { data, isLoading } = useAumReport(arnIds);
  return (
    <Card title="AUM Report (by AMC)">
      <div className="mb-2 flex justify-end">
        <ExportToolbar
          filenameBase="aum-report"
          sheetName="AUM"
          title="AUM Report (by AMC)"
          headers={["AMC", "Folios", "AUM"]}
          rows={data?.map((r) => [r.amcName, r.folioCount, r.aum]) ?? []}
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">AMC</th>
            <th className="py-1.5 text-right font-medium">Folios</th>
            <th className="py-1.5 text-right font-medium">AUM</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={3} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.map((r) => (
            <tr key={r.amcCode}>
              <td className="py-1.5 pr-4 text-ink">{r.amcName}</td>
              <td className="py-1.5 text-right tabular-nums text-ink-secondary">{r.folioCount}</td>
              <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={r.aum} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function BusinessDevelopmentTab({ arnIds }: TabProps) {
  const { data, isLoading } = useBusinessDevelopmentReport(arnIds);
  return (
    <Card title="Business Development Report (last 12 months)">
      <div className="mb-2 flex justify-end">
        <ExportToolbar
          filenameBase="business-development-report"
          sheetName="Business Development"
          title="Business Development Report (last 12 months)"
          headers={["Month", "New Clients", "New Inflow"]}
          rows={data?.map((r) => [r.month, r.newClients, r.newInflowAmount]) ?? []}
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Month</th>
            <th className="py-1.5 pr-4 text-right font-medium">New Clients</th>
            <th className="py-1.5 text-right font-medium">New Inflow</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={3} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.map((r) => (
            <tr key={r.month}>
              <td className="py-1.5 pr-4 text-ink">{r.month}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{r.newClients}</td>
              <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={r.newInflowAmount} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function DividendTab({ arnIds }: TabProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useDividendReport(page, arnIds);
  return (
    <Card title="Dividend Report">
      <div className="mb-2 flex justify-end">
        <ExportToolbar
          filenameBase="dividend-report"
          sheetName="Dividend"
          title="Dividend Report"
          headers={["Client", "Scheme", "Type", "Amount", "Date"]}
          rows={data?.transactions.map((t) => [t.clientName, t.schemeName ?? "", t.transactionType === "DIVIDEND_REINVEST" ? "Reinvest" : "Payout", t.amount ?? "", formatDate(t.transactionDate)]) ?? []}
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Client</th>
            <th className="py-1.5 pr-4 font-medium">Scheme</th>
            <th className="py-1.5 pr-4 font-medium">Type</th>
            <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
            <th className="py-1.5 text-right font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.transactions.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">No dividend transactions found.</td></tr>}
          {data?.transactions.map((t) => (
            <tr key={t.id}>
              <td className="py-1.5 pr-4 text-ink">{t.clientName}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{t.schemeName ?? "—"}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{t.transactionType === "DIVIDEND_REINVEST" ? "Reinvest" : "Payout"}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={t.amount} /></td>
              <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatDate(t.transactionDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

function SipStatusTab({ status, title, arnIds }: { status: "new" | "ceased"; title: string } & TabProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSipReport(page, status, arnIds);
  return (
    <Card title={title}>
      <div className="mb-2 flex justify-end">
        <ExportToolbar
          filenameBase={status === "new" ? "sip-addition-report" : "sip-ceased-report"}
          sheetName="SIPs"
          title={title}
          headers={["Client", "Folio", "Amount", "Frequency", status === "new" ? "Registered" : "Ceased"]}
          rows={data?.sips.map((s) => [s.clientName, s.folioNumber, s.sipAmount ?? "", s.frequency ?? "", formatDate(status === "new" ? s.registrationDate : (s.ceaseDate ?? s.registrationDate))]) ?? []}
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Client</th>
            <th className="py-1.5 pr-4 font-medium">Folio</th>
            <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
            <th className="py-1.5 pr-4 font-medium">Frequency</th>
            <th className="py-1.5 text-right font-medium">{status === "new" ? "Registered" : "Ceased"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.sips.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">None.</td></tr>}
          {data?.sips.map((s) => (
            <tr key={s.id}>
              <td className="py-1.5 pr-4 text-ink">{s.clientName}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{s.folioNumber}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={s.sipAmount} /></td>
              <td className="py-1.5 pr-4 text-ink-secondary">{s.frequency ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums text-ink-muted">
                {formatDate(status === "new" ? s.registrationDate : (s.ceaseDate ?? s.registrationDate))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

function SipDueTab({ arnIds }: TabProps) {
  const [withinDays, setWithinDays] = useState(7);
  const { data, isLoading } = useSipDueReport(arnIds, withinDays);
  return (
    <Card title="SIP Due Report">
      <p className="mb-2 text-xs text-ink-muted">
        Estimated from start date + frequency — no per-installment due-date field is captured by the RTA feed, so
        this is a best-effort projection, not a bank-confirmed schedule.
      </p>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          Due within
          <select
            value={withinDays}
            onChange={(e) => setWithinDays(Number(e.target.value))}
            className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-xs text-ink"
          >
            <option value={7}>7 days</option>
            <option value={15}>15 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
          </select>
        </label>
        <ExportToolbar
          filenameBase="sip-due-report"
          sheetName="SIP Due"
          title="SIP Due Report"
          headers={["Client", "Folio", "Amount", "Est. Next Due"]}
          rows={data?.map((s) => [s.clientName, s.folioNumber, s.sipAmount ?? "", s.estimatedNextDueDate]) ?? []}
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Client</th>
            <th className="py-1.5 pr-4 font-medium">Folio</th>
            <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
            <th className="py-1.5 text-right font-medium">Est. Next Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={4} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-ink-muted">Nothing due soon.</td></tr>}
          {data?.map((s) => (
            <tr key={s.id}>
              <td className="py-1.5 pr-4 text-ink">{s.clientName}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{s.folioNumber}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={s.sipAmount} /></td>
              <td className="py-1.5 text-right tabular-nums text-ink-muted">{s.estimatedNextDueDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function SipExpiringTab({ arnIds }: TabProps) {
  const [withinDays, setWithinDays] = useState(30);
  const { data, isLoading } = useSipExpiringReport(arnIds, withinDays);
  return (
    <Card title={`SIP Expiring Report (next ${withinDays} days)`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          Expiring within
          <select
            value={withinDays}
            onChange={(e) => setWithinDays(Number(e.target.value))}
            className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-xs text-ink"
          >
            <option value={15}>15 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
        <ExportToolbar
          filenameBase="sip-expiring-report"
          sheetName="SIP Expiring"
          title="SIP Expiring Report"
          headers={["Client", "Folio", "Amount", "End Date"]}
          rows={data?.map((s) => [s.clientName, s.folioNumber, s.sipAmount ?? "", s.endDate ? formatDate(s.endDate) : ""]) ?? []}
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Client</th>
            <th className="py-1.5 pr-4 font-medium">Folio</th>
            <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
            <th className="py-1.5 text-right font-medium">End Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={4} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-ink-muted">Nothing expiring soon.</td></tr>}
          {data?.map((s) => (
            <tr key={s.id}>
              <td className="py-1.5 pr-4 text-ink">{s.clientName}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{s.folioNumber}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={s.sipAmount} /></td>
              <td className="py-1.5 text-right tabular-nums text-ink-muted">{s.endDate ? formatDate(s.endDate) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function SipStpExpiringCamsTab({ arnIds }: TabProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useSipStpExpiringCamsReport(page, arnIds, search);
  return (
    <Card title="SIP/STP Expiring (CAMS)">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          CAMS's own authoritative expiring-systematic-registration list (WBR5) — a real upgrade over the estimated
          SIP Expiring report above, and also covers expiring STP/switch registrations, not pure SIP alone.
        </p>
        <div className="flex items-center gap-2">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search investor…" />
          <ExportToolbar
            filenameBase="sip-stp-expiring-cams-report"
            sheetName="SIP-STP Expiring"
            title="SIP/STP Expiring (CAMS)"
            headers={["Investor", "Folio", "Scheme", "Type", "Amount", "Expiry Date"]}
            rows={data?.rows.map((r) => [r.investorName ?? "", r.folioNumber, r.schemeName ?? "", r.transactionType === "SO" ? "Switch Out" : r.transactionType ?? "", r.amount ?? "", r.expiryDate ? formatDate(r.expiryDate) : ""]) ?? []}
          />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Investor</th>
            <th className="py-1.5 pr-4 font-medium">Folio</th>
            <th className="py-1.5 pr-4 font-medium">Scheme</th>
            <th className="py-1.5 pr-4 font-medium">Type</th>
            <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
            <th className="py-1.5 text-right font-medium">Expiry Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={6} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.rows.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-ink-muted">Nothing expiring soon.</td></tr>}
          {data?.rows.map((r) => (
            <tr key={r.id}>
              <td className="py-1.5 pr-4 text-ink">
                {r.clientId ? <Link to={`/crm/${r.clientId}`} className="text-series-1 hover:underline">{r.investorName}</Link> : r.investorName}
              </td>
              <td className="py-1.5 pr-4 text-ink-secondary">{r.folioNumber}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">
                {r.schemeName ?? "—"}
                {r.toSchemeName && <span className="text-ink-muted"> → {r.toSchemeName}</span>}
              </td>
              <td className="py-1.5 pr-4 text-ink-secondary">{r.transactionType === "SO" ? "Switch Out" : r.transactionType ?? "—"}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={r.amount} /></td>
              <td className="py-1.5 text-right tabular-nums text-ink-muted">{r.expiryDate ? formatDate(r.expiryDate) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

function BrokerageWithheldTab({ arnIds }: TabProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useBrokerageWithheldReport(page, arnIds, search);
  return (
    <Card title="Brokerage Withheld">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          From CAMS's Brokerage Withheld report (WBR95) — brokerage CAMS is withholding because the folio's KYC is
          invalid. Column meanings (Trail Fee / Transaction Incentive / Upfront) are best-effort labels from CAMS's
          own raw field abbreviations — no field-layout glossary exists for this report yet, shown as reported.
        </p>
        <div className="flex items-center gap-2">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search investor…" />
          <ExportToolbar
            filenameBase="brokerage-withheld-report"
            sheetName="Brokerage Withheld"
            title="Brokerage Withheld"
            headers={["Investor", "Folio", "KYC Status", "Trail Fee", "Txn Incentive", "Upfront"]}
            rows={data?.rows.map((r) => [r.investorName ?? "", r.folioNumber, r.kycStatusAtWithholding ?? "", r.trailFeeWithheld ?? "", r.transactionIncentiveWithheld ?? "", r.upfrontWithheld ?? ""]) ?? []}
          />
        </div>
      </div>
      {data && (
        <div className="mb-3 grid grid-cols-3 gap-3">
          <div className="rounded-md border border-[var(--border)] p-2.5">
            <p className="text-xs text-ink-secondary">Total Trail Fee Withheld</p>
            <p className="mt-0.5 text-sm font-semibold text-ink"><Amount value={data.totalTrailFeeWithheld} /></p>
          </div>
          <div className="rounded-md border border-[var(--border)] p-2.5">
            <p className="text-xs text-ink-secondary">Total Transaction Incentive Withheld</p>
            <p className="mt-0.5 text-sm font-semibold text-ink"><Amount value={data.totalTransactionIncentiveWithheld} /></p>
          </div>
          <div className="rounded-md border border-[var(--border)] p-2.5">
            <p className="text-xs text-ink-secondary">Total Upfront Withheld</p>
            <p className="mt-0.5 text-sm font-semibold text-ink"><Amount value={data.totalUpfrontWithheld} /></p>
          </div>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Investor</th>
            <th className="py-1.5 pr-4 font-medium">Folio</th>
            <th className="py-1.5 pr-4 font-medium">KYC Status</th>
            <th className="py-1.5 pr-4 text-right font-medium">Trail Fee</th>
            <th className="py-1.5 pr-4 text-right font-medium">Txn Incentive</th>
            <th className="py-1.5 text-right font-medium">Upfront</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={6} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.rows.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-ink-muted">Nothing withheld.</td></tr>}
          {data?.rows.map((r) => (
            <tr key={r.id}>
              <td className="py-1.5 pr-4 text-ink">
                {r.clientId ? <Link to={`/crm/${r.clientId}`} className="text-series-1 hover:underline">{r.investorName}</Link> : r.investorName}
              </td>
              <td className="py-1.5 pr-4 text-ink-secondary">{r.folioNumber}</td>
              <td className="py-1.5 pr-4 text-status-critical">{r.kycStatusAtWithholding ?? "—"}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={r.trailFeeWithheld} /></td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={r.transactionIncentiveWithheld} /></td>
              <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={r.upfrontWithheld} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

function SwitchTab({ kind, arnIds }: { kind: "stp" | "swp" } & TabProps) {
  const [page, setPage] = useState(1);
  const stp = useStpReport(page, arnIds);
  const swp = useSwpReport(page, arnIds);
  const { data, isLoading } = kind === "stp" ? stp : swp;
  return (
    <Card title={kind === "stp" ? "STP Report" : "SWP Report"}>
      <p className="mb-2 text-xs text-ink-muted">
        {kind === "stp"
          ? "Every switch-in/switch-out transaction — a real recurring STP mandate isn't a separate ingested record, so a one-off manual switch looks identical here."
          : "Every redemption transaction — a real recurring SWP mandate isn't a separate ingested record, so a one-off manual redemption looks identical here."}
      </p>
      <div className="mb-2 flex justify-end">
        <ExportToolbar
          filenameBase={kind === "stp" ? "stp-report" : "swp-report"}
          sheetName={kind === "stp" ? "STP" : "SWP"}
          title={kind === "stp" ? "STP Report" : "SWP Report"}
          headers={["Client", "Scheme", "Type", "Amount", "Date"]}
          rows={data?.transactions.map((t) => [t.clientName, t.schemeName ?? "", t.transactionType, t.amount ?? "", formatDate(t.transactionDate)]) ?? []}
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Client</th>
            <th className="py-1.5 pr-4 font-medium">Scheme</th>
            <th className="py-1.5 pr-4 font-medium">Type</th>
            <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
            <th className="py-1.5 text-right font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.transactions.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">None.</td></tr>}
          {data?.transactions.map((t) => (
            <tr key={t.id}>
              <td className="py-1.5 pr-4 text-ink">{t.clientName}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{t.schemeName ?? "—"}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{t.transactionType}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={t.amount} /></td>
              <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatDate(t.transactionDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

function TransactionsTab({ arnIds }: TabProps) {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = useTransactionsReport(page, undefined, arnIds, from || undefined, to || undefined);
  return (
    <Card title="Transaction Report">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-ink-secondary">
          <label className="flex items-center gap-1.5">
            From
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-xs text-ink" />
          </label>
          <label className="flex items-center gap-1.5">
            To
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-xs text-ink" />
          </label>
          {(from || to) && (
            <button onClick={() => { setFrom(""); setTo(""); setPage(1); }} className="text-ink-muted hover:text-ink">Clear</button>
          )}
        </div>
        <ExportToolbar
          filenameBase="transaction-report"
          sheetName="Transactions"
          title="Transaction Report"
          headers={["Client", "Scheme", "Type", "Amount", "Date"]}
          rows={data?.transactions.map((t) => [t.clientName, t.schemeName ?? `${t.amcCode}/${t.schemeCode}`, t.transactionDescription ?? t.transactionType, t.amount ?? "", formatDate(t.transactionDate)]) ?? []}
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Client</th>
            <th className="py-1.5 pr-4 font-medium">Scheme</th>
            <th className="py-1.5 pr-4 font-medium">Type</th>
            <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
            <th className="py-1.5 text-right font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.transactions.map((t) => (
            <tr key={t.id}>
              <td className="py-1.5 pr-4 text-ink">{t.clientName}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{t.schemeName ?? `${t.amcCode}/${t.schemeCode}`}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">
                {t.transactionDescription ?? t.transactionType}
                {t.isRejection && (
                  <span className="ml-2 rounded bg-status-critical/15 px-1.5 py-0.5 text-[10px] font-medium text-status-critical">
                    Reverted / Failed
                  </span>
                )}
                {t.source !== "RTA_MAILBACK" && (
                  <span className="ml-2 rounded bg-series-4/15 px-1.5 py-0.5 text-[10px] font-medium text-series-4">
                    External
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={t.amount} /></td>
              <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatDate(t.transactionDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

function TransactionSummaryTab({ arnIds }: TabProps) {
  const { data, isLoading } = useTransactionSummaryReport(arnIds);
  return (
    <Card title="Transaction Summary Report">
      <div className="mb-2 flex justify-end">
        <ExportToolbar
          filenameBase="transaction-summary-report"
          sheetName="Transaction Summary"
          title="Transaction Summary Report"
          headers={["Type", "Count", "Total Amount"]}
          rows={data?.map((r) => [r.transactionType, formatCount(r.count), r.totalAmount]) ?? []}
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Type</th>
            <th className="py-1.5 pr-4 text-right font-medium">Count</th>
            <th className="py-1.5 text-right font-medium">Total Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={3} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.map((r) => (
            <tr key={r.transactionType}>
              <td className="py-1.5 pr-4 text-ink">{r.transactionType}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{formatCount(r.count)}</td>
              <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={r.totalAmount} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function DayChangeCell({ amount, percent }: { amount: string | null; percent?: string | null }) {
  if (amount === null) {
    return <span className="text-ink-muted" title="Needs at least 2 days of real AMFI NAV history since this feature was added — not available yet">—</span>;
  }
  const positive = Number(amount) >= 0;
  return (
    <span className={positive ? "text-status-good" : "text-status-critical"}>
      <Amount value={amount} />
      {percent && ` (${positive ? "+" : ""}${percent}%)`}
    </span>
  );
}

function ClientReturnsRow({ r }: { r: ClientReturnRow }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="cursor-pointer hover:bg-[var(--gridline)]/20" onClick={() => setExpanded((e) => !e)}>
        <td className="py-1.5 pr-4">
          <span className="inline-flex items-center gap-1.5">
            {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <Link to={`/crm/${r.clientId}`} onClick={(e) => e.stopPropagation()} className="text-series-1 hover:underline">{r.clientName}</Link>
          </span>
        </td>
        <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary"><Amount value={r.totalInvested} /></td>
        <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={r.currentValue} /></td>
        <td className="py-1.5 pr-4 text-right tabular-nums"><DayChangeCell amount={r.dayChangeAmount} /></td>
        <td className={`py-1.5 text-right tabular-nums ${r.xirr && Number(r.xirr) >= 0 ? "text-status-good" : "text-status-critical"}`}>
          {r.xirr ? `${r.xirr}%` : "—"}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-page px-4 py-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-secondary">
                  <th className="py-1 pr-3 font-medium">Scheme</th>
                  <th className="py-1 pr-3 text-right font-medium">Invested</th>
                  <th className="py-1 pr-3 text-right font-medium">Current Value</th>
                  <th className="py-1 pr-3 text-right font-medium">Day Change</th>
                  <th className="py-1 text-right font-medium">XIRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--gridline)]">
                {r.folios.length === 0 && <tr><td colSpan={5} className="py-2 text-center text-ink-muted">No folios.</td></tr>}
                {r.folios.map((f) => (
                  <tr key={f.folioId}>
                    <td className="py-1 pr-3 text-ink-secondary">{f.schemeName ?? `${f.amcCode}/${f.schemeCode}`} <span className="text-ink-muted">({f.folioNumber})</span></td>
                    <td className="py-1 pr-3 text-right tabular-nums text-ink-secondary"><Amount value={f.invested} /></td>
                    <td className="py-1 pr-3 text-right tabular-nums text-ink"><Amount value={f.currentValue} /></td>
                    <td className="py-1 pr-3 text-right tabular-nums"><DayChangeCell amount={f.dayChangeAmount} percent={f.dayChangePercent} /></td>
                    <td className={`py-1 text-right tabular-nums ${f.xirr && Number(f.xirr) >= 0 ? "text-status-good" : "text-status-critical"}`}>
                      {f.xirr ? `${f.xirr}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function ChevronRightIcon() { return <span className="inline-block text-ink-muted">▶</span>; }
function ChevronDownIcon() { return <span className="inline-block text-ink-muted">▼</span>; }

function ClientReturnsTab({ arnIds }: TabProps) {
  const { data, isLoading } = useClientReturnsReport(arnIds);
  const [pdfOpen, setPdfOpen] = useState(false);

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      "client-returns.csv",
      ["Client", "Invested", "Current Value", "Day Change", "XIRR"],
      data.map((r) => [r.clientName, r.totalInvested, r.currentValue, r.dayChangeAmount ?? "", r.xirr ? `${r.xirr}%` : ""]),
    );
  }
  function exportXlsx() {
    if (!data) return;
    downloadXlsx(
      "client-returns.xlsx",
      "Client Returns",
      ["Client", "Invested", "Current Value", "Day Change", "XIRR"],
      data.map((r) => [r.clientName, r.totalInvested, r.currentValue, r.dayChangeAmount ?? "", r.xirr ? `${r.xirr}%` : ""]),
    );
  }

  return (
    <Card title="Client Returns (XIRR)">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs text-ink-muted">
          XIRR over every purchase/redemption cash flow plus current value as-if-sold-today. Blank means not enough
          cash-flow history to compute (or it didn't converge) — not a zero return. Day Change needs at least 2 days
          of real AMFI NAV history accumulated since this feature was added, so it's blank for everyone at first.
          Click a client row to expand scheme-wise detail.
        </p>
        {data && data.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
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
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Client</th>
            <th className="py-1.5 pr-4 text-right font-medium">Invested</th>
            <th className="py-1.5 pr-4 text-right font-medium">Current Value</th>
            <th className="py-1.5 pr-4 text-right font-medium">Day Change</th>
            <th className="py-1.5 text-right font-medium">XIRR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.map((r) => <ClientReturnsRow key={r.clientId} r={r} />)}
        </tbody>
      </table>

      {pdfOpen && data && (
        <PrintableModal title="Client Returns (XIRR)" subtitle="Overall per client" onClose={() => setPdfOpen(false)}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-secondary">
                <th className="py-1.5 pr-4 font-medium">Client</th>
                <th className="py-1.5 pr-4 text-right font-medium">Invested</th>
                <th className="py-1.5 pr-4 text-right font-medium">Current Value</th>
                <th className="py-1.5 text-right font-medium">XIRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gridline)]">
              {data.map((r) => (
                <tr key={r.clientId}>
                  <td className="py-1.5 pr-4 text-ink-secondary">{r.clientName}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary"><Amount value={r.totalInvested} /></td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={r.currentValue} /></td>
                  <td className="py-1.5 text-right tabular-nums text-ink-secondary">{r.xirr ? `${r.xirr}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintableModal>
      )}
    </Card>
  );
}

export function ReportsPage() {
  const [section, setSection] = useState<Section>("client");
  const [clientTab, setClientTab] = useState<ClientTab>("holdings");
  const [distributorTab, setDistributorTab] = useState<DistributorTab>("aum");
  const [arnIds, setArnIds] = useState<string[]>([]);
  const { data: arnProfiles } = useArnProfiles();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader icon={FileText} accent="series-2" title="Reports">
          <p className="text-sm text-ink-secondary">Client-level and distributor-level reports built from your ingested RTA data.</p>
        </PageHeader>
        {arnProfiles && <ArnFilter arnProfiles={arnProfiles} selectedIds={arnIds} onChange={setArnIds} />}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setSection("client")}
          className={`rounded-md px-4 py-2 text-sm font-medium ${section === "client" ? "bg-series-1 text-white" : "border border-[var(--border)] text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
        >
          Client Reports
        </button>
        <button
          onClick={() => setSection("distributor")}
          className={`rounded-md px-4 py-2 text-sm font-medium ${section === "distributor" ? "bg-series-1 text-white" : "border border-[var(--border)] text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
        >
          Distributor Reports
        </button>
      </div>

      {section === "client" && (
        <>
          <div className="flex flex-wrap gap-1 border-b border-[var(--border)]">
            {CLIENT_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setClientTab(t.id)}
                className={`rounded-t-md px-3 py-2 text-sm ${clientTab === t.id ? "border-b-2 border-series-1 font-medium text-series-1" : "text-ink-secondary hover:text-ink"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {clientTab === "capital-gains" && <CapitalGainsTab notional={false} arnIds={arnIds} />}
          {clientTab === "notional-gains" && <CapitalGainsTab notional={true} arnIds={arnIds} />}
          {clientTab === "holdings" && <HoldingsTab />}
          {clientTab === "net-worth" && <NetWorthTab arnIds={arnIds} />}
          {clientTab === "family-allocation" && <FamilyAllocationTab arnIds={arnIds} />}
          {clientTab === "valuation" && <ValuationTab />}
          {clientTab === "cas" && <CasTab arnIds={arnIds} />}
        </>
      )}

      {section === "distributor" && (
        <>
          <div className="flex flex-wrap gap-1 border-b border-[var(--border)]">
            {DISTRIBUTOR_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setDistributorTab(t.id)}
                className={`rounded-t-md px-3 py-2 text-sm ${distributorTab === t.id ? "border-b-2 border-series-1 font-medium text-series-1" : "text-ink-secondary hover:text-ink"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {distributorTab === "aum" && <AumTab arnIds={arnIds} />}
          {distributorTab === "business-development" && <BusinessDevelopmentTab arnIds={arnIds} />}
          {distributorTab === "dividend" && <DividendTab arnIds={arnIds} />}
          {distributorTab === "sip-addition" && <SipStatusTab status="new" title="SIP Addition Report (this month)" arnIds={arnIds} />}
          {distributorTab === "sip-bounced" && (
            <NotAvailableCard
              title="SIP Bounced Report"
              reason="Not available — the RTA's SIP registration report only carries registration/active/cease status, not per-installment payment/bounce events. That would need the RTA's own bounce-notification feed, which isn't ingested today."
            />
          )}
          {distributorTab === "sip-ceased" && <SipStatusTab status="ceased" title="SIP Ceased Report" arnIds={arnIds} />}
          {distributorTab === "sip-due" && <SipDueTab arnIds={arnIds} />}
          {distributorTab === "sip-expiring" && <SipExpiringTab arnIds={arnIds} />}
          {distributorTab === "sip-stp-expiring-cams" && <SipStpExpiringCamsTab arnIds={arnIds} />}
          {distributorTab === "stp" && <SwitchTab kind="stp" arnIds={arnIds} />}
          {distributorTab === "swp" && <SwitchTab kind="swp" arnIds={arnIds} />}
          {distributorTab === "brokerage-withheld" && <BrokerageWithheldTab arnIds={arnIds} />}
          {distributorTab === "transactions" && <TransactionsTab arnIds={arnIds} />}
          {distributorTab === "transaction-summary" && <TransactionSummaryTab arnIds={arnIds} />}
          {distributorTab === "client-returns" && <ClientReturnsTab arnIds={arnIds} />}
        </>
      )}
    </div>
  );
}
