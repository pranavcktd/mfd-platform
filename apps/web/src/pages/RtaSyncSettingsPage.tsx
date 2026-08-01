import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { useArnProfiles, useSaveCredential } from "../hooks/useArnProfiles";
import { ApiError } from "../lib/api-client";

function ProviderCredentialForm({
  arnProfileId,
  provider,
  title,
  description,
}: {
  arnProfileId: string;
  provider: "CAMS" | "KFINTECH";
  title: string;
  description: string;
}) {
  const [zipPassword, setZipPassword] = useState("");
  const [dssLoginId, setDssLoginId] = useState("");
  const [dssPassword, setDssPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const saveCredential = useSaveCredential();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const payload: Record<string, string> = {};
    if (zipPassword) payload.zipPassword = zipPassword;
    if (provider === "KFINTECH") {
      if (dssLoginId) payload.dssLoginId = dssLoginId;
      if (dssPassword) payload.dssPassword = dssPassword;
    }
    if (Object.keys(payload).length === 0) {
      setError("Enter at least one value to save.");
      return;
    }
    try {
      await saveCredential.mutateAsync({ arnProfileId, provider, payload });
      setSaved(true);
      setZipPassword("");
      setDssLoginId("");
      setDssPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save credential");
    }
  }

  return (
    <Card title={title}>
      <p className="mb-3 text-xs text-ink-secondary">{description}</p>
      {error && <p className="mb-2 rounded-md bg-status-critical/10 px-3 py-2 text-xs text-status-critical">{error}</p>}
      {saved && (
        <p className="mb-2 rounded-md bg-status-good/10 px-3 py-2 text-xs text-status-good">
          Saved. New RTA mail for this ARN will use this password on the next sync.
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        {provider === "KFINTECH" && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">DSS Login ID</label>
              <input
                value={dssLoginId}
                onChange={(e) => setDssLoginId(e.target.value)}
                placeholder="Leave blank to keep unchanged"
                className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">DSS Password</label>
              <input
                type="password"
                value={dssPassword}
                onChange={(e) => setDssPassword(e.target.value)}
                placeholder="Leave blank to keep unchanged"
                className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
              />
            </div>
          </>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-secondary">
            {provider === "CAMS" ? "CAMS" : "KFintech"} RTA File (Zip) Password
          </label>
          <input
            type="password"
            value={zipPassword}
            onChange={(e) => setZipPassword(e.target.value)}
            placeholder="Leave blank to keep unchanged"
            className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
          />
        </div>
        <button
          type="submit"
          disabled={saveCredential.isPending}
          className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saveCredential.isPending ? "Saving…" : "Save"}
        </button>
      </form>
    </Card>
  );
}

export function RtaSyncSettingsPage() {
  const { data: arnProfiles, isLoading } = useArnProfiles();
  const [arnProfileId, setArnProfileId] = useState("");

  const selected = arnProfiles?.find((a) => a.id === arnProfileId) ?? arnProfiles?.[0];

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader icon={KeyRound} accent="series-5" title="RTA Sync Settings">
        <p className="text-sm text-ink-secondary">
          CAMS and KFintech occasionally reissue your RTA file password whenever report scheduling is set up
          again. If your mail sync starts failing, update the password here yourself — no need to wait on
          support. The previous password stays on file too, in case older mail still needs it.
        </p>
      </PageHeader>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      {arnProfiles && arnProfiles.length > 0 && (
        <>
          {arnProfiles.length > 1 && (
            <div className="max-w-xs">
              <label className="mb-1 block text-xs font-medium text-ink-secondary">ARN</label>
              <select
                value={selected?.id ?? ""}
                onChange={(e) => setArnProfileId(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
              >
                {arnProfiles.map((a) => (
                  <option key={a.id} value={a.id}>
                    ARN-{a.arnNumber}
                    {a.parentArnProfileId ? " (child)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selected && (
            <>
              <ProviderCredentialForm
                arnProfileId={selected.id}
                provider="CAMS"
                title="CAMS"
                description="Used to auto-decrypt CAMS mailback zip attachments for this ARN."
              />
              <ProviderCredentialForm
                arnProfileId={selected.id}
                provider="KFINTECH"
                title="KFintech"
                description="DSS portal login (also used when scheduling RTA file delivery) and the zip password used to auto-decrypt KFintech mailback attachments for this ARN."
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
