import { useState } from "react";
import { X, Download, FileSpreadsheet, FileText } from "lucide-react";
import {
  useMailInsertedData,
  type InsertedTransactionRow,
  type InsertedFolioBalanceRow,
  type InsertedSipRegistrationRow,
  type InsertedBrokerageWithheldRow,
  type InsertedSystematicExpiryRow,
  type InsertedRawRecordRow,
  type MailSourceFilter,
} from "../../hooks/useSuperAdmin";
import { formatDate, formatDateTime } from "../../lib/format";
import { downloadCsv, downloadXlsx, downloadTxt } from "../../lib/export";

interface InsertedDataFilters {
  rtaType?: string;
  reportCode?: string;
  date?: string;
  from?: string;
  to?: string;
  distributorId?: string;
  arnProfileId?: string;
  source?: MailSourceFilter;
}

function SectionExportButtons({
  filenameBase,
  sheetName,
  headers,
  rows,
}: {
  filenameBase: string;
  sheetName: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => downloadCsv(`${filenameBase}.csv`, headers, rows)} title="Export CSV" className="rounded-md border border-[var(--border)] p-1.5 text-ink-secondary hover:bg-[var(--gridline)]/50">
        <Download size={13} />
      </button>
      <button onClick={() => downloadXlsx(`${filenameBase}.xlsx`, sheetName, headers, rows)} title="Export Excel" className="rounded-md border border-[var(--border)] p-1.5 text-ink-secondary hover:bg-[var(--gridline)]/50">
        <FileSpreadsheet size={13} />
      </button>
      <button onClick={() => downloadTxt(`${filenameBase}.txt`, headers, rows)} title="Export TXT" className="rounded-md border border-[var(--border)] p-1.5 text-ink-secondary hover:bg-[var(--gridline)]/50">
        <FileText size={13} />
      </button>
    </div>
  );
}

function transactionRows(rows: InsertedTransactionRow[]) {
  const headers = ["Client", "PAN", "Folio", "AMC", "Scheme", "Type", "Description", "Date", "Amount", "Units"];
  const body = rows.map((t) => [
    t.clientName, t.panNumber ?? "", t.folioNumber, t.amcCode, t.schemeName ?? "",
    t.transactionType, t.transactionDescription ?? "", formatDate(t.transactionDate), t.amount ?? "", t.units ?? "",
  ]);
  return { headers, body };
}

function folioBalanceRows(rows: InsertedFolioBalanceRow[]) {
  const headers = ["Client", "PAN", "Folio", "AMC", "Scheme", "Balance Units", "Valuation", "As Of Date"];
  const body = rows.map((f) => [
    f.clientName, f.panNumber ?? "", f.folioNumber, f.amcCode, f.schemeName ?? "",
    f.balanceUnits ?? "", f.valuationAmount ?? "", f.balanceAsOfDate ? formatDate(f.balanceAsOfDate) : "",
  ]);
  return { headers, body };
}

function sipRegistrationRows(rows: InsertedSipRegistrationRow[]) {
  const headers = ["Client", "PAN", "Folio", "AMC", "Scheme", "Amount", "Frequency", "Start Date", "End Date", "Registration Date", "Cease Date", "Active"];
  const body = rows.map((s) => [
    s.clientName, s.panNumber ?? "", s.folioNumber, s.amcCode, s.schemeName ?? "",
    s.sipAmount ?? "", s.frequency ?? "", s.startDate ? formatDate(s.startDate) : "", s.endDate ? formatDate(s.endDate) : "",
    formatDate(s.registrationDate), s.ceaseDate ? formatDate(s.ceaseDate) : "", s.isActive ? "Yes" : "No",
  ]);
  return { headers, body };
}

function brokerageWithheldRows(rows: InsertedBrokerageWithheldRow[]) {
  const headers = ["Investor", "PAN", "Folio", "AMC", "Scheme", "KYC Status", "Trail Fee", "Txn Incentive", "Upfront", "Report Date"];
  const body = rows.map((b) => [
    b.investorName ?? "", b.investorPan ?? "", b.folioNumber, b.amcCode ?? "", b.schemeCode ?? "",
    b.kycStatusAtWithholding ?? "", b.trailFeeWithheld ?? "", b.transactionIncentiveWithheld ?? "", b.upfrontWithheld ?? "", formatDate(b.reportDate),
  ]);
  return { headers, body };
}

function systematicExpiryRows(rows: InsertedSystematicExpiryRow[]) {
  const headers = ["Investor", "Folio", "Scheme", "To Scheme", "Type", "Amount", "Units", "Expiry Date"];
  const body = rows.map((e) => [
    e.investorName ?? "", e.folioNumber, e.schemeName ?? "", e.toSchemeName ?? "", e.transactionType ?? "",
    e.amount ?? "", e.units ?? "", e.expiryDate ? formatDate(e.expiryDate) : "",
  ]);
  return { headers, body };
}

/** rawStructuredPayload's shape varies by report type (Investor Master vs KYC Status vs...), so the export columns are the union of every key actually seen across the current rows, not a fixed layout. */
function rawRecordRows(rows: InsertedRawRecordRow[]) {
  const payloadKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.rawStructuredPayload)))).sort();
  const headers = ["RTA", "Report", "PAN", "Folio", "AMC", "Scheme", "Date", ...payloadKeys];
  const body = rows.map((r) => [
    r.rtaType, r.reportCode, r.investorPan ?? "", r.folioNumber ?? "", r.amcCode ?? "", r.schemeCode ?? "",
    r.transactionDate ? formatDate(r.transactionDate) : "",
    ...payloadKeys.map((k) => {
      const v = r.rawStructuredPayload[k];
      return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    }),
  ]);
  return { headers, body };
}

/**
 * Shows the real Transaction/Folio-balance rows a set of completed RTA
 * mails put into the CRM (not just file metadata) — shared by the Daily
 * Summary's per-bucket "View" button and the RTA -> report-type Imported
 * Data Explorer, since both just need "give me the actual data for this
 * filter combination" with export.
 */
export function InsertedDataModal({ title, subtitle, filters, onClose }: { title: string; subtitle?: string; filters: InsertedDataFilters; onClose: () => void }) {
  const { data, isLoading } = useMailInsertedData(filters, true);
  const [tab, setTab] = useState<"transactions" | "balances" | "sips" | "brokerage" | "expiry" | "raw">("transactions");

  const txn = transactionRows(data?.transactions ?? []);
  const bal = folioBalanceRows(data?.folioBalances ?? []);
  const sip = sipRegistrationRows(data?.sipRegistrations ?? []);
  const brk = brokerageWithheldRows(data?.brokerageWithheld ?? []);
  const exp = systematicExpiryRows(data?.systematicExpiry ?? []);
  const raw = rawRecordRows(data?.rawRecords ?? []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle && <p className="text-xs text-ink-secondary">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-[var(--border)] bg-status-warning/5 px-5 py-2 text-xs text-ink-secondary">
          Tabs up to "Systematic Expiry" only show rows that were actually applied to a CRM record — a mail
          processed before this traceability existed, or a balance report that arrived older than what's already
          stored, can show 0 here even though the import itself succeeded. Not a sign of missing/lost data. "Raw
          Records" is the reliable fallback: every record this mail's report actually contained, for every report
          type (including Investor Master and KYC Status, which update existing records in place rather than
          creating new ones).
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-2">
          <div className="flex gap-1">
            <button
              onClick={() => setTab("transactions")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === "transactions" ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
            >
              Transactions ({data?.transactions.length ?? 0})
            </button>
            <button
              onClick={() => setTab("balances")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === "balances" ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
            >
              Folio Balances Updated ({data?.folioBalances.length ?? 0})
            </button>
            <button
              onClick={() => setTab("sips")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === "sips" ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
            >
              SIP/STP Registrations ({data?.sipRegistrations.length ?? 0})
            </button>
            <button
              onClick={() => setTab("brokerage")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === "brokerage" ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
            >
              Brokerage Withheld ({data?.brokerageWithheld.length ?? 0})
            </button>
            <button
              onClick={() => setTab("expiry")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === "expiry" ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
            >
              Systematic Expiry ({data?.systematicExpiry.length ?? 0})
            </button>
            <button
              onClick={() => setTab("raw")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === "raw" ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-[var(--gridline)]/50"}`}
            >
              Raw Records ({data?.rawRecords.length ?? 0})
            </button>
          </div>
          {tab === "transactions" && <SectionExportButtons filenameBase="inserted-transactions" sheetName="Transactions" headers={txn.headers} rows={txn.body} />}
          {tab === "balances" && <SectionExportButtons filenameBase="inserted-folio-balances" sheetName="Folio Balances" headers={bal.headers} rows={bal.body} />}
          {tab === "sips" && <SectionExportButtons filenameBase="inserted-sip-registrations" sheetName="SIP Registrations" headers={sip.headers} rows={sip.body} />}
          {tab === "brokerage" && <SectionExportButtons filenameBase="inserted-brokerage-withheld" sheetName="Brokerage Withheld" headers={brk.headers} rows={brk.body} />}
          {tab === "expiry" && <SectionExportButtons filenameBase="inserted-systematic-expiry" sheetName="Systematic Expiry" headers={exp.headers} rows={exp.body} />}
          {tab === "raw" && <SectionExportButtons filenameBase="inserted-raw-records" sheetName="Raw Records" headers={raw.headers} rows={raw.body} />}
        </div>

        <div className="overflow-y-auto px-5 py-3">
          {isLoading && <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>}

          {!isLoading && tab === "transactions" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-secondary">
                  <th className="py-1.5 pr-4 font-medium">Client</th>
                  <th className="py-1.5 pr-4 font-medium">PAN</th>
                  <th className="py-1.5 pr-4 font-medium">Folio</th>
                  <th className="py-1.5 pr-4 font-medium">Scheme</th>
                  <th className="py-1.5 pr-4 font-medium">Type</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Units</th>
                  <th className="py-1.5 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--gridline)]">
                {data?.transactions.length === 0 && (
                  <tr><td colSpan={8} className="py-4 text-center text-ink-muted">No transactions inserted for this filter.</td></tr>
                )}
                {data?.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="py-1.5 pr-4 text-ink">{t.clientName}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{t.panNumber ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{t.folioNumber}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{t.schemeName ?? `${t.amcCode}`}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{t.transactionDescription ?? t.transactionType}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{t.amount ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{t.units ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatDate(t.transactionDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!isLoading && tab === "balances" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-secondary">
                  <th className="py-1.5 pr-4 font-medium">Client</th>
                  <th className="py-1.5 pr-4 font-medium">PAN</th>
                  <th className="py-1.5 pr-4 font-medium">Folio</th>
                  <th className="py-1.5 pr-4 font-medium">Scheme</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Units</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Valuation</th>
                  <th className="py-1.5 text-right font-medium">As Of</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--gridline)]">
                {data?.folioBalances.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center text-ink-muted">No folio balances updated for this filter.</td></tr>
                )}
                {data?.folioBalances.map((f) => (
                  <tr key={f.id}>
                    <td className="py-1.5 pr-4 text-ink">{f.clientName}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{f.panNumber ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{f.folioNumber}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{f.schemeName ?? f.amcCode}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{f.balanceUnits ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{f.valuationAmount ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink-muted">{f.balanceAsOfDate ? formatDate(f.balanceAsOfDate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!isLoading && tab === "sips" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-secondary">
                  <th className="py-1.5 pr-4 font-medium">Client</th>
                  <th className="py-1.5 pr-4 font-medium">PAN</th>
                  <th className="py-1.5 pr-4 font-medium">Folio</th>
                  <th className="py-1.5 pr-4 font-medium">Scheme</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
                  <th className="py-1.5 pr-4 font-medium">Frequency</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Registered</th>
                  <th className="py-1.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--gridline)]">
                {data?.sipRegistrations.length === 0 && (
                  <tr><td colSpan={8} className="py-4 text-center text-ink-muted">No SIP/STP registrations inserted for this filter.</td></tr>
                )}
                {data?.sipRegistrations.map((s) => (
                  <tr key={s.id}>
                    <td className="py-1.5 pr-4 text-ink">{s.clientName}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{s.panNumber ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{s.folioNumber}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{s.schemeName ?? s.amcCode}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{s.sipAmount ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{s.frequency ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink-muted">{formatDate(s.registrationDate)}</td>
                    <td className={`py-1.5 text-right ${s.isActive ? "text-status-good" : "text-ink-muted"}`}>{s.isActive ? "Active" : "Ceased"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!isLoading && tab === "brokerage" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-secondary">
                  <th className="py-1.5 pr-4 font-medium">Investor</th>
                  <th className="py-1.5 pr-4 font-medium">PAN</th>
                  <th className="py-1.5 pr-4 font-medium">Folio</th>
                  <th className="py-1.5 pr-4 font-medium">KYC Status</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Trail Fee</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Txn Incentive</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Upfront</th>
                  <th className="py-1.5 text-right font-medium">Report Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--gridline)]">
                {data?.brokerageWithheld.length === 0 && (
                  <tr><td colSpan={8} className="py-4 text-center text-ink-muted">No brokerage-withheld rows inserted for this filter.</td></tr>
                )}
                {data?.brokerageWithheld.map((b) => (
                  <tr key={b.id}>
                    <td className="py-1.5 pr-4 text-ink">{b.investorName ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{b.investorPan ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{b.folioNumber}</td>
                    <td className="py-1.5 pr-4 text-status-critical">{b.kycStatusAtWithholding ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{b.trailFeeWithheld ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{b.transactionIncentiveWithheld ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{b.upfrontWithheld ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatDate(b.reportDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!isLoading && tab === "expiry" && (
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
                {data?.systematicExpiry.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-center text-ink-muted">No systematic-expiry rows inserted for this filter.</td></tr>
                )}
                {data?.systematicExpiry.map((e) => (
                  <tr key={e.id}>
                    <td className="py-1.5 pr-4 text-ink">{e.investorName ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{e.folioNumber}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">
                      {e.schemeName ?? "—"}
                      {e.toSchemeName && <span className="text-ink-muted"> → {e.toSchemeName}</span>}
                    </td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{e.transactionType === "SO" ? "Switch Out" : e.transactionType ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{e.amount ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink-muted">{e.expiryDate ? formatDate(e.expiryDate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!isLoading && tab === "raw" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-secondary">
                  <th className="py-1.5 pr-4 font-medium">RTA</th>
                  <th className="py-1.5 pr-4 font-medium">Report</th>
                  <th className="py-1.5 pr-4 font-medium">PAN</th>
                  <th className="py-1.5 pr-4 font-medium">Folio</th>
                  <th className="py-1.5 pr-4 font-medium">AMC/Scheme</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Date</th>
                  <th className="py-1.5 font-medium">Raw Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--gridline)]">
                {data?.rawRecords.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center text-ink-muted">No raw records found for this filter.</td></tr>
                )}
                {data?.rawRecords.map((r) => {
                  const summary = Object.entries(r.rawStructuredPayload)
                    .filter(([, v]) => v !== null && v !== undefined && v !== "")
                    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
                    .join(" · ");
                  return (
                    <tr key={r.id}>
                      <td className="py-1.5 pr-4 text-ink">{r.rtaType}</td>
                      <td className="py-1.5 pr-4 text-ink-secondary">{r.reportCode}</td>
                      <td className="py-1.5 pr-4 text-ink-secondary">{r.investorPan ?? "—"}</td>
                      <td className="py-1.5 pr-4 text-ink-secondary">{r.folioNumber ?? "—"}</td>
                      <td className="py-1.5 pr-4 text-ink-secondary">{r.amcCode ?? "—"}{r.schemeCode ? `/${r.schemeCode}` : ""}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-ink-muted">{r.transactionDate ? formatDate(r.transactionDate) : "—"}</td>
                      <td className="max-w-[420px] truncate py-1.5 text-xs text-ink-secondary" title={summary}>{summary}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="border-t border-[var(--border)] px-5 py-2 text-right text-[11px] text-ink-muted">
          Snapshot as of {formatDateTime(new Date().toISOString())}
        </div>
      </div>
    </div>
  );
}
