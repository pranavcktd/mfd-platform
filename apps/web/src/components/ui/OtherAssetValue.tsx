import { Amount } from "./Amount";
import { computeOtherAssetInvestedAmount, computeProfitPercent } from "../../lib/other-asset-value";

export function OtherAssetValue({
  assetType,
  details,
  value,
}: {
  assetType: string;
  details: Record<string, unknown> | null;
  value: string;
}) {
  const investedAmount = computeOtherAssetInvestedAmount(assetType, details);
  const profitPercent = computeProfitPercent(investedAmount, Number(value));

  return (
    <div className="text-right">
      <Amount value={value} className="tabular-nums text-ink" />
      {investedAmount !== null && (
        <p className="text-xs text-ink-muted">
          Invested <Amount value={investedAmount} className="tabular-nums" />
          {profitPercent !== null && (
            <span className={`ml-1.5 font-medium ${profitPercent >= 0 ? "text-status-good" : "text-status-critical"}`}>
              {profitPercent >= 0 ? "+" : ""}{profitPercent.toFixed(1)}%
            </span>
          )}
        </p>
      )}
    </div>
  );
}
