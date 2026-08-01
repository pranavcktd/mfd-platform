import { useState } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import {
  useAumReport,
  useBrokerageWithheldReport,
  useBusinessDevelopmentReport,
  useCapitalGainsReport,
  useCasReport,
  useClientReturnsReport,
  useDividendReport,
  useFamilyAllocationReport,
  useHoldingsReport,
  useNetWorthReport,
  useSipDueReport,
  useSipExpiringReport,
  useSipReport,
  useSipStpExpiringCamsReport,
  useStpReport,
  useSwpReport,
  useTransactionSummaryReport,
  useTransactionsReport,
  useValuationReport,
} from "../hooks/useReports";
import { useArnProfiles } from "../hooks/useDashboard";
import { Amount } from "../components/ui/Amount";
import { Pager } from "../components/ui/Pager";
import { ArnFilter } from "../components/ui/ArnFilter";
import { SearchBox } from "../components/ui/SearchBox";
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

function CapitalGainsTab({ notional, arnIds }: { notional: boolean } & TabProps) {
  const { data, isLoading } = useCapitalGainsReport(notional ? "notional" : "realized", arnIds);
  return (
    <Card title={notional ? "Notional (Unrealized) Capital Gain Report" : "Capital Gain Report (Realized)"}>
      <p className="mb-2 text-xs text-ink-muted">
        Approximate — computed with a weighted-average cost basis, not FIFO lot matching. Directionally useful for a
        quick review, not a tax-filing number.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Client</th>
            <th className="py-1.5 pr-4 font-medium">Folio / Scheme</th>
            <th className="py-1.5 text-right font-medium">{notional ? "Unrealized Gain" : "Realized Gain"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={3} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-ink-muted">No data.</td></tr>}
          {data?.map((r) => {
            const gain = Number(notional ? r.unrealizedGain : r.realizedGain);
            return (
              <tr key={r.folioId}>
                <td className="py-1.5 pr-4"><Link to={`/crm/${r.clientId}`} className="text-series-1 hover:underline">{r.clientName}</Link></td>
                <td className="py-1.5 pr-4 text-ink-secondary">{r.folioNumber} · {r.schemeName ?? "—"}</td>
                <td className={`py-1.5 text-right tabular-nums ${gain >= 0 ? "text-status-good" : "text-status-critical"}`}>
                  <Amount value={gain} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function HoldingsTab({ arnIds }: TabProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useHoldingsReport(page, arnIds, search);
  return (
    <Card title="Client Holding Report">
      <div className="mb-2 flex justify-end">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search client…" />
      </div>
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
          {isLoading && <tr><td colSpan={6} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.holdings.map((h) => (
            <tr key={h.id}>
              <td className="py-1.5 pr-4 text-ink">{h.clientName}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{h.folioNumber}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{h.schemeName ?? `${h.amcCode}/${h.schemeCode}`}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{h.balanceUnits ?? "—"}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{h.navPerUnit ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={h.valuationAmount} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
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

function ValuationTab({ arnIds }: TabProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useValuationReport(page, arnIds, search);
  return (
    <Card title="Portfolio Valuation Report (per-client folio breakdown with subtotal)">
      <div className="mb-3 flex justify-end">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search client…" />
      </div>
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
        {data?.clients.map((c) => (
          <div key={c.id} className="rounded-md border border-[var(--border)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <span className="text-sm font-medium text-ink">{c.name}</span>
              <Amount value={c.subtotal} className="tabular-nums text-sm text-ink" />
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--gridline)]">
                {c.folios.map((f) => (
                  <tr key={f.folioNumber + f.schemeCode}>
                    <td className="py-1.5 pl-3 pr-4 text-ink-secondary">{f.folioNumber}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary">{f.schemeName ?? `${f.amcCode}/${f.schemeCode}`}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{f.balanceUnits ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{f.navPerUnit ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-ink"><Amount value={f.valuationAmount} /></td>
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

function AumTab({ arnIds }: TabProps) {
  const { data, isLoading } = useAumReport(arnIds);
  return (
    <Card title="AUM Report (by AMC)">
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
  const { data, isLoading } = useSipDueReport(arnIds);
  return (
    <Card title="SIP Due Report">
      <p className="mb-2 text-xs text-ink-muted">
        Estimated from start date + frequency — no per-installment due-date field is captured by the RTA feed, so
        this is a best-effort projection, not a bank-confirmed schedule.
      </p>
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
  const { data, isLoading } = useSipExpiringReport(arnIds);
  return (
    <Card title="SIP Expiring Report (next 30 days)">
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
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search investor…" />
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
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search investor…" />
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
  const { data, isLoading } = useTransactionsReport(page, undefined, arnIds);
  return (
    <Card title="Transaction Report">
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

function ClientReturnsTab({ arnIds }: TabProps) {
  const { data, isLoading } = useClientReturnsReport(arnIds);
  return (
    <Card title="Client Returns (XIRR)">
      <p className="mb-2 text-xs text-ink-muted">
        XIRR over every purchase/redemption cash flow plus current value as-if-sold-today. Blank means not enough
        cash-flow history to compute (or it didn't converge) — not a zero return.
      </p>
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
          {isLoading && <tr><td colSpan={4} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.map((r) => (
            <tr key={r.clientId}>
              <td className="py-1.5 pr-4"><Link to={`/crm/${r.clientId}`} className="text-series-1 hover:underline">{r.clientName}</Link></td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary"><Amount value={r.totalInvested} /></td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink"><Amount value={r.currentValue} /></td>
              <td className={`py-1.5 text-right tabular-nums ${r.xirr && Number(r.xirr) >= 0 ? "text-status-good" : "text-status-critical"}`}>
                {r.xirr ? `${r.xirr}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
          {clientTab === "holdings" && <HoldingsTab arnIds={arnIds} />}
          {clientTab === "net-worth" && <NetWorthTab arnIds={arnIds} />}
          {clientTab === "family-allocation" && <FamilyAllocationTab arnIds={arnIds} />}
          {clientTab === "valuation" && <ValuationTab arnIds={arnIds} />}
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
