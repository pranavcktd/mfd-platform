import { useState } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import { useArnCredentials, useSaveArnCredential, type ArnProfileSummary } from "../../hooks/useSuperAdmin";
import { formatDateTime } from "../../lib/format";
import { ApiError } from "../../lib/api-client";

function humanizeKey(key: string): string {
  const withSpaces = key.replace(/([a-z])([A-Z])/g, "$1 $2");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function ProviderPanel({
  distributorId,
  arnProfileId,
  provider,
  defaultFields,
}: {
  distributorId: string;
  arnProfileId: string;
  provider: "CAMS" | "KFINTECH";
  defaultFields: Array<{ key: string; label: string }>;
}) {
  const { data: credentials, isLoading } = useArnCredentials(distributorId, arnProfileId, true);
  const saveCredential = useSaveArnCredential(distributorId, arnProfileId);
  const current = credentials?.find((c) => c.provider === provider);

  const [reveal, setReveal] = useState(false);
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Real stored payloads don't always match the current onboarding form's
  // key names (confirmed live: an older KFintech credential uses loginId/
  // password, while onboarding today writes dssLoginId/dssPassword) — so
  // once a credential exists, show its ACTUAL keys, not an assumed template.
  // Only fall back to the default field set when creating one from scratch.
  const fields = current
    ? Object.keys(current.payload).map((key) => ({ key, label: humanizeKey(key) }))
    : defaultFields;

  // Seed the editable form from the live decrypted values the first time they load, without
  // clobbering in-progress edits on every background refetch.
  const displayValues = values ?? Object.fromEntries(fields.map((f) => [f.key, current?.payload[f.key] ?? ""]));

  async function handleSave() {
    setError(null);
    setSaved(false);
    try {
      await saveCredential.mutateAsync({ provider, payload: displayValues });
      setValues(null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this credential");
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{provider === "KFINTECH" ? "KFintech" : "CAMS"}</h3>
        <div className="flex items-center gap-3">
          {current && <span className="text-xs text-ink-muted">Last updated {formatDateTime(current.updatedAt)}</span>}
          <button onClick={() => setReveal((r) => !r)} className="flex items-center gap-1 text-xs text-ink-secondary hover:text-ink">
            {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
            {reveal ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-ink-muted">Loading…</p>
      ) : (
        <div className="space-y-2">
          {!current && <p className="mb-1 text-xs text-status-warning">No {provider === "KFINTECH" ? "KFintech" : "CAMS"} credential on file yet.</p>}
          {fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">{f.label}</label>
              <input
                type={reveal ? "text" : "password"}
                value={displayValues[f.key] ?? ""}
                onChange={(e) => setValues({ ...displayValues, [f.key]: e.target.value })}
                className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-1.5 font-mono text-sm text-ink outline-none focus:border-series-1"
              />
            </div>
          ))}
          {error && <p className="text-xs text-status-critical">{error}</p>}
          {saved && <p className="text-xs text-status-good">Saved — this is now the password the mail poller tries first.</p>}
          <button
            onClick={handleSave}
            disabled={saveCredential.isPending}
            className="rounded-md bg-series-1 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saveCredential.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * View/edit the RTA zip password (and KFintech DSS login) currently on file
 * for one ARN — what archive-decryption.processor.ts actually tries first
 * when unzipping a mailback file. Saving inserts a new ExternalCredential
 * row rather than overwriting (RTA passwords rotate; older archives can
 * still need an older password), same rule the distributor's own
 * self-service credential form follows.
 */
export function ArnCredentialsModal({
  distributorId,
  distributorName,
  arnProfiles,
  onClose,
}: {
  distributorId: string;
  distributorName: string;
  arnProfiles: ArnProfileSummary[];
  onClose: () => void;
}) {
  const [arnProfileId, setArnProfileId] = useState(
    arnProfiles.find((a) => !a.parentArnProfileId)?.id ?? arnProfiles[0]?.id ?? "",
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink">RTA Mail-Sync Credentials — {distributorName}</h2>
            <p className="text-xs text-ink-secondary">The exact password used to auto-unzip this MFD's mailback files. Update it here the moment CAMS/KFintech reissue a new one.</p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {arnProfiles.length > 1 && (
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-ink-secondary">ARN Profile</label>
              <select
                value={arnProfileId}
                onChange={(e) => setArnProfileId(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-1.5 text-sm text-ink"
              >
                {arnProfiles.map((a) => (
                  <option key={a.id} value={a.id}>
                    ARN-{a.arnNumber}{a.parentArnProfileId ? " (child)" : " (parent)"} — {a.arnHolderName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {arnProfileId && (
            <div className="space-y-3">
              <ProviderPanel distributorId={distributorId} arnProfileId={arnProfileId} provider="CAMS" defaultFields={[{ key: "zipPassword", label: "Zip Password" }]} />
              <ProviderPanel
                distributorId={distributorId}
                arnProfileId={arnProfileId}
                provider="KFINTECH"
                defaultFields={[
                  { key: "zipPassword", label: "Zip Password" },
                  { key: "dssLoginId", label: "DSS Login ID" },
                  { key: "dssPassword", label: "DSS Password" },
                ]}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
