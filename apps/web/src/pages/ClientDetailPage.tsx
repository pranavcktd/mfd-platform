import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Plus, X } from "lucide-react";
import {
  useAddBankAccount,
  useAddNominee,
  useClientDetail,
  useClientSystematicInvestments,
  useClientTransactions,
  useCreatePortalLogin,
  useDisablePortalLogin,
  useFolioTransactions,
  useMarkReviewed,
  useMergeClients,
  useRemoveBankAccount,
  useRemoveNominee,
  useResetClientPortalPassword,
  type ClientBankAccount,
  type ClientNominee,
} from "../hooks/useCrm";
import { Card } from "../components/ui/Card";
import { ClientPicker } from "../components/ui/ClientPicker";
import { Amount } from "../components/ui/Amount";
import { OtherAssetValue } from "../components/ui/OtherAssetValue";
import { SearchBox } from "../components/ui/SearchBox";
import { Pager } from "../components/ui/Pager";
import { FolioHoldingsExplorer } from "../components/holdings/FolioHoldingsExplorer";
import { SystematicInvestmentsExplorer } from "../components/holdings/SystematicInvestmentsExplorer";
import { formatDate, formatInrCompact, formatInrExact } from "../lib/format";

function NomineeSection({ clientId, nominees }: { clientId: string; nominees: ClientNominee[] }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const addNominee = useAddNominee(clientId);
  const removeNominee = useRemoveNominee(clientId);

  return (
    <div className="space-y-2">
      {nominees.length === 0 && !adding && <p className="text-sm text-ink-muted">Not on file</p>}
      {nominees.map((n) => (
        <div key={n.id} className="flex items-center justify-between rounded-md border border-[var(--border)] px-2 py-1.5">
          <div className="text-sm">
            <p className="text-ink">
              {n.nomineeName}
              {n.relation ? ` (${n.relation})` : ""}
              {n.source === "RTA" && (
                <span className="ml-1.5 rounded bg-series-1/10 px-1.5 py-0.5 text-[10px] text-series-1">RTA</span>
              )}
            </p>
            {(n.email || n.mobile) && (
              <p className="text-xs text-ink-muted">{[n.email, n.mobile].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <button onClick={() => removeNominee.mutate(n.id)} className="text-ink-muted hover:text-status-critical" aria-label="Remove nominee">
            <X size={13} />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="grid grid-cols-2 gap-2 rounded-md border border-[var(--border)] p-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nominee name" className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-series-1" />
          <input value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="Relation with applicant" className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-series-1" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Nominee email" className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-series-1" />
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Nominee mobile" className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-series-1" />
          <div className="col-span-2 flex gap-2">
            <button
              disabled={!name.trim()}
              onClick={async () => {
                await addNominee.mutateAsync({ nomineeName: name.trim(), relation: relation.trim() || undefined, email: email.trim() || undefined, mobile: mobile.trim() || undefined });
                setName(""); setRelation(""); setEmail(""); setMobile(""); setAdding(false);
              }}
              className="rounded-md bg-series-1 px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              Save
            </button>
            <button onClick={() => setAdding(false)} className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-ink-secondary">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs text-ink-secondary hover:underline">
          <Plus size={12} />
          Add nominee
        </button>
      )}
    </div>
  );
}

function BankAccountsSection({ clientId, bankAccounts }: { clientId: string; bankAccounts: ClientBankAccount[] }) {
  const [adding, setAdding] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [branchName, setBranchName] = useState("");
  const addBankAccount = useAddBankAccount(clientId);
  const removeBankAccount = useRemoveBankAccount(clientId);

  return (
    <div className="space-y-2">
      {bankAccounts.length === 0 && !adding && <p className="text-xs text-ink-muted">No additional bank accounts on file.</p>}
      {bankAccounts.map((b) => (
        <div key={b.id} className="flex items-center justify-between rounded-md border border-[var(--border)] px-2 py-1.5">
          <div className="text-sm">
            <p className="text-ink">{b.bankName} · {b.accountNumber}</p>
            {(b.ifscCode || b.branchName) && (
              <p className="text-xs text-ink-muted">{[b.ifscCode, b.branchName].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <button onClick={() => removeBankAccount.mutate(b.id)} className="text-ink-muted hover:text-status-critical" aria-label="Remove bank account">
            <X size={13} />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="grid grid-cols-2 gap-2 rounded-md border border-[var(--border)] p-2">
          <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bank name" className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-series-1" />
          <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-series-1" />
          <input value={ifscCode} onChange={(e) => setIfscCode(e.target.value)} placeholder="IFSC code" className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-series-1" />
          <input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="Branch name" className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-series-1" />
          <div className="col-span-2 flex gap-2">
            <button
              disabled={!bankName.trim() || !accountNumber.trim()}
              onClick={async () => {
                await addBankAccount.mutateAsync({ bankName: bankName.trim(), accountNumber: accountNumber.trim(), ifscCode: ifscCode.trim() || undefined, branchName: branchName.trim() || undefined });
                setBankName(""); setAccountNumber(""); setIfscCode(""); setBranchName(""); setAdding(false);
              }}
              className="rounded-md bg-series-1 px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              Save
            </button>
            <button onClick={() => setAdding(false)} className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-ink-secondary">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs text-ink-secondary hover:underline">
          <Plus size={12} />
          Add bank account
        </button>
      )}
    </div>
  );
}

function NeedsReviewBanner({ clientId, reviewReason }: { clientId: string; reviewReason: string | null }) {
  const markReviewed = useMarkReviewed(clientId);
  return (
    <div className="flex items-center justify-between rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-status-warning">
        <AlertTriangle size={15} />
        {reviewReason ?? "This client needs review"}
      </span>
      <button
        onClick={() => markReviewed.mutate()}
        disabled={markReviewed.isPending}
        className="rounded-md border border-status-warning/40 px-2.5 py-1 text-xs font-medium text-status-warning hover:bg-status-warning/20 disabled:opacity-40"
      >
        {markReviewed.isPending ? "Marking…" : "Mark Reviewed"}
      </button>
    </div>
  );
}

function PortalLoginSection({
  clientId,
  portalEnabled,
  panNumber,
}: {
  clientId: string;
  portalEnabled: boolean;
  panNumber: string | null;
}) {
  const createLogin = useCreatePortalLogin(clientId);
  const disableLogin = useDisablePortalLogin(clientId);
  const resetLogin = useResetClientPortalPassword(clientId);

  return (
    <div className="space-y-2">
      {portalEnabled ? (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-status-good/10 px-2 py-0.5 text-xs text-status-good">Portal login active</span>
          <button onClick={() => resetLogin.mutate()} disabled={resetLogin.isPending} className="text-xs text-ink-secondary hover:underline">
            Reset Password
          </button>
          <button
            onClick={() => disableLogin.mutate()}
            disabled={disableLogin.isPending}
            className="text-xs text-status-critical hover:underline"
          >
            Disable
          </button>
        </div>
      ) : (
        <button
          onClick={() => createLogin.mutate()}
          disabled={createLogin.isPending || !panNumber}
          title={!panNumber ? "Client needs a PAN on file first" : undefined}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-ink-secondary hover:bg-[var(--gridline)]/50 disabled:opacity-40"
        >
          {createLogin.isPending ? "Creating…" : "Create Portal Login"}
        </button>
      )}
      {createLogin.data && (
        <div className="rounded-md border border-[var(--border)] bg-page p-2 text-xs">
          <p className="text-ink-secondary">Login ID (PAN): <span className="font-mono text-ink">{createLogin.data.loginId}</span></p>
          <p className="text-ink-secondary">Password: <span className="font-mono text-ink">{createLogin.data.initialPassword}</span></p>
          <p className="mt-1 text-ink-muted">
            {createLogin.data.welcomeEmailSent ? "Emailed to the client." : `Email not sent (${createLogin.data.welcomeEmailError}) — relay manually.`}
          </p>
        </div>
      )}
      {resetLogin.data && (
        <div className="rounded-md border border-[var(--border)] bg-page p-2 text-xs">
          <p className="text-ink-secondary">Login ID (PAN): <span className="font-mono text-ink">{resetLogin.data.loginId}</span></p>
          <p className="text-ink-secondary">
            New password: <span className="font-mono text-ink">{resetLogin.data.newPassword}</span>
          </p>
          <p className="mt-1 text-ink-muted">Relay this to the client — they can keep using it or change it, their choice.</p>
        </div>
      )}
    </div>
  );
}

/** Thin wrapper wiring the CRM's own client-scoped hook into the shared explorer component (also used by the client portal, scoped to "yourself" there instead). */
function SystematicInvestmentsSection({ clientId }: { clientId: string }) {
  const { data, isLoading } = useClientSystematicInvestments(clientId);
  return <SystematicInvestmentsExplorer registrations={data} isLoading={isLoading} />;
}

function MergeSection({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | undefined>();
  const [targetName, setTargetName] = useState<string | undefined>();
  const mergeClients = useMergeClients();
  const navigate = useNavigate();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-ink-secondary hover:underline">
        Merge this client into another…
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] p-3">
      <p className="text-xs text-ink-secondary">
        Every folio and other-asset from this client moves to the target client. This client is then hidden from the
        roster (not deleted — history is preserved).
      </p>
      <ClientPicker selectedClientId={targetId} selectedClientName={targetName} onSelect={(id, name) => { setTargetId(id); setTargetName(name); }} />
      <div className="flex gap-2">
        <button
          disabled={!targetId || mergeClients.isPending}
          onClick={async () => {
            if (!targetId) return;
            await mergeClients.mutateAsync({ sourceClientId: clientId, targetClientId: targetId });
            navigate(`/crm/${targetId}`);
          }}
          className="rounded-md bg-status-critical px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {mergeClients.isPending ? "Merging…" : "Confirm Merge"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-ink-secondary">
          Cancel
        </button>
      </div>
      {mergeClients.isError && <p className="text-xs text-status-critical">Could not merge — check both clients belong to you.</p>}
    </div>
  );
}

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { data, isLoading, isError } = useClientDetail(clientId);

  if (isLoading) {
    return <p className="text-sm text-ink-secondary">Loading…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-status-critical">Client not found.</p>;
  }

  // Backend-computed (crm.service.ts's getClientDetail) — NOT re-derived
  // here from data.folios, since a naive client-side sum of
  // valuationAmount alone silently drops any folio that's never received
  // an RTA balance report yet (real confirmed case, 2026-08-09) even
  // though it has a real estimated current value sitting right there on
  // the same folio object.
  const totalAum = Number(data.totalCurrentValue);
  const totalInvested = Number(data.totalInvestedValue);
  const gain = Number(data.gain);
  const absoluteReturnPercent = data.absoluteReturnPercent !== null ? Number(data.absoluteReturnPercent) : null;
  const xirr = data.xirr !== null ? Number(data.xirr) : null;
  const cagr = data.cagr !== null ? Number(data.cagr) : null;
  const address = [data.address1, data.address2, data.city, data.pincode].filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      <Link to="/crm" className="flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={14} />
        Back to CRM
      </Link>

      {data.needsReview && <NeedsReviewBanner clientId={data.id} reviewReason={data.reviewReason} />}

      <div>
        <h1 className="text-lg font-semibold text-ink">{data.name}</h1>
        <p className="text-sm text-ink-secondary">
          {data.panNumber ?? "No PAN on file"}
          {data.familyName ? ` · Family: ${data.familyName}${data.isFamilyHead ? " (head)" : ""}` : ""}
          {" · Client since "}
          {formatDate(data.createdAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Total AUM (Current Value)</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatInrCompact(totalAum)}</p>
          <p className="text-xs text-ink-muted">{formatInrExact(totalAum)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Total Invested</p>
          <p className="mt-1 text-xl font-semibold text-ink">{formatInrCompact(totalInvested)}</p>
          <p className="text-xs text-ink-muted">{formatInrExact(totalInvested)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Overall Gain</p>
          <p className={`mt-1 text-xl font-semibold ${gain >= 0 ? "text-status-good" : "text-status-critical"}`}>
            {gain >= 0 ? "+" : ""}{formatInrCompact(gain)}
          </p>
          <p className="text-xs text-ink-muted">{formatInrExact(gain)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Absolute Return</p>
          <p className={`mt-1 text-xl font-semibold ${absoluteReturnPercent === null ? "text-ink-muted" : absoluteReturnPercent >= 0 ? "text-status-good" : "text-status-critical"}`}>
            {absoluteReturnPercent !== null ? `${absoluteReturnPercent >= 0 ? "+" : ""}${absoluteReturnPercent.toFixed(2)}%` : "—"}
          </p>
          <p className="text-xs text-ink-muted">since inception</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">XIRR (Annualized)</p>
          <p className={`mt-1 text-xl font-semibold ${xirr === null ? "text-ink-muted" : xirr >= 0 ? "text-status-good" : "text-status-critical"}`}>
            {xirr !== null ? `${xirr >= 0 ? "+" : ""}${xirr.toFixed(2)}%` : "—"}
          </p>
          <p className="text-xs text-ink-muted">{xirr === null ? "not enough cash flows" : "money-weighted"}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">CAGR</p>
          <p className={`mt-1 text-xl font-semibold ${cagr === null ? "text-ink-muted" : cagr >= 0 ? "text-status-good" : "text-status-critical"}`}>
            {cagr !== null ? `${cagr >= 0 ? "+" : ""}${cagr.toFixed(2)}%` : "—"}
          </p>
          <p className="text-xs text-ink-muted" title="Treats total invested as a lump sum from the first purchase date — exact for a single purchase, approximate for SIP/multiple purchases. Prefer XIRR for accuracy.">
            {cagr === null ? "no purchases yet" : "approx., see XIRR"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Folios</p>
          <p className="mt-1 text-xl font-semibold text-ink">{data.folios.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Email</p>
          <p className="mt-1 text-sm text-ink">{data.email ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
          <p className="text-xs text-ink-secondary">Phone</p>
          <p className="mt-1 text-sm text-ink">{data.phone ?? "—"}</p>
        </div>
      </div>

      <Card title="Personal & Bank Details">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-ink-secondary">Address</p>
            <p className="mt-1 text-sm text-ink">{address || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Date of Birth</p>
            <p className="mt-1 text-sm text-ink">{data.dateOfBirth ? formatDate(data.dateOfBirth) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Tax Status</p>
            <p className="mt-1 text-sm text-ink">{data.taxStatus ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">Primary Bank (from RTA)</p>
            <p className="mt-1 text-sm text-ink">{data.bankName ?? "—"}</p>
            <p className="text-xs text-ink-muted">{data.bankAccountNumber ?? ""}</p>
          </div>
          <div>
            <p className="text-xs text-ink-secondary">KYC Status</p>
            <p className="mt-1 text-sm text-ink">{data.kycStatus ?? "Not captured by source reports — expected via a future RTA KYC report"}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-[var(--gridline)] pt-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-ink-secondary">Additional Bank Accounts</p>
            <BankAccountsSection clientId={data.id} bankAccounts={data.bankAccounts} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-ink-secondary">Nominees</p>
            <NomineeSection clientId={data.id} nominees={data.nominees} />
            <p className="mt-2 text-xs text-ink-muted">
              Manually maintained today — an RTA-fed nominee report is expected soon, at which point RTA-sourced
              nominees will show up here alongside anything added manually.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Client Portal Login">
          <PortalLoginSection clientId={data.id} portalEnabled={data.portalEnabled} panNumber={data.panNumber} />
        </Card>
        <Card title="Merge Client">
          <MergeSection clientId={data.id} />
        </Card>
      </div>

      <Card title="Portfolio (by AMC)">
        <FolioHoldingsExplorer
          folios={data.folios}
          useTransactions={(folioId) => useFolioTransactions(data.id, folioId)}
        />
      </Card>

      <SystematicInvestmentsSection clientId={data.id} />

      <Card title="Other Assets">
        <ul className="divide-y divide-[var(--gridline)]">
          {data.otherAssets.length === 0 && <li className="py-2 text-sm text-ink-muted">None recorded.</li>}
          {data.otherAssets.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink">
                {a.assetType}
                {a.description ? ` — ${a.description}` : ""}
              </span>
              <OtherAssetValue assetType={a.assetType} details={a.details} value={a.value} />
            </li>
          ))}
        </ul>
      </Card>

      <RecentTransactionsCard clientId={data.id} />
    </div>
  );
}

function RecentTransactionsCard({ clientId }: { clientId: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useClientTransactions(clientId, page, search);

  return (
    <Card title="Transactions">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">Every transaction across every folio, newest first.</p>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search scheme, description…" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-secondary">
              <th className="py-1.5 pr-4 font-medium">Scheme</th>
              <th className="py-1.5 pr-4 font-medium">Folio</th>
              <th className="py-1.5 pr-4 font-medium">Type</th>
              <th className="py-1.5 pr-4 text-right font-medium">Amount</th>
              <th className="py-1.5 pr-4 text-right font-medium">Units</th>
              <th className="py-1.5 pr-4 text-right font-medium">NAV</th>
              <th className="py-1.5 text-right font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {isLoading && <tr><td colSpan={7} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
            {data?.transactions.length === 0 && (
              <tr><td colSpan={7} className="py-4 text-center text-ink-muted">No transactions.</td></tr>
            )}
            {data?.transactions.map((t) => (
              <tr key={t.id} className={t.isRejection ? "bg-status-critical/5" : undefined}>
                <td className="max-w-[220px] truncate py-1.5 pr-4 text-ink" title={t.schemeName ?? undefined}>
                  {t.schemeName ?? `${t.amcCode}/${t.schemeCode}`}
                </td>
                <td className="py-1.5 pr-4 text-ink-secondary">{t.folioNumber}</td>
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
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{t.units ?? "—"}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{t.navPerUnit ?? "—"}</td>
                <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatDate(t.transactionDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}
