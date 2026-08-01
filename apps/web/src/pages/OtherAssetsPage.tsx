import { useState } from "react";
import { Wallet } from "lucide-react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { useClientList } from "../hooks/useCrm";
import {
  useCreateOtherAsset,
  useDeleteOtherAsset,
  useEquityIsinSearch,
  useOtherAssets,
  useUpdateOtherAsset,
  type EquityIsinMasterRow,
  type OtherAsset,
} from "../hooks/useOtherAssets";
import { OtherAssetValue } from "../components/ui/OtherAssetValue";
import { formatDate, formatInrCompact } from "../lib/format";

type AssetType = "EQUITY_SHARES" | "FIXED_DEPOSIT" | "INSURANCE" | "OTHER";

const ASSET_TYPES: Array<{ value: AssetType; label: string }> = [
  { value: "EQUITY_SHARES", label: "Equity Shares" },
  { value: "FIXED_DEPOSIT", label: "Fixed Deposit" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "OTHER", label: "Other" },
];

const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1";
const labelClass = "mb-1 block text-xs font-medium text-ink-secondary";

interface SubFormProps {
  initial?: OtherAsset;
  onSubmit: (payload: { value: number; description?: string; details: Record<string, unknown> }) => void;
  submitting: boolean;
}

function EquitySharesForm({ initial, onSubmit, submitting }: SubFormProps) {
  const d = initial?.details;
  const [stockQuery, setStockQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<EquityIsinMasterRow | null>(
    d && typeof d.isin === "string"
      ? {
          isin: d.isin,
          companyName: typeof d.stockName === "string" ? d.stockName : (initial?.description ?? d.isin),
          nseSymbol: typeof d.nseSymbol === "string" ? d.nseSymbol : null,
          bseScripCode: typeof d.bseScripCode === "string" ? d.bseScripCode : null,
          bseScripId: null,
          isTradedOnNse: Boolean(d.nseSymbol),
          isTradedOnBse: Boolean(d.bseScripCode),
          preferredExchange: "NSE",
          lastClosePrice: null,
          lastPriceDate: null,
        }
      : null,
  );
  const [quantity, setQuantity] = useState(d?.quantity != null ? String(d.quantity) : "");
  const [buyDate, setBuyDate] = useState(typeof d?.buyDate === "string" ? d.buyDate : "");
  const [buyPrice, setBuyPrice] = useState(d?.buyPricePerUnit != null ? String(d.buyPricePerUnit) : "");
  const [currentPrice, setCurrentPrice] = useState(d?.currentPricePerUnit != null ? String(d.currentPricePerUnit) : "");

  const { data: matches } = useEquityIsinSearch(stockQuery);
  const computedValue = Number(quantity || 0) * Number(currentPrice || 0);

  function selectStock(stock: EquityIsinMasterRow) {
    setSelectedStock(stock);
    setStockQuery("");
    if (stock.lastClosePrice && !currentPrice) {
      setCurrentPrice(stock.lastClosePrice);
    }
  }

  function handleSubmit() {
    if (!selectedStock || !quantity || !currentPrice) return;
    onSubmit({
      value: computedValue,
      description: selectedStock.companyName,
      details: {
        stockName: selectedStock.companyName,
        isin: selectedStock.isin,
        nseSymbol: selectedStock.nseSymbol ?? undefined,
        bseScripCode: selectedStock.bseScripCode ?? undefined,
        quantity: Number(quantity),
        buyDate: buyDate || undefined,
        buyPricePerUnit: buyPrice ? Number(buyPrice) : undefined,
        currentPricePerUnit: Number(currentPrice),
      },
    });
    if (!initial) {
      setSelectedStock(null);
      setQuantity("");
      setBuyDate("");
      setBuyPrice("");
      setCurrentPrice("");
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Stock</label>
        {selectedStock ? (
          <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm">
            <span className="text-ink">
              {selectedStock.companyName}
              <span className="ml-1.5 text-ink-muted">
                ({selectedStock.nseSymbol ? `NSE: ${selectedStock.nseSymbol}` : ""}
                {selectedStock.nseSymbol && selectedStock.bseScripCode ? " | " : ""}
                {selectedStock.bseScripCode ? `BSE: ${selectedStock.bseScripCode}` : ""})
              </span>
            </span>
            <button type="button" onClick={() => setSelectedStock(null)} className="text-xs text-series-1 hover:underline">
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              value={stockQuery}
              onChange={(e) => setStockQuery(e.target.value)}
              placeholder="Search by company name, NSE symbol, BSE scrip code, or ISIN…"
              className={inputClass}
            />
            {matches && matches.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-[var(--border)] bg-surface shadow-lg">
                {matches.map((s) => (
                  <li key={s.isin}>
                    <button type="button" onClick={() => selectStock(s)} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-[var(--gridline)]/50">
                      {s.companyName}
                      <span className="ml-1.5 text-xs text-ink-muted">
                        ({s.nseSymbol ? `NSE: ${s.nseSymbol}` : ""}{s.nseSymbol && s.bseScripCode ? " | " : ""}{s.bseScripCode ? `BSE: ${s.bseScripCode}` : ""})
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {stockQuery.trim().length >= 2 && matches?.length === 0 && (
              <p className="mt-1 text-xs text-ink-muted">No match in the NSE/BSE equity master.</p>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Quantity</label>
          <input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Buy Date</label>
          <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Buy Price / Unit (₹, optional)</label>
          <input type="number" min="0" step="0.01" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Current Price / Unit (₹)</label>
          <input type="number" min="0" step="0.01" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} className={inputClass} />
          <p className="mt-1 text-xs text-ink-muted">
            {selectedStock?.lastClosePrice
              ? `Prefilled from the last imported BSE close (${selectedStock.lastPriceDate ? formatDate(selectedStock.lastPriceDate) : "date unknown"}) — override if you have a more current price.`
              : "Entered manually — no live market feed is wired up yet."}
          </p>
        </div>
        <div>
          <label className={labelClass}>Computed Current Value</label>
          <div className={`${inputClass} bg-page text-ink-secondary`}>{formatInrCompact(computedValue || 0)}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !selectedStock || !quantity || !currentPrice}
        className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {submitting ? "Saving…" : initial ? "Save Changes" : "Add Equity Holding"}
      </button>
    </div>
  );
}

function FixedDepositForm({ initial, onSubmit, submitting }: SubFormProps) {
  const d = initial?.details;
  const [bankName, setBankName] = useState(typeof d?.bankName === "string" ? d.bankName : "");
  const [fdNumber, setFdNumber] = useState(typeof d?.fdNumber === "string" ? d.fdNumber : "");
  const [principal, setPrincipal] = useState(d?.principal != null ? String(d.principal) : "");
  const [interestRate, setInterestRate] = useState(d?.interestRate != null ? String(d.interestRate) : "");
  const [startDate, setStartDate] = useState(typeof d?.startDate === "string" ? d.startDate : "");
  const [maturityDate, setMaturityDate] = useState(typeof d?.maturityDate === "string" ? d.maturityDate : "");
  const [currentValue, setCurrentValue] = useState(initial ? initial.value : "");

  function handleSubmit() {
    if (!bankName || !principal) return;
    onSubmit({
      value: Number(currentValue || principal),
      description: `${bankName} FD${fdNumber ? ` — ${fdNumber}` : ""}`,
      details: {
        bankName,
        fdNumber: fdNumber || undefined,
        principal: Number(principal),
        interestRate: interestRate ? Number(interestRate) : undefined,
        startDate: startDate || undefined,
        maturityDate: maturityDate || undefined,
      },
    });
    if (!initial) {
      setBankName("");
      setFdNumber("");
      setPrincipal("");
      setInterestRate("");
      setStartDate("");
      setMaturityDate("");
      setCurrentValue("");
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Bank Name</label>
          <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>FD Number (optional)</label>
          <input value={fdNumber} onChange={(e) => setFdNumber(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Principal Amount (₹)</label>
          <input type="number" min="0" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Interest Rate (% p.a., optional)</label>
          <input type="number" min="0" step="0.01" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Maturity Date</label>
          <input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Current Value (₹, defaults to principal)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={currentValue}
            onChange={(e) => setCurrentValue(e.target.value)}
            placeholder={principal || "0"}
            className={inputClass}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !bankName || !principal}
        className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {submitting ? "Saving…" : initial ? "Save Changes" : "Add Fixed Deposit"}
      </button>
    </div>
  );
}

function InsuranceForm({ initial, onSubmit, submitting }: SubFormProps) {
  const d = initial?.details;
  const [provider, setProvider] = useState(typeof d?.provider === "string" ? d.provider : "");
  const [policyNumber, setPolicyNumber] = useState(typeof d?.policyNumber === "string" ? d.policyNumber : "");
  const [policyType, setPolicyType] = useState(typeof d?.policyType === "string" ? d.policyType : "");
  const [sumAssured, setSumAssured] = useState(d?.sumAssured != null ? String(d.sumAssured) : "");
  const [premiumAmount, setPremiumAmount] = useState(d?.premiumAmount != null ? String(d.premiumAmount) : "");
  const [maturityDate, setMaturityDate] = useState(typeof d?.maturityDate === "string" ? d.maturityDate : "");
  const [currentValue, setCurrentValue] = useState(initial ? initial.value : "");

  function handleSubmit() {
    if (!provider || !policyNumber) return;
    onSubmit({
      value: Number(currentValue || 0),
      description: `${provider}${policyType ? ` ${policyType}` : ""} — ${policyNumber}`,
      details: {
        provider,
        policyNumber,
        policyType: policyType || undefined,
        sumAssured: sumAssured ? Number(sumAssured) : undefined,
        premiumAmount: premiumAmount ? Number(premiumAmount) : undefined,
        maturityDate: maturityDate || undefined,
      },
    });
    if (!initial) {
      setProvider("");
      setPolicyNumber("");
      setPolicyType("");
      setSumAssured("");
      setPremiumAmount("");
      setMaturityDate("");
      setCurrentValue("");
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Insurance Provider</label>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Policy Number</label>
          <input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Policy Type (Term / ULIP / Endowment…)</label>
          <input value={policyType} onChange={(e) => setPolicyType(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Sum Assured (₹, optional)</label>
          <input type="number" min="0" step="0.01" value={sumAssured} onChange={(e) => setSumAssured(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Premium Amount (₹, optional)</label>
          <input type="number" min="0" step="0.01" value={premiumAmount} onChange={(e) => setPremiumAmount(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Maturity / Next Due Date</label>
          <input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Current / Surrender Value (₹)</label>
          <input type="number" min="0" step="0.01" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} className={inputClass} />
          <p className="mt-1 text-xs text-ink-muted">
            Not the sum assured — this is what counts toward net worth. Leave 0 if unknown.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !provider || !policyNumber}
        className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {submitting ? "Saving…" : initial ? "Save Changes" : "Add Insurance Policy"}
      </button>
    </div>
  );
}

function OtherAssetForm({ initial, onSubmit, submitting }: SubFormProps) {
  const [description, setDescription] = useState(initial?.description ?? "");
  const [value, setValue] = useState(initial ? initial.value : "");

  function handleSubmit() {
    if (!description || !value) return;
    onSubmit({ value: Number(value), description, details: {} });
    if (!initial) {
      setDescription("");
      setValue("");
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Real Estate, Gold, PPF…" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Value (₹)</label>
          <input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
        </div>
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !description || !value}
        className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {submitting ? "Saving…" : initial ? "Save Changes" : "Add Asset"}
      </button>
    </div>
  );
}

export function OtherAssetsPage() {
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("EQUITY_SHARES");
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editingAsset, setEditingAsset] = useState<OtherAsset | null>(null);

  const { data: clientResults } = useClientList(clientSearch, 1);
  const { data: assets, isLoading } = useOtherAssets();
  const createAsset = useCreateOtherAsset();
  const updateAsset = useUpdateOtherAsset();
  const deleteAsset = useDeleteOtherAsset();

  const activeAssetType = editingAsset ? (editingAsset.assetType as AssetType) : assetType;
  const submitting = editingAsset ? updateAsset.isPending : createAsset.isPending;

  function handleSubForm(payload: { value: number; description?: string; details: Record<string, unknown> }) {
    if (editingAsset) {
      updateAsset.mutate(
        { id: editingAsset.id, description: payload.description, value: payload.value, asOfDate, details: payload.details },
        { onSuccess: () => setEditingAsset(null) },
      );
      return;
    }
    if (!selectedClientId) return;
    createAsset.mutate({
      clientId: selectedClientId,
      assetType,
      description: payload.description,
      value: payload.value,
      asOfDate,
      details: payload.details,
    });
  }

  function startEdit(asset: OtherAsset) {
    setEditingAsset(asset);
    setAsOfDate(asset.asOfDate.slice(0, 10));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingAsset(null);
    setAsOfDate(new Date().toISOString().slice(0, 10));
  }

  function handleRemove(asset: OtherAsset) {
    if (!window.confirm(`Remove this asset (${asset.description ?? asset.assetType}) for ${asset.clientName}?`)) return;
    deleteAsset.mutate(asset.id);
  }

  return (
    <div className="space-y-4">
      <PageHeader icon={Wallet} accent="series-1" title="Other Assets">
        <p className="text-sm text-ink-secondary">
          Manually record a client's non-MF holdings so their net worth report reflects more than just mutual fund
          AUM. The form below changes based on the asset type you pick.
        </p>
      </PageHeader>

      <Card title={editingAsset ? `Editing: ${editingAsset.clientName} — ${ASSET_TYPES.find((t) => t.value === editingAsset.assetType)?.label ?? editingAsset.assetType}` : "Add an Asset"}>
        <div className="space-y-3">
          {editingAsset ? (
            <div className="flex items-center justify-between rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-sm">
              <span className="text-ink">Editing an existing entry — client and asset type can't be changed here.</span>
              <button type="button" onClick={cancelEdit} className="text-xs text-series-1 hover:underline">
                Cancel Edit
              </button>
            </div>
          ) : (
            <div>
              <label className={labelClass}>Client</label>
              {selectedClientId ? (
                <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm">
                  <span className="text-ink">{selectedClientName}</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedClientId(null); setSelectedClientName(""); }}
                    className="text-xs text-series-1 hover:underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Search client by name or PAN…"
                    className={inputClass}
                  />
                  {clientSearch && clientResults && clientResults.clients.length > 0 && (
                    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-[var(--border)] bg-surface shadow-lg">
                      {clientResults.clients.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => { setSelectedClientId(c.id); setSelectedClientName(c.name); }}
                            className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-[var(--gridline)]/50"
                          >
                            {c.name} {c.panNumber ? `(${c.panNumber})` : ""}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Asset Type</label>
              <select
                value={activeAssetType}
                onChange={(e) => setAssetType(e.target.value as AssetType)}
                disabled={Boolean(editingAsset)}
                className={`${inputClass} disabled:opacity-60`}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>As Of Date</label>
              <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className={inputClass} />
            </div>
          </div>

          {!editingAsset && !selectedClientId && (
            <p className="text-xs text-status-warning">Pick a client above before filling in the asset details.</p>
          )}

          <div className={!editingAsset && !selectedClientId ? "pointer-events-none opacity-40" : ""}>
            {activeAssetType === "EQUITY_SHARES" && <EquitySharesForm initial={editingAsset ?? undefined} onSubmit={handleSubForm} submitting={submitting} />}
            {activeAssetType === "FIXED_DEPOSIT" && <FixedDepositForm initial={editingAsset ?? undefined} onSubmit={handleSubForm} submitting={submitting} />}
            {activeAssetType === "INSURANCE" && <InsuranceForm initial={editingAsset ?? undefined} onSubmit={handleSubForm} submitting={submitting} />}
            {activeAssetType === "OTHER" && <OtherAssetForm initial={editingAsset ?? undefined} onSubmit={handleSubForm} submitting={submitting} />}
          </div>
        </div>
      </Card>

      <Card title="All Recorded Assets">
        <ul className="divide-y divide-[var(--gridline)]">
          {isLoading && <li className="py-2 text-sm text-ink-muted">Loading…</li>}
          {assets?.length === 0 && <li className="py-2 text-sm text-ink-muted">No assets recorded yet.</li>}
          {assets?.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="text-ink">{a.clientName}</span>
                <span className="ml-2 text-ink-secondary">
                  {ASSET_TYPES.find((t) => t.value === a.assetType)?.label ?? a.assetType}
                  {a.description ? ` — ${a.description}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <OtherAssetValue assetType={a.assetType} details={a.details} value={a.value} />
                <span className="tabular-nums text-ink-muted">{formatDate(a.asOfDate)}</span>
                <button type="button" onClick={() => startEdit(a)} className="text-xs text-series-1 hover:underline">
                  Edit
                </button>
                <button type="button" onClick={() => handleRemove(a)} className="text-xs text-status-critical hover:underline">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
