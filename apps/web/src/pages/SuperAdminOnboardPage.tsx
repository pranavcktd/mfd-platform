import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "../components/ui/Card";
import {
  useBulkOnboard,
  useCreateDistributor,
  type ArnProfileInput,
  type CreateDistributorResult,
} from "../hooks/useSuperAdmin";
import { ApiError } from "../lib/api-client";

const CSV_TEMPLATE =
  "name,arnNumber,arnHolderName,camsMailId,euinNumber,panNumber,phone,gstNumber,kfintechDssLoginId,kfintechDssPassword,kfintechZipPassword,camsZipPassword";

function BulkOnboardSection() {
  const [csvText, setCsvText] = useState("");
  const bulkOnboard = useBulkOnboard();

  return (
    <Card title="Bulk Onboard from CSV">
      <p className="mb-2 text-xs text-ink-secondary">
        Required columns: name, arnNumber, arnHolderName, camsMailId. Optional: euinNumber, panNumber, phone,
        gstNumber, kfintechDssLoginId, kfintechDssPassword, kfintechZipPassword, camsZipPassword. One row per
        MFD — child ARNs aren't supported in bulk, add those individually afterward.
      </p>
      <textarea
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        placeholder={CSV_TEMPLATE}
        rows={6}
        className="mb-2 w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 font-mono text-xs text-ink outline-none focus:border-series-1"
      />
      <button
        type="button"
        onClick={() => bulkOnboard.mutate(csvText)}
        disabled={!csvText.trim() || bulkOnboard.isPending}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-ink-secondary hover:bg-[var(--gridline)]/50 disabled:opacity-50"
      >
        {bulkOnboard.isPending ? "Onboarding…" : "Onboard All Rows"}
      </button>

      {bulkOnboard.data && (
        <div className="mt-3 space-y-1 text-sm">
          <p className="text-ink">
            {bulkOnboard.data.succeeded} of {bulkOnboard.data.total} onboarded successfully.
          </p>
          {bulkOnboard.data.results.filter((r) => !r.success).length > 0 && (
            <ul className="list-inside list-disc text-xs text-status-critical">
              {bulkOnboard.data.results
                .filter((r) => !r.success)
                .map((r) => (
                  <li key={r.row}>
                    Row {r.row} ({r.name ?? "?"}): {r.error}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

const EMPTY_ARN: ArnProfileInput = {
  arnNumber: "",
  arnHolderName: "",
  euinNumber: "",
  panNumber: "",
  displayName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  camsMailId: "",
  gstNumber: "",
};

function ArnFields({
  value,
  onChange,
  requireCamsMailId,
}: {
  value: ArnProfileInput;
  onChange: (v: ArnProfileInput) => void;
  requireCamsMailId?: boolean;
}) {
  const set = (field: keyof ArnProfileInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: e.target.value });

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">ARN Number *</label>
        <input value={value.arnNumber} onChange={set("arnNumber")} required className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">ARN Holder Name *</label>
        <input value={value.arnHolderName} onChange={set("arnHolderName")} required className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">EUIN Number</label>
        <input value={value.euinNumber} onChange={set("euinNumber")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">
          CAMS Registered Mail {requireCamsMailId ? "* (becomes login email)" : ""}
        </label>
        <input
          type="email"
          value={value.camsMailId}
          onChange={set("camsMailId")}
          required={requireCamsMailId}
          className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">PAN Number</label>
        <input value={value.panNumber} onChange={set("panNumber")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">Display Name</label>
        <input value={value.displayName} onChange={set("displayName")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">Email</label>
        <input type="email" value={value.email} onChange={set("email")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">Phone</label>
        <input value={value.phone} onChange={set("phone")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">GST Number</label>
        <input value={value.gstNumber} onChange={set("gstNumber")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
      </div>
      <div className="md:col-span-3">
        <label className="mb-1 block text-xs font-medium text-ink-secondary">Address</label>
        <input value={value.address} onChange={set("address")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">City</label>
        <input value={value.city} onChange={set("city")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">State</label>
        <input value={value.state} onChange={set("state")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">Pincode</label>
        <input value={value.pincode} onChange={set("pincode")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
      </div>
    </div>
  );
}

const EMPTY_CREDENTIALS = {
  kfintechDssLoginId: "",
  kfintechDssPassword: "",
  kfintechZipPassword: "",
  camsZipPassword: "",
};

function RtaCredentialFields({
  value,
  onChange,
}: {
  value: typeof EMPTY_CREDENTIALS;
  onChange: (v: typeof EMPTY_CREDENTIALS) => void;
}) {
  const set = (field: keyof typeof EMPTY_CREDENTIALS) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: e.target.value });

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">KFintech DSS Login ID</label>
        <input value={value.kfintechDssLoginId} onChange={set("kfintechDssLoginId")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
        <p className="mt-1 text-xs text-ink-muted">Also used when scheduling RTA file delivery on the DSS portal.</p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">KFintech DSS Password</label>
        <input type="password" value={value.kfintechDssPassword} onChange={set("kfintechDssPassword")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">KFintech RTA File (Zip) Password</label>
        <input type="password" value={value.kfintechZipPassword} onChange={set("kfintechZipPassword")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
        <p className="mt-1 text-xs text-ink-muted">Used to auto-decrypt KFintech mailback zip attachments.</p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-secondary">CAMS RTA File (Zip) Password</label>
        <input type="password" value={value.camsZipPassword} onChange={set("camsZipPassword")} className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1" />
        <p className="mt-1 text-xs text-ink-muted">Used to auto-decrypt CAMS mailback zip attachments.</p>
      </div>
    </div>
  );
}

export function SuperAdminOnboardPage() {
  const [name, setName] = useState("");
  const [arnProfile, setArnProfile] = useState<ArnProfileInput>({ ...EMPTY_ARN });
  const [childArns, setChildArns] = useState<ArnProfileInput[]>([]);
  const [credentials, setCredentials] = useState({ ...EMPTY_CREDENTIALS });
  const [result, setResult] = useState<CreateDistributorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createDistributor = useCreateDistributor();
  const navigate = useNavigate();

  function addChildArn() {
    setChildArns((prev) => [...prev, { ...EMPTY_ARN }]);
  }

  function removeChildArn(index: number) {
    setChildArns((prev) => prev.filter((_, i) => i !== index));
  }

  function updateChildArn(index: number, value: ArnProfileInput) {
    setChildArns((prev) => prev.map((c, i) => (i === index ? value : c)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const created = await createDistributor.mutateAsync({
        name,
        arnProfile,
        childArnProfiles: childArns.length > 0 ? childArns : undefined,
        kfintechDssLoginId: credentials.kfintechDssLoginId || undefined,
        kfintechDssPassword: credentials.kfintechDssPassword || undefined,
        kfintechZipPassword: credentials.kfintechZipPassword || undefined,
        camsZipPassword: credentials.camsZipPassword || undefined,
      });
      setResult(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not onboard MFD");
    }
  }

  if (result) {
    return (
      <div className="max-w-lg space-y-4">
        <Card title="MFD Onboarded">
          <div className="space-y-3 text-sm">
            <p className="text-ink">
              <strong>{result.name}</strong> (ARN-{result.arnProfiles[0]?.arnNumber}) has been onboarded with{" "}
              {result.arnProfiles.length - 1} child ARN(s).
            </p>
            <div className="rounded-md border border-[var(--border)] bg-page p-3">
              <p className="text-xs text-ink-secondary">Login Email</p>
              <p className="font-mono text-ink">{result.loginEmail}</p>
              <p className="mt-2 text-xs text-ink-secondary">Initial Password</p>
              <p className="font-mono text-ink">{result.initialPassword}</p>
            </div>
            <p className="text-xs text-ink-muted">
              Share these credentials with the MFD — they should change the password after first login.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setResult(null);
                  setName("");
                  setArnProfile({ ...EMPTY_ARN });
                  setChildArns([]);
                  setCredentials({ ...EMPTY_CREDENTIALS });
                }}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-ink-secondary hover:bg-[var(--gridline)]/50"
              >
                Onboard Another
              </button>
              <button
                onClick={() => navigate("/super-admin")}
                className="rounded-md bg-series-1 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                View MFD List
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Onboard New MFD</h1>
        <p className="text-sm text-ink-secondary">
          The parent ARN's CAMS registered mail becomes the MFD's login email. Initial password is always
          "Admin@123" — the MFD changes it after first login.
        </p>
      </div>

      {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>}

      <Card title="Business Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. Naresh Kumar Singh"
          className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
        />
      </Card>

      <Card title="Parent ARN Details">
        <ArnFields value={arnProfile} onChange={setArnProfile} requireCamsMailId />
      </Card>

      {childArns.map((child, i) => (
        <Card
          key={i}
          title={`Child ARN #${i + 1}`}
          action={
            <button type="button" onClick={() => removeChildArn(i)} className="text-status-critical hover:opacity-80">
              <Trash2 size={15} />
            </button>
          }
        >
          <ArnFields value={child} onChange={(v) => updateChildArn(i, v)} />
        </Card>
      ))}

      <button
        type="button"
        onClick={addChildArn}
        className="flex items-center gap-1.5 rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-sm text-ink-secondary hover:bg-[var(--gridline)]/50"
      >
        <Plus size={14} />
        Add Child ARN (if this client has one)
      </button>

      <Card title="RTA Mail-Sync Credentials (optional)">
        <p className="mb-3 text-xs text-ink-secondary">
          Supply these now so automatic mail sync can decrypt this MFD's RTA archives right away, without a
          separate manual credential-save step. Can also be added later from the MFD's detail page.
        </p>
        <RtaCredentialFields value={credentials} onChange={setCredentials} />
      </Card>

      <div>
        <button
          type="submit"
          disabled={createDistributor.isPending}
          className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {createDistributor.isPending ? "Onboarding…" : "Onboard MFD"}
        </button>
      </div>
    </form>

      <BulkOnboardSection />
    </div>
  );
}
