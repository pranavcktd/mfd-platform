import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { useDistributorList, useFolderImport } from "../hooks/useSuperAdmin";
import { ApiError } from "../lib/api-client";

export function SuperAdminFolderImportPage() {
  const { data: distributors } = useDistributorList();
  const [distributorId, setDistributorId] = useState("");
  const [arnProfileId, setArnProfileId] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [camsZipPassword, setCamsZipPassword] = useState("");
  const [kfintechZipPassword, setKfintechZipPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [triggered, setTriggered] = useState<{ jobId: string; triggeredAt: string } | null>(null);
  const folderImport = useFolderImport();

  const selectedDistributor = distributors?.find((d) => d.id === distributorId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setTriggered(null);
    try {
      const result = await folderImport.mutateAsync({
        distributorId,
        arnProfileId: arnProfileId || undefined,
        folderPath,
        camsZipPassword: camsZipPassword || undefined,
        kfintechZipPassword: kfintechZipPassword || undefined,
      });
      setTriggered(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start folder import");
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Since-Inception Data Import</h1>
        <p className="text-sm text-ink-secondary">
          One-time bulk import of an MFD's historical RTA data from a folder already on the server — the same
          layout as CAMS/KFintech mailback zips (and their already-extracted DBF/CSV siblings), organized under
          "cams" / "kfintech" subfolders. After this runs once, the regular scheduled mail check (morning /
          afternoon / night) takes over for ongoing data.
        </p>
      </div>

      {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>}

      <form onSubmit={handleSubmit}>
        <Card title="Import Source">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">MFD *</label>
              <select
                value={distributorId}
                onChange={(e) => {
                  setDistributorId(e.target.value);
                  setArnProfileId("");
                }}
                required
                className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
              >
                <option value="">Select MFD…</option>
                {distributors?.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">Attribute to ARN (optional)</label>
              <select
                value={arnProfileId}
                onChange={(e) => setArnProfileId(e.target.value)}
                disabled={!selectedDistributor}
                className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1 disabled:opacity-50"
              >
                <option value="">Let the data resolve its own ARN (recommended)</option>
                {selectedDistributor?.arnProfiles.map((a) => (
                  <option key={a.id} value={a.id}>
                    ARN-{a.arnNumber}{a.parentArnProfileId ? " (child)" : " (parent)"}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-muted">
                Leave blank unless you're certain every file in this folder belongs to one specific ARN — the
                same authoritative ARN-in-data resolution used for live mail also runs on imported files.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">Server Folder Path *</label>
              <input
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                required
                placeholder={String.raw`e.g. D:\MFD_Project\basic data\data as on 17-07-2026`}
                className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus:border-series-1"
              />
              <p className="mt-1 text-xs text-ink-muted">
                A path on the server's own filesystem — not a browser upload. By default, zips are decrypted
                using this MFD's stored KFintech/CAMS zip password from onboarding.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-secondary">
                  CAMS Zip Password Override (optional)
                </label>
                <input
                  type="password"
                  value={camsZipPassword}
                  onChange={(e) => setCamsZipPassword(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-secondary">
                  KFintech Zip Password Override (optional)
                </label>
                <input
                  type="password"
                  value={kfintechZipPassword}
                  onChange={(e) => setKfintechZipPassword(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
                />
              </div>
              <p className="md:col-span-2 text-xs text-ink-muted">
                Only needed if this historical archive's zip password differs from the MFD's current
                onboarding-time password — RTAs sometimes reissue a new zip password each time report
                scheduling is set up. This override is used for this import only and never overwrites the
                MFD's stored credential.
              </p>
            </div>
            <button
              type="submit"
              disabled={folderImport.isPending}
              className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {folderImport.isPending ? "Starting…" : "Start Import"}
            </button>
          </div>
        </Card>
      </form>

      {triggered && (
        <Card title="Import Started">
          <p className="text-sm text-ink">
            Job <span className="font-mono">{triggered.jobId}</span> queued at{" "}
            {new Date(triggered.triggeredAt).toLocaleString()}.
          </p>
          <p className="mt-2 text-sm text-ink-secondary">
            Each file gets its own row in the{" "}
            <Link to={`/super-admin/mail-sync?distributorId=${distributorId}`} className="text-series-1 underline">
              Mail Sync log
            </Link>{" "}
            (from address "folder-import") — watch there for progress, decrypt/parse failures, and totals.
          </p>
        </Card>
      )}
    </div>
  );
}
