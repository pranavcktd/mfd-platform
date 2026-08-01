import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, FileWarning } from "lucide-react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { ArnFilter } from "../components/ui/ArnFilter";
import { SearchBox } from "../components/ui/SearchBox";
import { Pager } from "../components/ui/Pager";
import { useMisCheck, useMisCounts, type MisCheck } from "../hooks/useMis";
import { useMarkReviewed } from "../hooks/useCrm";
import { useArnProfiles } from "../hooks/useDashboard";
import { formatCount, formatDate } from "../lib/format";

const TABS: Array<{ id: MisCheck; label: string; description: string }> = [
  { id: "no-nominee", label: "Clients Without Nominee", description: "No nominee on file — add one from the client's detail page (Personal & Bank Details card)." },
  { id: "no-investment", label: "Clients Without Investment", description: "Client records with zero linked folios." },
  { id: "no-sip", label: "Clients Not in SIP", description: "Clients with folios but no active SIP registration." },
  { id: "zero-balance", label: "Zero-Balance Folios", description: "Folios with no valuation amount or a zero balance." },
  { id: "no-pan", label: "Folios Without PAN", description: "Folios whose client has no PAN on record." },
  { id: "needs-review", label: "Needs Review", description: "Auto-created by CAS import from a PAN with no existing match — fill in remaining details, then mark reviewed." },
  { id: "kyc-failed", label: "KYC Failed", description: "From CAMS's KYC status report (WBR56) — any folio reported as something other than KYC OK." },
  { id: "aadhaar-not-linked", label: "Aadhaar Not Linked", description: "From CAMS's KYC status report (WBR56) — folios with a KYC report on file but no linked Aadhaar." },
];

const FOLIO_TABS = new Set<MisCheck>(["zero-balance", "no-pan"]);
const KYC_TABS = new Set<MisCheck>(["kyc-failed", "aadhaar-not-linked"]);

function MarkReviewedButton({ clientId }: { clientId: string }) {
  const markReviewed = useMarkReviewed(clientId);
  return (
    <button
      onClick={() => markReviewed.mutate()}
      disabled={markReviewed.isPending}
      className="rounded-md border border-status-warning/40 px-2.5 py-1 text-xs font-medium text-status-warning hover:bg-status-warning/20 disabled:opacity-40"
    >
      {markReviewed.isPending ? "Marking…" : "Mark Reviewed"}
    </button>
  );
}

export function MisPage() {
  const [tab, setTab] = useState<MisCheck>("no-nominee");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [arnIds, setArnIds] = useState<string[]>([]);
  const { data: arnProfiles } = useArnProfiles();
  const { data: counts } = useMisCounts(arnIds);
  const { data, isLoading } = useMisCheck(tab, page, search, arnIds);
  const activeTab = TABS.find((t) => t.id === tab)!;
  const isFolioTab = FOLIO_TABS.has(tab);
  const isKycTab = KYC_TABS.has(tab);
  const colSpan = isKycTab ? 4 : 2;

  function selectTab(id: MisCheck) {
    setTab(id);
    setPage(1);
    setSearch("");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader icon={FileWarning} accent="series-3" title="MIS — Compliance & Hygiene">
          <p className="text-sm text-ink-secondary">
            Eight data-quality checks derived from your data. Nominee is manually maintained (the RTA feed doesn't
            carry it); KYC/Aadhaar status comes from CAMS's WBR56 report — everything else comes straight from
            ingested folios/SIPs.
          </p>
        </PageHeader>
        {arnProfiles && <ArnFilter arnProfiles={arnProfiles} selectedIds={arnIds} onChange={(ids) => { setArnIds(ids); setPage(1); }} />}
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => selectTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === t.id
                ? "bg-series-1 font-medium text-white"
                : "border border-[var(--border)] text-ink-secondary hover:bg-[var(--gridline)]/50"
            }`}
          >
            {t.label}
            {counts && ` (${formatCount(counts[t.id])})`}
          </button>
        ))}
      </div>

      <Card title={activeTab.label}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            {tab === "needs-review" && <AlertTriangle size={13} />}
            {activeTab.description}
          </p>
          <SearchBox
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder={isFolioTab || isKycTab ? "Search client…" : "Search name, PAN…"}
          />
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--gridline)] text-left text-xs text-ink-secondary">
              {isKycTab ? (
                <>
                  <th className="py-1.5 pr-4 font-medium">Client</th>
                  <th className="py-1.5 pr-4 font-medium">Folio</th>
                  <th className="py-1.5 pr-4 font-medium">{tab === "kyc-failed" ? "KYC Status" : "Aadhaar Status"}</th>
                  <th className="py-1.5 text-right font-medium">As Of</th>
                </>
              ) : isFolioTab ? (
                <>
                  <th className="py-1.5 pr-4 font-medium">Client</th>
                  <th className="py-1.5 font-medium">Folio</th>
                </>
              ) : tab === "no-investment" ? (
                <>
                  <th className="py-1.5 pr-4 font-medium">Client</th>
                  <th className="py-1.5 text-right font-medium">Onboarded</th>
                </>
              ) : tab === "needs-review" ? (
                <>
                  <th className="py-1.5 pr-4 font-medium">Client</th>
                  <th className="py-1.5 text-right font-medium">Action</th>
                </>
              ) : (
                <>
                  <th className="py-1.5 pr-4 font-medium">Client</th>
                  <th className="py-1.5 text-right font-medium">PAN</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {isLoading && <tr><td colSpan={colSpan} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
            {data?.rows.length === 0 && <tr><td colSpan={colSpan} className="py-4 text-center text-ink-muted">None.</td></tr>}
            {data?.rows.map((r) =>
              isKycTab ? (
                <tr key={r.id}>
                  <td className="py-2 pr-4">
                    {r.clientId ? (
                      <Link to={`/crm/${r.clientId}`} className="text-series-1 hover:underline">{r.clientName}</Link>
                    ) : (
                      r.clientName
                    )}
                  </td>
                  <td className="py-2 pr-4 text-ink-secondary">{r.folioNumber} · {r.amcCode}/{r.schemeCode}</td>
                  <td className="py-2 pr-4 text-ink-secondary">
                    {tab === "kyc-failed"
                      ? (r.kycStatusDescription ?? r.kycStatus ?? "—")
                      : (r.aadhaarStatus ?? "Not linked")}
                  </td>
                  <td className="py-2 text-right tabular-nums text-ink-muted">{r.kycReportDate && formatDate(r.kycReportDate)}</td>
                </tr>
              ) : isFolioTab ? (
                <tr key={r.id}>
                  <td className="py-2 pr-4 text-ink">{r.clientName}</td>
                  <td className="py-2 text-ink-secondary">
                    {r.folioNumber} · {r.amcCode}/{r.schemeCode}
                    {r.balanceAsOfDate && <span className="ml-2 text-ink-muted">as of {formatDate(r.balanceAsOfDate)}</span>}
                  </td>
                </tr>
              ) : tab === "no-investment" ? (
                <tr key={r.id}>
                  <td className="py-2 pr-4"><Link to={`/crm/${r.id}`} className="text-series-1 hover:underline">{r.name}</Link></td>
                  <td className="py-2 text-right tabular-nums text-ink-muted">{r.createdAt && formatDate(r.createdAt)}</td>
                </tr>
              ) : tab === "needs-review" ? (
                <tr key={r.id}>
                  <td className="py-2 pr-4">
                    <Link to={`/crm/${r.id}`} className="text-series-1 hover:underline">{r.name}</Link>
                    <p className="text-xs text-ink-muted">{r.panNumber ?? "No PAN"}{r.reviewReason ? ` · ${r.reviewReason}` : ""}</p>
                  </td>
                  <td className="py-2 text-right"><MarkReviewedButton clientId={r.id} /></td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td className="py-2 pr-4"><Link to={`/crm/${r.id}`} className="text-series-1 hover:underline">{r.name}</Link></td>
                  <td className="py-2 text-right text-ink-secondary">{r.panNumber ?? "No PAN"}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>

        {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
      </Card>
    </div>
  );
}
