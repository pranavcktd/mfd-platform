import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Clock, AlertTriangle, ArrowLeft, UploadCloud, Trash2 } from "lucide-react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { Amount } from "../components/ui/Amount";
import { useCasImport, useCasPreview, useCasDataSummary, useDeleteCasData, type CasPreviewFolio } from "../hooks/useImportExternal";
import { ApiError } from "../lib/api-client";

type Step = "upload" | "preview" | "result";

function PreviewStep({
  file,
  password,
  folios,
  foliosSkippedNoPan,
  onBack,
  onImported,
}: {
  file: File;
  password: string;
  folios: CasPreviewFolio[];
  foliosSkippedNoPan: number;
  onBack: () => void;
  onImported: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(folios.filter((f) => !f.alreadyTrackedViaRta).map((f) => f.key)),
  );
  const casImport = useCasImport();
  const [error, setError] = useState<string | null>(null);

  const byPan = useMemo(() => {
    const groups = new Map<string, { clientName: string | null; clientExists: boolean; rows: CasPreviewFolio[] }>();
    for (const f of folios) {
      const g = groups.get(f.panNumber) ?? { clientName: f.clientName, clientExists: f.clientExists, rows: [] };
      g.rows.push(f);
      groups.set(f.panNumber, g);
    }
    return Array.from(groups.entries());
  }, [folios]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllInPan(rows: CasPreviewFolio[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (checked) next.add(r.key);
        else next.delete(r.key);
      }
      return next;
    });
  }

  function handleImport() {
    setError(null);
    casImport.mutate(
      { file, password, selectedKeys: Array.from(selected) },
      { onSuccess: onImported, onError: (err) => setError(err instanceof ApiError ? err.message : "Could not import this statement") },
    );
  }

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-ink-secondary hover:underline">
        <ArrowLeft size={12} />
        Back to upload
      </button>

      <div className="rounded-md border border-[var(--border)] bg-page p-3 text-sm">
        <p className="text-ink">
          Found {folios.length} folio(s) across {byPan.length} PAN(s). Check which ones to import — rows already
          tracked via your RTA data are unchecked by default (importing them would just be skipped as a duplicate
          anyway, but you can still select them).
        </p>
        {foliosSkippedNoPan > 0 && (
          <p className="mt-1 text-xs text-status-warning">{foliosSkippedNoPan} folio(s) had no readable PAN and can't be imported.</p>
        )}
      </div>

      {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-xs text-status-critical">{error}</p>}

      <div className="space-y-3">
        {byPan.map(([pan, group]) => {
          const allSelected = group.rows.every((r) => selected.has(r.key));
          const someSelected = group.rows.some((r) => selected.has(r.key));
          return (
            <div key={pan} className="overflow-hidden rounded-md border border-[var(--border)]">
              <div className="flex items-center justify-between bg-page px-3 py-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={(e) => toggleAllInPan(group.rows, e.target.checked)}
                  />
                  <span className="text-ink">
                    {group.clientName ?? `PAN ${pan}`}
                    {!group.clientExists && (
                      <span className="ml-2 rounded bg-status-warning/20 px-1.5 py-0.5 text-[10px] text-status-warning">new client</span>
                    )}
                  </span>
                  <span className="text-xs text-ink-muted">({pan})</span>
                </label>
                <span className="text-xs text-ink-muted">{group.rows.length} folio(s)</span>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="text-ink-secondary">
                  <tr>
                    <th className="w-8 px-3 py-1.5"></th>
                    <th className="px-3 py-1.5 font-medium">Scheme</th>
                    <th className="px-3 py-1.5 font-medium">Folio</th>
                    <th className="px-3 py-1.5 text-right font-medium">Units</th>
                    <th className="px-3 py-1.5 text-right font-medium">NAV</th>
                    <th className="px-3 py-1.5 text-right font-medium">Value</th>
                    <th className="px-3 py-1.5 text-right font-medium">Txns</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--gridline)]">
                  {group.rows.map((r) => (
                    <tr key={r.key} className={r.alreadyTrackedViaRta ? "opacity-60" : undefined}>
                      <td className="px-3 py-1.5"><input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} /></td>
                      <td className="max-w-[220px] truncate px-3 py-1.5 text-ink" title={r.schemeName}>{r.schemeName}</td>
                      <td className="px-3 py-1.5 text-ink-secondary">{r.folioNumber}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink-secondary">{r.closingUnitBalance ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink-secondary">{r.navPerUnit ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink"><Amount value={r.valuationAmount} /></td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink-secondary">{r.transactionCount}</td>
                      <td className="px-3 py-1.5">
                        {r.alreadyTrackedViaRta && (
                          <span className="rounded bg-series-1/10 px-1.5 py-0.5 text-[10px] text-series-1">Already in RTA data</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleImport}
        disabled={selected.size === 0 || casImport.isPending}
        className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {casImport.isPending ? "Importing…" : `Import Selected (${selected.size})`}
      </button>
    </div>
  );
}

function CasImportSection() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const casPreview = useCasPreview();
  const casImport = useCasImport();

  function handlePreview(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!file || !password) return;
    casPreview.mutate(
      { file, password },
      {
        onSuccess: (data) => {
          if (data.folios.length > 0) setStep("preview");
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Could not read this statement"),
      },
    );
  }

  function reset() {
    setStep("upload");
    setFile(null);
    setPassword("");
    setError(null);
    casPreview.reset();
    casImport.reset();
  }

  const newClients = casImport.data?.clients.filter((c) => c.wasNewlyCreated) ?? [];
  const allFailedFolios = casImport.data?.clients.flatMap((c) => c.foliosFailed.map((f) => ({ ...f, clientName: c.clientName }))) ?? [];

  return (
    <Card title="CAS Import (CAMS + KFintech Consolidated Statement)">
      <p className="mb-3 text-xs text-ink-secondary">
        Upload a CAS PDF — this can cover multiple family members consolidated under one statement. Each folio is
        matched to a client by its own PAN, not the whole file at once. You'll get a chance to review and pick
        exactly which folios to bring in before anything is saved.
      </p>

      {step === "upload" && (
        <form onSubmit={handlePreview} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">CAS PDF</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Statement Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full max-w-xs rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            />
          </div>
          {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-xs text-status-critical">{error}</p>}
          <button
            type="submit"
            disabled={!file || !password || casPreview.isPending}
            className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {casPreview.isPending ? "Reading…" : "Preview Statement"}
          </button>

          {casPreview.data && casPreview.data.folios.length === 0 && (
            <div className="rounded-md border border-[var(--border)] bg-page p-3 text-sm">
              <p className="text-status-critical">
                Couldn't find any folios in this statement — the PDF opened fine, but the parser didn't recognize the
                layout.
              </p>
              {casPreview.data.rawTextSample && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-ink-secondary">Show extracted text (for troubleshooting)</summary>
                  <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface p-2 text-xs text-ink-muted">
                    {casPreview.data.rawTextSample}
                  </pre>
                </details>
              )}
            </div>
          )}
        </form>
      )}

      {step === "preview" && file && casPreview.data && (
        <PreviewStep
          file={file}
          password={password}
          folios={casPreview.data.folios}
          foliosSkippedNoPan={casPreview.data.foliosSkippedNoPan}
          onBack={() => setStep("upload")}
          onImported={() => setStep("result")}
        />
      )}

      {step === "result" && casImport.data && (
        <div className="space-y-3">
          <div className="rounded-md border border-[var(--border)] bg-page p-3 text-sm">
            <p className="text-status-good">
              Imported {casImport.data.foliosSelected ?? casImport.data.foliosFound} selected folio(s) across {casImport.data.clients.length} client(s).
            </p>
            <p className="mt-1 text-xs text-ink-secondary">
              {casImport.data.clients.reduce((sum, c) => sum + c.foliosImported, 0)} saved as external (CAS) data
              {casImport.data.clients.reduce((sum, c) => sum + c.foliosMatchedExisting, 0) > 0 &&
                ` · ${casImport.data.clients.reduce((sum, c) => sum + c.foliosMatchedExisting, 0)} already tracked via your RTA data (not duplicated)`}
              {allFailedFolios.length > 0 && ` · ${allFailedFolios.length} failed`}
              .
            </p>
          </div>

          {allFailedFolios.length > 0 && (
            <div className="rounded-md border border-status-critical/40 bg-status-critical/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-status-critical">
                <AlertTriangle size={15} />
                {allFailedFolios.length} folio(s) failed to import
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {allFailedFolios.map((f, i) => (
                  <li key={i} className="text-ink-secondary">
                    {f.clientName} — {f.schemeName} ({f.folioNumber}): <span className="text-status-critical">{f.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {newClients.length > 0 && (
            <div className="rounded-md border border-status-warning/40 bg-status-warning/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-status-warning">
                <AlertTriangle size={15} />
                {newClients.length} new client{newClients.length > 1 ? "s" : ""} created — fill in their details
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {newClients.map((c) => (
                  <li key={c.clientId}>
                    <Link to={`/crm/${c.clientId}`} className="text-series-1 hover:underline">
                      {c.clientName}
                    </Link>{" "}
                    <span className="text-ink-secondary">
                      (PAN {c.panNumber}, {c.foliosImported} folio{c.foliosImported > 1 ? "s" : ""})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border border-[var(--border)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-page text-ink-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">PAN</th>
                  <th className="px-3 py-2 font-medium">Imported (External)</th>
                  <th className="px-3 py-2 font-medium">Already in RTA Data</th>
                  <th className="px-3 py-2 font-medium">Failed</th>
                  <th className="px-3 py-2 font-medium">Transactions</th>
                </tr>
              </thead>
              <tbody>
                {casImport.data.clients.map((c) => (
                  <tr key={c.clientId} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">
                      <Link to={`/crm/${c.clientId}`} className="text-series-1 hover:underline">
                        {c.clientName}
                      </Link>
                      {c.wasNewlyCreated && (
                        <span className="ml-2 rounded bg-status-warning/20 px-1.5 py-0.5 text-[10px] text-status-warning">
                          new
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">{c.panNumber}</td>
                    <td className="px-3 py-2 text-ink-secondary">{c.foliosImported}</td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {c.foliosMatchedExisting > 0 ? `${c.foliosMatchedExisting} (skipped, not duplicated)` : "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">{c.foliosFailed.length > 0 ? c.foliosFailed.length : "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {c.transactionsImported} new
                      {c.transactionsSkipped > 0 && `, ${c.transactionsSkipped} already on file`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={reset} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-ink-secondary hover:bg-[var(--gridline)]/50">
            Import Another Statement
          </button>
        </div>
      )}
    </Card>
  );
}

function CasDataManagementSection() {
  const { data: summary, isLoading } = useCasDataSummary();
  const deleteCasData = useDeleteCasData();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const allFolioIds = useMemo(() => summary?.flatMap((c) => c.folios.map((f) => f.folioId)) ?? [], [summary]);
  const selectedCount = selected.size;
  const selectedValue = useMemo(() => {
    if (!summary) return 0;
    let total = 0;
    for (const c of summary) {
      for (const f of c.folios) {
        if (selected.has(f.folioId)) total += Number(f.valuationAmount ?? 0);
      }
    }
    return total;
  }, [summary, selected]);

  function toggleFolio(folioId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(folioId)) next.delete(folioId);
      else next.add(folioId);
      return next;
    });
  }

  function toggleClient(folioIds: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of folioIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(allFolioIds) : new Set());
  }

  function handleConfirmedDelete() {
    deleteCasData.mutate(Array.from(selected), {
      onSuccess: () => {
        setConfirming(false);
        setSelected(new Set());
      },
    });
  }

  const hasData = (summary?.length ?? 0) > 0;
  const allSelected = allFolioIds.length > 0 && selected.size === allFolioIds.length;

  return (
    <Card title="Manage CAS-Imported Data">
      <p className="mb-3 text-xs text-ink-secondary">
        Removes only data brought in via CAS import (tagged separately from your regular RTA mail sync at import
        time) — your RTA-sourced folios and transactions are never touched, even for the same client. Pick specific
        funds or whole clients to delete, or select everything.
      </p>

      {isLoading && <p className="text-sm text-ink-muted">Checking what's on file…</p>}
      {!isLoading && !hasData && <p className="text-sm text-ink-muted">No CAS-imported data on file.</p>}

      {!isLoading && hasData && summary && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs font-medium text-ink-secondary">
            <input type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} />
            Select all ({allFolioIds.length} folio{allFolioIds.length !== 1 ? "s" : ""} across {summary.length} client
            {summary.length !== 1 ? "s" : ""})
          </label>

          <div className="space-y-3">
            {summary.map((c) => {
              const folioIds = c.folios.map((f) => f.folioId);
              const clientAllSelected = folioIds.every((id) => selected.has(id));
              const clientSomeSelected = folioIds.some((id) => selected.has(id));
              return (
                <div key={c.clientId} className="overflow-hidden rounded-md border border-[var(--border)]">
                  <div className="flex items-center justify-between bg-page px-3 py-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={clientAllSelected}
                        ref={(el) => { if (el) el.indeterminate = clientSomeSelected && !clientAllSelected; }}
                        onChange={(e) => toggleClient(folioIds, e.target.checked)}
                      />
                      <span className="text-ink">{c.clientName}</span>
                      {c.isAutoCreatedPendingReview && (
                        <span className="rounded bg-status-warning/20 px-1.5 py-0.5 text-[10px] text-status-warning">
                          created by CAS import
                        </span>
                      )}
                      <span className="text-xs text-ink-muted">{c.panNumber ?? "no PAN"}</span>
                    </label>
                    <span className="text-xs text-ink-muted">{c.folios.length} folio(s)</span>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="text-ink-secondary">
                      <tr>
                        <th className="w-8 px-3 py-1.5"></th>
                        <th className="px-3 py-1.5 font-medium">Scheme</th>
                        <th className="px-3 py-1.5 font-medium">AMC</th>
                        <th className="px-3 py-1.5 font-medium">Folio</th>
                        <th className="px-3 py-1.5 text-right font-medium">Txns</th>
                        <th className="px-3 py-1.5 text-right font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--gridline)]">
                      {c.folios.map((f) => (
                        <tr key={f.folioId}>
                          <td className="px-3 py-1.5">
                            <input type="checkbox" checked={selected.has(f.folioId)} onChange={() => toggleFolio(f.folioId)} />
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-1.5 text-ink" title={f.schemeName ?? undefined}>
                            {f.schemeName ?? "—"}
                          </td>
                          <td className="px-3 py-1.5 text-ink-secondary">{f.amcCode.replace(/^CAS:/, "")}</td>
                          <td className="px-3 py-1.5 text-ink-secondary">{f.folioNumber}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-ink-secondary">{f.transactionCount}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-ink"><Amount value={f.valuationAmount} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          {deleteCasData.isError && (
            <p className="rounded-md bg-status-critical/10 px-3 py-2 text-xs text-status-critical">
              {deleteCasData.error instanceof ApiError ? deleteCasData.error.message : "Could not delete this data"}
            </p>
          )}

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={selectedCount === 0}
              className="flex items-center gap-1.5 rounded-md border border-status-critical/40 px-3 py-1.5 text-sm font-medium text-status-critical hover:bg-status-critical/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={14} />
              Delete Selected ({selectedCount})
            </button>
          ) : (
            <div className="rounded-md border border-status-critical/40 bg-status-critical/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-status-critical">
                <AlertTriangle size={15} />
                This permanently deletes {selectedCount} folio(s) (<Amount value={String(selectedValue)} /> total) —
                cannot be undone. A client auto-created purely from this data is also removed if it ends up with
                nothing left after this.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={handleConfirmedDelete}
                  disabled={deleteCasData.isPending}
                  className="rounded-md bg-status-critical px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {deleteCasData.isPending ? "Deleting…" : "Yes, delete selected"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-ink-secondary hover:bg-[var(--gridline)]/50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function ImportExternalDataPage() {
  return (
    <div className="space-y-4">
      <PageHeader icon={UploadCloud} accent="series-6" title="Import External Data">
        <p className="text-sm text-ink-secondary">
          Bring in data your regular RTA mail sync doesn't cover — a client's full CAS, or (later) a live MFCentral
          connection.
        </p>
      </PageHeader>

      <Card title="MFCentral">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Clock size={15} />
          Coming later — direct MFCentral integration for live holdings/transaction pulls.
        </div>
      </Card>

      <CasImportSection />
      <CasDataManagementSection />
    </div>
  );
}
