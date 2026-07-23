import { useState } from "react";
import { Card } from "../components/ui/Card";
import {
  useAumReport,
  useHoldingsReport,
  useNetWorthReport,
  useSipReport,
  useTransactionsReport,
  useValuationReport,
} from "../hooks/useReports";
import { formatCount, formatDate, formatInrCompact } from "../lib/format";

type Tab = "aum" | "transactions" | "sip" | "holdings" | "valuation" | "net-worth";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "aum", label: "AUM (by AMC)" },
  { id: "transactions", label: "Transactions" },
  { id: "sip", label: "SIP Register" },
  { id: "holdings", label: "Holdings" },
  { id: "valuation", label: "Valuation Report" },
  { id: "net-worth", label: "Client Net Worth" },
];

function Pager({ page, setPage, total, pageSize }: { page: number; setPage: (p: number) => void; total: number; pageSize: number }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-ink-secondary">
      <span>
        Page {page} of {totalPages} ({formatCount(total)} rows)
      </span>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
          className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function AumTab() {
  const { data, isLoading } = useAumReport();
  return (
    <Card title="AUM by AMC">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">AMC</th>
            <th className="py-1.5 text-right font-medium">Folios</th>
            <th className="py-1.5 text-right font-medium">AUM</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && (
            <tr>
              <td colSpan={3} className="py-4 text-center text-ink-muted">Loading…</td>
            </tr>
          )}
          {data?.map((r) => (
            <tr key={r.amcCode}>
              <td className="py-1.5 pr-4 text-ink">
                {r.sampleSchemeName ? r.sampleSchemeName.split(" - ")[0] : r.amcCode}
                <span className="ml-1 text-xs text-ink-muted">({r.amcCode})</span>
              </td>
              <td className="py-1.5 text-right tabular-nums text-ink-secondary">{r.folioCount}</td>
              <td className="py-1.5 text-right tabular-nums text-ink">{formatInrCompact(r.aum)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function TransactionsTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useTransactionsReport(page);
  return (
    <Card title="Transaction Register">
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
          {isLoading && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-ink-muted">Loading…</td>
            </tr>
          )}
          {data?.transactions.map((t) => (
            <tr key={t.id}>
              <td className="py-1.5 pr-4 text-ink">{t.clientName}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{t.schemeName ?? `${t.amcCode}/${t.schemeCode}`}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{t.transactionDescription ?? t.transactionType}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{t.amount ? formatInrCompact(t.amount) : "—"}</td>
              <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatDate(t.transactionDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

function SipTab() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"new" | "active" | "ceased" | undefined>(undefined);
  const { data, isLoading } = useSipReport(page, status);
  return (
    <Card
      title="SIP Register"
      action={
        <select
          value={status ?? ""}
          onChange={(e) => {
            setStatus((e.target.value || undefined) as typeof status);
            setPage(1);
          }}
          className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-xs text-ink"
        >
          <option value="">All</option>
          <option value="new">New this month</option>
          <option value="active">Active</option>
          <option value="ceased">Ceased</option>
        </select>
      }
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Client</th>
            <th className="py-1.5 pr-4 font-medium">Folio</th>
            <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
            <th className="py-1.5 pr-4 font-medium">Frequency</th>
            <th className="py-1.5 pr-4 font-medium">Registered</th>
            <th className="py-1.5 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-ink-muted">Loading…</td>
            </tr>
          )}
          {data?.sips.map((s) => (
            <tr key={s.id}>
              <td className="py-1.5 pr-4 text-ink">{s.clientName}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{s.folioNumber}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{s.sipAmount ? formatInrCompact(s.sipAmount) : "—"}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{s.frequency ?? "—"}</td>
              <td className="py-1.5 pr-4 text-ink-muted">{formatDate(s.registrationDate)}</td>
              <td className="py-1.5 text-right">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    s.isActive ? "bg-status-good/10 text-status-good" : "bg-[var(--gridline)] text-ink-muted"
                  }`}
                >
                  {s.isActive ? "Active" : "Ceased"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

function HoldingsTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useHoldingsReport(page);
  return (
    <Card title="Holding Report">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Client</th>
            <th className="py-1.5 pr-4 font-medium">Folio</th>
            <th className="py-1.5 pr-4 font-medium">Scheme</th>
            <th className="py-1.5 pr-4 text-right font-medium">Units</th>
            <th className="py-1.5 pr-4 text-right font-medium">NAV</th>
            <th className="py-1.5 text-right font-medium">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-ink-muted">Loading…</td>
            </tr>
          )}
          {data?.holdings.map((h) => (
            <tr key={h.id}>
              <td className="py-1.5 pr-4 text-ink">{h.clientName}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{h.folioNumber}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{h.schemeName ?? `${h.amcCode}/${h.schemeCode}`}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{h.balanceUnits ?? "—"}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{h.navPerUnit ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums text-ink">{h.valuationAmount ? formatInrCompact(h.valuationAmount) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

function ValuationTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useValuationReport(page);
  return (
    <Card title="Valuation Report (per-client folio breakdown with subtotal)">
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
        {data?.clients.map((c) => (
          <div key={c.id} className="rounded-md border border-[var(--border)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <span className="text-sm font-medium text-ink">{c.name}</span>
              <span className="tabular-nums text-sm text-ink">{formatInrCompact(c.subtotal)}</span>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--gridline)]">
                {c.folios.map((f) => (
                  <tr key={f.folioNumber + f.schemeCode}>
                    <td className="py-1.5 pl-3 pr-4 text-ink-secondary">{f.folioNumber}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{f.schemeName ?? `${f.amcCode}/${f.schemeCode}`}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{f.balanceUnits ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{f.navPerUnit ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-ink">
                      {f.valuationAmount ? formatInrCompact(f.valuationAmount) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

function NetWorthTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useNetWorthReport(page);
  return (
    <Card title="Client Net Worth (MF holdings + manually-entered other assets)">
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
          {isLoading && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-ink-muted">Loading…</td>
            </tr>
          )}
          {data?.clients.map((c) => (
            <tr key={c.id}>
              <td className="py-1.5 pr-4 text-ink">{c.name}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{formatInrCompact(c.mfAum)}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{formatInrCompact(c.otherAssetsTotal)}</td>
              <td className="py-1.5 text-right tabular-nums font-medium text-ink">{formatInrCompact(c.netWorth)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>("aum");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Reports</h1>
        <p className="text-sm text-ink-secondary">
          Distributor and client reports built from your ingested RTA data. Capital gains, family-wise, and CAS
          reports aren't available yet — they need cost-basis lot tracking, populated family groupings, and the
          Phase 3 MF Central import respectively, none of which exist in the data today.
        </p>
      </div>

      <div className="flex gap-1 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-md px-3 py-2 text-sm ${
              tab === t.id
                ? "border-b-2 border-series-1 font-medium text-series-1"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "aum" && <AumTab />}
      {tab === "transactions" && <TransactionsTab />}
      {tab === "sip" && <SipTab />}
      {tab === "holdings" && <HoldingsTab />}
      {tab === "valuation" && <ValuationTab />}
      {tab === "net-worth" && <NetWorthTab />}
    </div>
  );
}
