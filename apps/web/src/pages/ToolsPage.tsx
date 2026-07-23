import { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { formatInrCompact } from "../lib/format";

function sipFutureValue(monthlyAmount: number, annualRatePercent: number, years: number): number {
  const r = annualRatePercent / 100 / 12;
  const n = years * 12;
  if (r === 0) return monthlyAmount * n;
  return monthlyAmount * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

function requiredMonthlySip(targetAmount: number, annualRatePercent: number, years: number): number {
  const r = annualRatePercent / 100 / 12;
  const n = years * 12;
  if (r === 0) return targetAmount / n;
  return targetAmount / (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-secondary">{label}</label>
      <div className="relative">
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function SipCalculator() {
  const [monthly, setMonthly] = useState("10000");
  const [rate, setRate] = useState("12");
  const [years, setYears] = useState("10");

  const result = useMemo(() => {
    const m = Number(monthly) || 0;
    const r = Number(rate) || 0;
    const y = Number(years) || 0;
    const futureValue = sipFutureValue(m, r, y);
    const invested = m * y * 12;
    return { futureValue, invested, gains: futureValue - invested };
  }, [monthly, rate, years]);

  return (
    <Card title="SIP Future Value Calculator">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <NumberField label="Monthly Investment" value={monthly} onChange={setMonthly} suffix="₹" />
        <NumberField label="Expected Annual Return" value={rate} onChange={setRate} suffix="%" />
        <NumberField label="Investment Period" value={years} onChange={setYears} suffix="years" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-[var(--gridline)] pt-4">
        <div>
          <p className="text-xs text-ink-secondary">Invested Amount</p>
          <p className="mt-1 text-lg font-semibold text-ink">{formatInrCompact(result.invested)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-secondary">Est. Gains</p>
          <p className="mt-1 text-lg font-semibold text-status-good">{formatInrCompact(result.gains)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-secondary">Future Value</p>
          <p className="mt-1 text-lg font-semibold text-series-1">{formatInrCompact(result.futureValue)}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Assumes monthly compounding with contributions at the start of each month (annuity-due), matching the
        standard SIP convention. Illustrative only — actual returns vary with market performance.
      </p>
    </Card>
  );
}

function GoalCalculator() {
  const [target, setTarget] = useState("5000000");
  const [rate, setRate] = useState("12");
  const [years, setYears] = useState("15");

  const result = useMemo(() => {
    const t = Number(target) || 0;
    const r = Number(rate) || 0;
    const y = Number(years) || 0;
    return requiredMonthlySip(t, r, y);
  }, [target, rate, years]);

  return (
    <Card title="Goal Planning Calculator">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <NumberField label="Target Amount" value={target} onChange={setTarget} suffix="₹" />
        <NumberField label="Expected Annual Return" value={rate} onChange={setRate} suffix="%" />
        <NumberField label="Time to Goal" value={years} onChange={setYears} suffix="years" />
      </div>
      <div className="mt-4 border-t border-[var(--gridline)] pt-4">
        <p className="text-xs text-ink-secondary">Required Monthly SIP</p>
        <p className="mt-1 text-lg font-semibold text-series-1">{formatInrCompact(result)}</p>
      </div>
    </Card>
  );
}

export function ToolsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Tools</h1>
        <p className="text-sm text-ink-secondary">
          Financial calculators for client conversations. A recurring scheduler for automated report/notification
          sends isn't built yet — it's a separate backend feature (job scheduling + templated messaging) that needs
          its own scoping.
        </p>
      </div>
      <SipCalculator />
      <GoalCalculator />
    </div>
  );
}
