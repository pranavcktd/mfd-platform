import { formatInrCompact, formatInrExact } from "../../lib/format";

/**
 * Profit/loss between a fund's current value and its invested (cost-basis)
 * value, with a percentage return — colored status-good (green) for a real
 * gain, status-critical (red) for a real loss, plain ink for flat/unknown.
 * A tiny ±0.005 dead zone avoids a floating-point rounding artifact (e.g.
 * -0.001) reading as a "loss" in red when it's really break-even.
 * Percentage is omitted (not shown as 0%/blank) when investedAmount is ~0 —
 * dividing by near-zero cost would produce a meaningless, wildly swinging
 * percentage.
 */
export function GainLossStat({
  investedAmount,
  currentValue,
  className = "",
}: {
  investedAmount: string | number | null | undefined;
  currentValue: number;
  className?: string;
}) {
  const invested = Number(investedAmount ?? 0);
  const gain = currentValue - invested;
  const gainPercent = invested > 0.01 ? (gain / invested) * 100 : null;

  const colorClass = gain > 0.005 ? "text-status-good" : gain < -0.005 ? "text-status-critical" : "text-ink-secondary";
  const sign = gain > 0.005 ? "+" : gain < -0.005 ? "" : "";

  return (
    <span className={`${colorClass} ${className}`} title={formatInrExact(gain)}>
      {sign}
      {formatInrCompact(gain)}
      {gainPercent !== null && (
        <span className="ml-1">
          ({sign}
          {gainPercent.toFixed(2)}%)
        </span>
      )}
    </span>
  );
}
