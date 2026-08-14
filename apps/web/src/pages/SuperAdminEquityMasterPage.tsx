import { useRef, useState, type FormEvent } from "react";
import { Download, FileSpreadsheet, FileText, Upload } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Pager } from "../components/ui/Pager";
import { SearchBox } from "../components/ui/SearchBox";
import {
  useEquityIsinMasterImport,
  useEquityIsinMasterUpload,
  useEquityIsinMasterLogs,
  useEquityIsinMasterData,
  type EquityIsinImportResult,
  type EquityIsinMasterRow,
} from "../hooks/useSuperAdmin";
import { ApiError } from "../lib/api-client";
import { downloadCsv, downloadXlsx, downloadTxt } from "../lib/export";
import { formatCount, formatDate, formatDateTime } from "../lib/format";

const DATA_EXPORT_HEADERS = ["ISIN", "Company", "NSE Symbol", "BSE Scrip Code", "BSE Scrip ID", "Traded NSE", "Traded BSE", "Preferred Exchange", "Last Close", "Last Price Date"];

function dataExportRows(rows: EquityIsinMasterRow[]) {
  return rows.map((r) => [
    r.isin, r.companyName, r.nseSymbol ?? "", r.bseScripCode ?? "", r.bseScripId ?? "",
    r.isTradedOnNse ? "Yes" : "No", r.isTradedOnBse ? "Yes" : "No", r.preferredExchange,
    r.lastClosePrice ?? "", r.lastPriceDate ? formatDate(r.lastPriceDate) : "",
  ]);
}

function ImportLogsCard() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useEquityIsinMasterLogs(page);
  return (
    <Card title="Import History">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">Triggered</th>
            <th className="py-1.5 pr-4 font-medium">Status</th>
            <th className="py-1.5 pr-4 font-medium">Folder</th>
            <th className="py-1.5 pr-4 font-medium">Files Used</th>
            <th className="py-1.5 pr-4 text-right font-medium">Total ISINs</th>
            <th className="py-1.5 pr-4 text-right font-medium">Upserted</th>
            <th className="py-1.5 font-medium">Detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={7} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.logs.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-ink-muted">No imports run yet.</td></tr>}
          {data?.logs.map((log) => (
            <tr key={log.id}>
              <td className="py-1.5 pr-4 text-ink-muted">{formatDateTime(log.triggeredAt)}</td>
              <td className="py-1.5 pr-4">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    log.status === "COMPLETED" ? "bg-status-good/10 text-status-good" : log.status === "FAILED" ? "bg-status-critical/10 text-status-critical" : "bg-[var(--gridline)] text-ink-muted"
                  }`}
                >
                  {log.status}
                </span>
              </td>
              <td className="max-w-[220px] truncate py-1.5 pr-4 font-mono text-xs text-ink-secondary" title={log.folderPath}>{log.folderPath}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{log.nseFile && log.bseFile ? `${log.nseFile}, ${log.bseFile}` : "—"}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{log.totalIsins !== null ? formatCount(log.totalIsins) : "—"}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{log.upserted !== null ? formatCount(log.upserted) : "—"}</td>
              <td className="max-w-[200px] truncate py-1.5 text-xs text-ink-muted" title={log.errorMessage ?? undefined}>{log.errorMessage ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

function DataBrowserCard() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useEquityIsinMasterData(page, search);

  return (
    <Card title="Browse Master Data">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search company, ISIN, NSE/BSE symbol…" />
        {data && data.rows.length > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={() => downloadCsv("equity-isin-master.csv", DATA_EXPORT_HEADERS, dataExportRows(data.rows))} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
              <Download size={13} /> CSV
            </button>
            <button onClick={() => downloadXlsx("equity-isin-master.xlsx", "Equity ISIN Master", DATA_EXPORT_HEADERS, dataExportRows(data.rows))} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
              <FileSpreadsheet size={13} /> Excel
            </button>
            <button onClick={() => downloadTxt("equity-isin-master.txt", DATA_EXPORT_HEADERS, dataExportRows(data.rows))} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50">
              <FileText size={13} /> TXT
            </button>
          </div>
        )}
      </div>
      <p className="mb-2 text-xs text-ink-muted">Export reflects only the current page (search to narrow down, or page through for the full set).</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-secondary">
            <th className="py-1.5 pr-4 font-medium">ISIN</th>
            <th className="py-1.5 pr-4 font-medium">Company</th>
            <th className="py-1.5 pr-4 font-medium">NSE</th>
            <th className="py-1.5 pr-4 font-medium">BSE</th>
            <th className="py-1.5 pr-4 font-medium">Preferred</th>
            <th className="py-1.5 pr-4 text-right font-medium">Last Close</th>
            <th className="py-1.5 text-right font-medium">As Of</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {isLoading && <tr><td colSpan={7} className="py-4 text-center text-ink-muted">Loading…</td></tr>}
          {data?.rows.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-ink-muted">No matching rows.</td></tr>}
          {data?.rows.map((r) => (
            <tr key={r.isin}>
              <td className="py-1.5 pr-4 font-mono text-xs text-ink-secondary">{r.isin}</td>
              <td className="py-1.5 pr-4 text-ink">{r.companyName}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{r.nseSymbol ?? "—"}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{r.bseScripCode ?? "—"}</td>
              <td className="py-1.5 pr-4 text-ink-secondary">{r.preferredExchange}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{r.lastClosePrice ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums text-ink-muted">{r.lastPriceDate ? formatDate(r.lastPriceDate) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager page={page} setPage={setPage} total={data.total} pageSize={data.pageSize} />}
    </Card>
  );
}

function ImportResultCard({ result }: { result: EquityIsinImportResult }) {
  return (
    <Card title="Import Result">
      <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs text-ink-secondary">Total Unique ISINs</p>
          <p className="mt-1 text-lg font-semibold text-ink">{formatCount(result.totalIsins)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-secondary">Upserted</p>
          <p className="mt-1 text-lg font-semibold text-status-good">{formatCount(result.upserted)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-secondary">Traded on Both</p>
          <p className="mt-1 text-lg font-semibold text-ink">{formatCount(result.tradedOnBoth)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-secondary">NSE Only</p>
          <p className="mt-1 text-lg font-semibold text-ink">{formatCount(result.nseOnly)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-secondary">BSE Only</p>
          <p className="mt-1 text-lg font-semibold text-ink">{formatCount(result.bseOnly)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-secondary">With Close Price</p>
          <p className="mt-1 text-lg font-semibold text-ink">{formatCount(result.withPriceData)}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Files used: {result.nseFile}, {result.bseFile}
      </p>
    </Card>
  );
}

export function SuperAdminEquityMasterPage() {
  const [folderPath, setFolderPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nseFile, setNseFile] = useState<File | null>(null);
  const [bseFile, setBseFile] = useState<File | null>(null);
  const nseInputRef = useRef<HTMLInputElement>(null);
  const bseInputRef = useRef<HTMLInputElement>(null);
  const importMutation = useEquityIsinMasterImport();
  const uploadMutation = useEquityIsinMasterUpload();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await importMutation.mutateAsync(folderPath);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not import the equity master");
    }
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!nseFile || !bseFile) return;
    try {
      await uploadMutation.mutateAsync({ nseFile, bseFile });
      setNseFile(null);
      setBseFile(null);
      if (nseInputRef.current) nseInputRef.current.value = "";
      if (bseInputRef.current) bseInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not import the equity master");
    }
  }

  const latestResult = uploadMutation.data ?? importMutation.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Equity ISIN Master</h1>
        <p className="text-sm text-ink-secondary">
          The global NSE + BSE listed-equity reference every MFD's "Other Assets → Equity Shares" form searches
          against. Re-run this any time you have a fresher NSE/BSE export — it's a full refresh (upsert by ISIN),
          not a one-time seed.
        </p>
      </div>

      {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>}

      <form onSubmit={handleUpload} className="max-w-2xl">
        <Card title="Upload NSE + BSE Files">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-secondary">NSE Equity List</label>
                <input
                  ref={nseInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => setNseFile(e.target.files?.[0] ?? null)}
                  required
                  className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-1.5 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-[var(--gridline)] file:px-2 file:py-1 file:text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-secondary">BSE Equity List</label>
                <input
                  ref={bseInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => setBseFile(e.target.files?.[0] ?? null)}
                  required
                  className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-1.5 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-[var(--gridline)] file:px-2 file:py-1 file:text-xs"
                />
              </div>
            </div>
            <p className="text-xs text-ink-muted">
              The two exchange-provided CSV exports, whatever their exact filename/date suffix — joined on ISIN.
            </p>
            <button
              type="submit"
              disabled={uploadMutation.isPending || !nseFile || !bseFile}
              className="flex items-center gap-1.5 rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <Upload size={14} />
              {uploadMutation.isPending ? "Uploading…" : "Upload & Refresh Master"}
            </button>
          </div>
        </Card>
      </form>

      <form onSubmit={handleSubmit} className="max-w-2xl">
        <Card title="Or Import from Server Folder Path (Advanced)">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">Server Folder Path</label>
              <input
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                required
                placeholder={String.raw`e.g. D:\MFD_Project\basic data\Equity-Stock-Asset-ISIN`}
                className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus:border-series-1"
              />
              <p className="mt-1 text-xs text-ink-muted">
                A path on the server's own filesystem — not a browser upload. The folder must contain one
                NSE_EQUITY_List* file and one BSE_EQUITY_List* file (any date suffix); they're joined on ISIN.
              </p>
            </div>
            <button
              type="submit"
              disabled={importMutation.isPending}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-[var(--gridline)]/50 disabled:opacity-50"
            >
              {importMutation.isPending ? "Importing…" : "Import / Refresh Master"}
            </button>
          </div>
        </Card>
      </form>

      {latestResult && <ImportResultCard result={latestResult} />}

      <ImportLogsCard />
      <DataBrowserCard />
    </div>
  );
}
