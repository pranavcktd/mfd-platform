import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Wrench,
  Maximize2,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
} from "lucide-react";
import { Amount } from "../components/ui/Amount";
import { PageHeader } from "../components/ui/PageHeader";
import { PrintableModal } from "../components/ui/PrintableModal";
import { ChartTypeToggle, type ChartTypeOption } from "../components/ui/ChartTypeToggle";
import { LineSeriesChart, type LineSeriesChartSeries } from "../components/charts/LineSeriesChart";
import { PieChart } from "../components/charts/PieChart";
import { formatInrCompact, formatInrExact } from "../lib/format";

function sipFutureValue(monthlyAmount: number, annualRatePercent: number, years: number): number {
  const r = annualRatePercent / 100 / 12;
  const n = years * 12;
  if (r === 0) return monthlyAmount * n;
  return monthlyAmount * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

/** Step-up SIP: the monthly contribution itself grows by stepUpPercent every 12 months. No closed-form formula (the contribution isn't constant), so this simulates month by month. */
function stepUpSipFutureValue(
  startingMonthlyAmount: number,
  annualRatePercent: number,
  years: number,
  stepUpPercent: number,
): { futureValue: number; invested: number } {
  const monthlyRate = annualRatePercent / 100 / 12;
  let corpus = 0;
  let invested = 0;
  let currentMonthly = startingMonthlyAmount;
  for (let month = 1; month <= years * 12; month++) {
    corpus = (corpus + currentMonthly) * (1 + monthlyRate);
    invested += currentMonthly;
    if (month % 12 === 0) {
      currentMonthly *= 1 + stepUpPercent / 100;
    }
  }
  return { futureValue: corpus, invested };
}

function lumpsumFutureValue(principal: number, annualRatePercent: number, years: number): number {
  return principal * Math.pow(1 + annualRatePercent / 100, years);
}

function requiredMonthlySip(targetAmount: number, annualRatePercent: number, years: number): number {
  const r = annualRatePercent / 100 / 12;
  const n = years * 12;
  if (r === 0) return targetAmount / n;
  return targetAmount / (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
}

/** Inflation-adjusted ("real") value of a future nominal amount, in today's purchasing power. */
function realValue(nominalAmount: number, inflationPercent: number, years: number): number {
  return nominalAmount / Math.pow(1 + inflationPercent / 100, years);
}

/**
 * Present value, at retirement, of a stream of annual expenses that itself
 * grows with inflation every year — the standard "growing annuity" formula
 * used for retirement-corpus planning. Falls back to a simple annuity
 * formula in the (unusual) case postReturnPercent equals inflationPercent
 * exactly, which would otherwise divide by zero.
 */
function retirementCorpusRequired(
  annualExpenseAtRetirement: number,
  postRetirementReturnPercent: number,
  inflationPercent: number,
  yearsInRetirement: number,
): number {
  const g = inflationPercent / 100;
  const r = postRetirementReturnPercent / 100;
  if (Math.abs(r - g) < 1e-9) {
    return annualExpenseAtRetirement * yearsInRetirement;
  }
  return (annualExpenseAtRetirement * (1 - Math.pow((1 + g) / (1 + r), yearsInRetirement))) / (r - g);
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

/** Shared inflation toggle — every calculator on this page uses the same enable-checkbox + rate-input pattern, so results can be compared with and without inflation. */
function InflationToggle({
  enabled,
  onToggle,
  rate,
  onRateChange,
}: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  rate: string;
  onRateChange: (v: string) => void;
}) {
  return (
    <div className="flex items-end gap-3">
      <label className="flex items-center gap-1.5 pb-2 text-xs font-medium text-ink-secondary">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        Adjust for inflation
      </label>
      {enabled && <NumberField label="Inflation Rate" value={rate} onChange={onRateChange} suffix="%" />}
    </div>
  );
}

function ResultTile({ label, value, tone }: { label: string; value: number; tone?: "good" | "critical" | "default" }) {
  const colorClass = tone === "good" ? "text-status-good" : tone === "critical" ? "text-status-critical" : "text-series-1";
  return (
    <div>
      <p className="text-xs text-ink-secondary">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${colorClass}`}>{formatInrCompact(value)}</p>
      <p className="text-xs text-ink-muted">{formatInrExact(value)}</p>
    </div>
  );
}

/**
 * Two-level collapse: a category (Financial Calculators / Comparison of
 * Products) starts closed showing just its name; opening it reveals only
 * the tool NAMES inside, each its own nested collapse that reveals the
 * actual calculator on click — explicit user request, so a long tool list
 * doesn't turn into a wall of open forms.
 */
function CategorySection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-[var(--border)] bg-surface" open>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 hover:bg-[var(--gridline)]/20">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="text-xs text-ink-secondary">{description}</p>
        </div>
        <ChevronDown size={18} className="shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-[var(--border)] p-3">{children}</div>
    </details>
  );
}

function ToolItem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-md border border-[var(--border)]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium text-ink hover:bg-[var(--gridline)]/30">
        {title}
        <ChevronDown size={15} className="text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[var(--border)] p-4">{children}</div>
    </details>
  );
}

function SipCalculator() {
  const [monthly, setMonthly] = useState("10000");
  const [rate, setRate] = useState("12");
  const [years, setYears] = useState("10");
  const [inflationOn, setInflationOn] = useState(false);
  const [inflation, setInflation] = useState("6");

  const result = useMemo(() => {
    const m = Number(monthly) || 0;
    const r = Number(rate) || 0;
    const y = Number(years) || 0;
    const futureValue = sipFutureValue(m, r, y);
    const invested = m * y * 12;
    return { futureValue, invested, gains: futureValue - invested };
  }, [monthly, rate, years]);

  const realFutureValue = inflationOn ? realValue(result.futureValue, Number(inflation) || 0, Number(years) || 0) : null;

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <NumberField label="Monthly Investment" value={monthly} onChange={setMonthly} suffix="₹" />
        <NumberField label="Expected Annual Return" value={rate} onChange={setRate} suffix="%" />
        <NumberField label="Investment Period" value={years} onChange={setYears} suffix="years" />
      </div>
      <div className="mt-3">
        <InflationToggle enabled={inflationOn} onToggle={setInflationOn} rate={inflation} onRateChange={setInflation} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-[var(--gridline)] pt-4">
        <ResultTile label="Invested Amount" value={result.invested} tone="default" />
        <ResultTile label="Est. Gains" value={result.gains} tone="good" />
        <ResultTile label="Future Value (Nominal)" value={result.futureValue} />
      </div>
      {realFutureValue !== null && (
        <div className="mt-3 border-t border-[var(--gridline)] pt-3">
          <p className="text-xs text-ink-secondary">Future Value (Inflation-Adjusted, today's purchasing power)</p>
          <p className="mt-1 text-lg font-semibold text-status-warning">{formatInrCompact(realFutureValue)}</p>
          <p className="text-xs text-ink-muted">{formatInrExact(realFutureValue)}</p>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Assumes monthly compounding with contributions at the start of each month (annuity-due), matching the
        standard SIP convention. Illustrative only — actual returns vary with market performance.
      </p>
    </div>
  );
}

function StepUpSipCalculator() {
  const [monthly, setMonthly] = useState("10000");
  const [rate, setRate] = useState("12");
  const [years, setYears] = useState("10");
  const [stepUp, setStepUp] = useState("10");
  const [inflationOn, setInflationOn] = useState(false);
  const [inflation, setInflation] = useState("6");

  const result = useMemo(() => {
    const m = Number(monthly) || 0;
    const r = Number(rate) || 0;
    const y = Number(years) || 0;
    const s = Number(stepUp) || 0;
    const { futureValue, invested } = stepUpSipFutureValue(m, r, y, s);
    return { futureValue, invested, gains: futureValue - invested };
  }, [monthly, rate, years, stepUp]);

  const realFutureValue = inflationOn ? realValue(result.futureValue, Number(inflation) || 0, Number(years) || 0) : null;

  return (
    <div>
      <p className="mb-2 text-xs text-ink-secondary">
        Models a SIP that increases every year rather than staying flat — many advisors recommend this over a fixed
        monthly amount.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <NumberField label="Starting Monthly SIP" value={monthly} onChange={setMonthly} suffix="₹" />
        <NumberField label="Annual Step-Up" value={stepUp} onChange={setStepUp} suffix="%" />
        <NumberField label="Expected Annual Return" value={rate} onChange={setRate} suffix="%" />
        <NumberField label="Investment Period" value={years} onChange={setYears} suffix="years" />
      </div>
      <div className="mt-3">
        <InflationToggle enabled={inflationOn} onToggle={setInflationOn} rate={inflation} onRateChange={setInflation} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-[var(--gridline)] pt-4">
        <ResultTile label="Total Invested" value={result.invested} tone="default" />
        <ResultTile label="Est. Gains" value={result.gains} tone="good" />
        <ResultTile label="Future Value (Nominal)" value={result.futureValue} />
      </div>
      {realFutureValue !== null && (
        <div className="mt-3 border-t border-[var(--gridline)] pt-3">
          <p className="text-xs text-ink-secondary">Future Value (Inflation-Adjusted)</p>
          <p className="mt-1 text-lg font-semibold text-status-warning">{formatInrCompact(realFutureValue)}</p>
          <p className="text-xs text-ink-muted">{formatInrExact(realFutureValue)}</p>
        </div>
      )}
    </div>
  );
}

function LumpsumCalculator() {
  const [principal, setPrincipal] = useState("100000");
  const [rate, setRate] = useState("12");
  const [years, setYears] = useState("10");
  const [inflationOn, setInflationOn] = useState(false);
  const [inflation, setInflation] = useState("6");

  const result = useMemo(() => {
    const p = Number(principal) || 0;
    const r = Number(rate) || 0;
    const y = Number(years) || 0;
    const futureValue = lumpsumFutureValue(p, r, y);
    return { futureValue, invested: p, gains: futureValue - p };
  }, [principal, rate, years]);

  const realFutureValue = inflationOn ? realValue(result.futureValue, Number(inflation) || 0, Number(years) || 0) : null;

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <NumberField label="Lumpsum Amount" value={principal} onChange={setPrincipal} suffix="₹" />
        <NumberField label="Expected Annual Return" value={rate} onChange={setRate} suffix="%" />
        <NumberField label="Investment Period" value={years} onChange={setYears} suffix="years" />
      </div>
      <div className="mt-3">
        <InflationToggle enabled={inflationOn} onToggle={setInflationOn} rate={inflation} onRateChange={setInflation} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-[var(--gridline)] pt-4">
        <ResultTile label="Invested Amount" value={result.invested} tone="default" />
        <ResultTile label="Est. Gains" value={result.gains} tone="good" />
        <ResultTile label="Future Value (Nominal)" value={result.futureValue} />
      </div>
      {realFutureValue !== null && (
        <div className="mt-3 border-t border-[var(--gridline)] pt-3">
          <p className="text-xs text-ink-secondary">Future Value (Inflation-Adjusted)</p>
          <p className="mt-1 text-lg font-semibold text-status-warning">{formatInrCompact(realFutureValue)}</p>
          <p className="text-xs text-ink-muted">{formatInrExact(realFutureValue)}</p>
        </div>
      )}
    </div>
  );
}

function GoalCalculator() {
  const [target, setTarget] = useState("5000000");
  const [rate, setRate] = useState("12");
  const [years, setYears] = useState("15");
  const [inflationOn, setInflationOn] = useState(false);
  const [inflation, setInflation] = useState("6");

  const result = useMemo(() => {
    const t = Number(target) || 0;
    const r = Number(rate) || 0;
    const y = Number(years) || 0;
    const inflatedTarget = inflationOn ? t * Math.pow(1 + (Number(inflation) || 0) / 100, y) : t;
    return {
      nominalSip: requiredMonthlySip(t, r, y),
      inflatedTarget,
      inflatedSip: inflationOn ? requiredMonthlySip(inflatedTarget, r, y) : null,
    };
  }, [target, rate, years, inflationOn, inflation]);

  return (
    <div>
      <p className="mb-2 text-xs text-ink-secondary">
        "Target Amount" is in today's money — with inflation on, the goal itself is grown to what it'll actually
        cost by the target date before working out the required SIP.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <NumberField label="Target Amount (today's value)" value={target} onChange={setTarget} suffix="₹" />
        <NumberField label="Expected Annual Return" value={rate} onChange={setRate} suffix="%" />
        <NumberField label="Time to Goal" value={years} onChange={setYears} suffix="years" />
      </div>
      <div className="mt-3">
        <InflationToggle enabled={inflationOn} onToggle={setInflationOn} rate={inflation} onRateChange={setInflation} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--gridline)] pt-4">
        <ResultTile label="Required Monthly SIP (without inflation)" value={result.nominalSip} />
        {inflationOn && (
          <>
            <div>
              <p className="text-xs text-ink-secondary">Target Amount Adjusted for Inflation</p>
              <p className="mt-1 text-lg font-semibold text-status-warning">{formatInrCompact(result.inflatedTarget)}</p>
              <p className="text-xs text-ink-muted">{formatInrExact(result.inflatedTarget)}</p>
            </div>
            <ResultTile label="Required Monthly SIP (with inflation)" value={result.inflatedSip ?? 0} tone="critical" />
          </>
        )}
      </div>
    </div>
  );
}

function RetirementPlanningCalculator() {
  const [currentAge, setCurrentAge] = useState("35");
  const [retirementAge, setRetirementAge] = useState("60");
  const [lifeExpectancy, setLifeExpectancy] = useState("85");
  const [monthlyExpenseToday, setMonthlyExpenseToday] = useState("50000");
  const [preRetirementReturn, setPreRetirementReturn] = useState("12");
  const [postRetirementReturn, setPostRetirementReturn] = useState("7");
  const [inflation, setInflation] = useState("6");

  const result = useMemo(() => {
    const yearsToRetirement = Math.max((Number(retirementAge) || 0) - (Number(currentAge) || 0), 0);
    const yearsInRetirement = Math.max((Number(lifeExpectancy) || 0) - (Number(retirementAge) || 0), 0);
    const inflationRate = Number(inflation) || 0;
    const monthlyExpenseAtRetirement = (Number(monthlyExpenseToday) || 0) * Math.pow(1 + inflationRate / 100, yearsToRetirement);
    const annualExpenseAtRetirement = monthlyExpenseAtRetirement * 12;
    const requiredCorpus = retirementCorpusRequired(
      annualExpenseAtRetirement,
      Number(postRetirementReturn) || 0,
      inflationRate,
      yearsInRetirement,
    );
    const requiredSip = requiredMonthlySip(requiredCorpus, Number(preRetirementReturn) || 0, yearsToRetirement);
    return { yearsToRetirement, yearsInRetirement, monthlyExpenseAtRetirement, requiredCorpus, requiredSip };
  }, [currentAge, retirementAge, lifeExpectancy, monthlyExpenseToday, preRetirementReturn, postRetirementReturn, inflation]);

  return (
    <div>
      <p className="mb-2 text-xs text-ink-secondary">
        Expenses are assumed to keep growing with inflation every year through retirement too (a "growing annuity"),
        not a flat withdrawal — the more realistic assumption for a real retirement plan.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <NumberField label="Current Age" value={currentAge} onChange={setCurrentAge} suffix="yrs" />
        <NumberField label="Retirement Age" value={retirementAge} onChange={setRetirementAge} suffix="yrs" />
        <NumberField label="Life Expectancy" value={lifeExpectancy} onChange={setLifeExpectancy} suffix="yrs" />
        <NumberField label="Monthly Expense (today's value)" value={monthlyExpenseToday} onChange={setMonthlyExpenseToday} suffix="₹" />
        <NumberField label="Pre-Retirement Return" value={preRetirementReturn} onChange={setPreRetirementReturn} suffix="%" />
        <NumberField label="Post-Retirement Return" value={postRetirementReturn} onChange={setPostRetirementReturn} suffix="%" />
        <NumberField label="Inflation Rate" value={inflation} onChange={setInflation} suffix="%" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--gridline)] pt-4 md:grid-cols-3">
        <ResultTile label="Monthly Expense at Retirement" value={result.monthlyExpenseAtRetirement} tone="default" />
        <ResultTile label="Required Retirement Corpus" value={result.requiredCorpus} tone="critical" />
        <ResultTile label="Required Monthly SIP Until Then" value={result.requiredSip} />
      </div>
    </div>
  );
}

// --- Comparison of Products ---

interface ComparisonProduct {
  id: string;
  label: string;
  defaultRate: number;
  bgClass: string;
  colorVar: string;
}

// Tailwind's JIT scanner only picks up complete literal class strings in
// source, not ones assembled at runtime (e.g. `bg-${x}`) — so every class
// this component might apply is spelled out in full here, matching the
// SERIES_CLASSES pattern already established in AnalysisPage.tsx. colorVar
// is the same token, spelled as a CSS custom property, for the SVG/pie
// charts which resolve color via var() instead of a Tailwind class.
const COMPARISON_PRODUCTS: ComparisonProduct[] = [
  { id: "FD", label: "Fixed Deposit (FD)", defaultRate: 7.0, bgClass: "bg-series-1", colorVar: "--series-1" },
  { id: "RD", label: "Recurring Deposit (RD)", defaultRate: 6.5, bgClass: "bg-series-2", colorVar: "--series-2" },
  { id: "PPF", label: "Public Provident Fund (PPF)", defaultRate: 7.1, bgClass: "bg-series-3", colorVar: "--series-3" },
  { id: "NSC", label: "National Savings Certificate (NSC)", defaultRate: 7.7, bgClass: "bg-series-4", colorVar: "--series-4" },
  { id: "PLI", label: "Postal Life Insurance (PLI)", defaultRate: 6.0, bgClass: "bg-series-5", colorVar: "--series-5" },
  { id: "MF", label: "Mutual Fund (SIP/Lumpsum)", defaultRate: 12.0, bgClass: "bg-series-6", colorVar: "--series-6" },
];

type ComparisonResult = ComparisonProduct & { rate: number; invested: number; maturityValue: number; gain: number };

function ComparisonBarChart({ results, height = 160 }: { results: ComparisonResult[]; height?: number }) {
  const maxValue = Math.max(...results.map((r) => r.maturityValue), 1);
  const sortedByValue = [...results].sort((a, b) => b.maturityValue - a.maturityValue);
  return (
    <div className="flex items-end gap-4" style={{ height }}>
      {sortedByValue.map((r) => (
        <div key={r.id} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-medium text-ink">{formatInrCompact(r.maturityValue)}</span>
          <div
            className={`w-full max-w-16 rounded-t ${r.bgClass}`}
            style={{ height: `${Math.max((r.maturityValue / maxValue) * (height - 40), 2)}px` }}
            title={`${r.label}: ${formatInrExact(r.maturityValue)}`}
          />
          <span className="text-center text-[10px] text-ink-muted">{r.id}</span>
        </div>
      ))}
    </div>
  );
}

function ComparisonDataTable({ results }: { results: ComparisonResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-ink-secondary">
          <tr>
            <th className="pb-2 font-medium">Product</th>
            <th className="pb-2 text-right font-medium">Rate</th>
            <th className="pb-2 text-right font-medium">Invested</th>
            <th className="pb-2 text-right font-medium">Maturity Value</th>
            <th className="pb-2 text-right font-medium">Gain</th>
            <th className="pb-2 text-right font-medium">Gain %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--gridline)]">
          {results.map((r) => (
            <tr key={r.id}>
              <td className="py-1.5 text-ink">
                <span className={`mr-1.5 inline-block h-2 w-2 rounded-sm ${r.bgClass}`} />
                {r.label}
              </td>
              <td className="py-1.5 text-right tabular-nums text-ink-secondary">{r.rate}%</td>
              <td className="py-1.5 text-right tabular-nums text-ink-secondary"><Amount value={r.invested} /></td>
              <td className="py-1.5 text-right tabular-nums text-ink"><Amount value={r.maturityValue} /></td>
              <td className="py-1.5 text-right tabular-nums text-status-good"><Amount value={r.gain} /></td>
              <td className="py-1.5 text-right tabular-nums text-status-good">
                {r.invested > 0 ? `${((r.gain / r.invested) * 100).toFixed(1)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COMPARISON_CHART_OPTIONS: Array<ChartTypeOption<"bar" | "line" | "pie">> = [
  { value: "bar", label: "Bar", icon: BarChart3 },
  { value: "line", label: "Line", icon: LineChartIcon },
  { value: "pie", label: "Pie", icon: PieChartIcon },
];

function InvestmentComparisonCalculator() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ FD: true, PPF: true, MF: true });
  const [rates, setRates] = useState<Record<string, string>>(
    Object.fromEntries(COMPARISON_PRODUCTS.map((p) => [p.id, String(p.defaultRate)])),
  );
  const [mode, setMode] = useState<"lumpsum" | "monthly">("lumpsum");
  const [amount, setAmount] = useState("100000");
  const [years, setYears] = useState("10");
  const [chartType, setChartType] = useState<"bar" | "line" | "pie">("bar");
  const [fullView, setFullView] = useState(false);

  const results = useMemo<ComparisonResult[]>(() => {
    const y = Number(years) || 0;
    const amt = Number(amount) || 0;
    return COMPARISON_PRODUCTS.filter((p) => enabled[p.id]).map((p) => {
      const rate = Number(rates[p.id]) || 0;
      const invested = mode === "lumpsum" ? amt : amt * y * 12;
      const maturityValue = mode === "lumpsum" ? lumpsumFutureValue(amt, rate, y) : sipFutureValue(amt, rate, y);
      return { ...p, rate, invested, maturityValue, gain: maturityValue - invested };
    });
  }, [enabled, rates, mode, amount, years]);

  const growthYears = Number(years) || 0;
  const growthLabels = useMemo(() => Array.from({ length: growthYears }, (_, i) => `Y${i + 1}`), [growthYears]);
  const lineSeries = useMemo<LineSeriesChartSeries[]>(() => {
    const amt = Number(amount) || 0;
    return results.map((r) => ({
      id: r.id,
      label: r.label,
      colorVar: r.colorVar,
      values: Array.from({ length: growthYears }, (_, i) => {
        const yearN = i + 1;
        return mode === "lumpsum" ? lumpsumFutureValue(amt, r.rate, yearN) : sipFutureValue(amt, r.rate, yearN);
      }),
    }));
  }, [results, growthYears, mode, amount]);

  const pieSlices = useMemo(
    () => results.map((r) => ({ id: r.id, label: r.label, value: r.maturityValue, colorVar: r.colorVar })),
    [results],
  );

  function renderChart(height: number) {
    if (results.length === 0) return <p className="text-sm text-ink-muted">Select at least one product to compare.</p>;
    if (chartType === "bar") return <ComparisonBarChart results={results} height={height} />;
    if (chartType === "pie") return <PieChart slices={pieSlices} size={height} formatValue={formatInrCompact} />;
    if (growthYears <= 0) return <p className="text-sm text-ink-muted">Enter an investment period to see the growth trajectory.</p>;
    return <LineSeriesChart labels={growthLabels} series={lineSeries} height={height} formatValue={formatInrCompact} />;
  }

  const paramsSummary = `${mode === "lumpsum" ? "Lumpsum" : "Monthly"} ₹${amount || 0} · ${years || 0} years`;

  return (
    <div>
      <p className="mb-3 text-xs text-ink-secondary">
        Compares maturity value across product types using the SAME compounding model (standard annual/monthly
        compound interest) at each product's own editable rate — a fair side-by-side, not each product's exact
        real-world compounding nuance (which varies by product terms). Illustrative only, for client conversations.
      </p>

      <div className="mb-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Contribution Type</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "lumpsum" | "monthly")}
              className="w-full rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            >
              <option value="lumpsum">One-time Lumpsum</option>
              <option value="monthly">Monthly Contribution</option>
            </select>
          </div>
          <NumberField label={mode === "lumpsum" ? "Lumpsum Amount" : "Monthly Amount"} value={amount} onChange={setAmount} suffix="₹" />
          <NumberField label="Investment Period" value={years} onChange={setYears} suffix="years" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-secondary">Products to Compare</label>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {COMPARISON_PRODUCTS.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-md border border-[var(--border)] px-2.5 py-1.5">
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(enabled[p.id])}
                    onChange={(e) => setEnabled((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                  />
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${p.bgClass}`} />
                  <span className="text-ink">{p.label}</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={rates[p.id]}
                  onChange={(e) => setRates((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  disabled={!enabled[p.id]}
                  className="w-16 rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-right text-xs text-ink outline-none focus:border-series-1 disabled:opacity-40"
                />
                <span className="text-xs text-ink-muted">% p.a.</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--gridline)] pt-3">
        <ChartTypeToggle value={chartType} onChange={setChartType} options={COMPARISON_CHART_OPTIONS} />
        <button
          onClick={() => setFullView(true)}
          disabled={results.length === 0}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-ink hover:bg-[var(--gridline)]/30 disabled:opacity-40"
        >
          <Maximize2 size={13} /> Full View / Print
        </button>
      </div>

      {chartType !== "pie" && results.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-ink-secondary">
          {results.map((r) => (
            <span key={r.id} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${r.bgClass}`} />
              {r.label} ({r.rate}%)
            </span>
          ))}
        </div>
      )}
      {renderChart(160)}

      {results.length > 0 && (
        <div className="mt-4 border-t border-[var(--gridline)] pt-4">
          <ComparisonDataTable results={results} />
        </div>
      )}

      {fullView && (
        <PrintableModal
          title="Investment Comparison Report"
          subtitle={paramsSummary}
          onClose={() => setFullView(false)}
          toolbar={<ChartTypeToggle value={chartType} onChange={setChartType} options={COMPARISON_CHART_OPTIONS} />}
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-xs text-ink-secondary md:grid-cols-4">
              <div><span className="text-ink-muted">Mode:</span> {mode === "lumpsum" ? "One-time Lumpsum" : "Monthly Contribution"}</div>
              <div><span className="text-ink-muted">Amount:</span> {formatInrExact(Number(amount) || 0)}</div>
              <div><span className="text-ink-muted">Period:</span> {years || 0} years</div>
              <div><span className="text-ink-muted">Products:</span> {results.length}</div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Maturity Value by Product</h3>
              <ComparisonBarChart results={results} height={220} />
            </div>

            {growthYears > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">Growth Trajectory</h3>
                <LineSeriesChart labels={growthLabels} series={lineSeries} height={220} formatValue={formatInrCompact} />
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Share of Total Maturity Value</h3>
              <PieChart slices={pieSlices} size={180} formatValue={formatInrCompact} />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Data Metrics</h3>
              <ComparisonDataTable results={results} />
            </div>
          </div>
        </PrintableModal>
      )}
    </div>
  );
}

export function ToolsPage() {
  return (
    <div className="space-y-4">
      <PageHeader icon={Wrench} accent="series-4" title="Tools">
        <p className="text-sm text-ink-secondary">
          Calculators for client conversations, organized by category. A recurring scheduler for automated
          report/notification sends isn't built yet — it's a separate backend feature (job scheduling + templated
          messaging) that needs its own scoping.
        </p>
      </PageHeader>

      <CategorySection title="Financial Calculators" description="SIP, lumpsum, goal, retirement, and step-up SIP planning — each supports comparing with and without inflation.">
        <ToolItem title="SIP Future Value Calculator"><SipCalculator /></ToolItem>
        <ToolItem title="Lumpsum Future Value Calculator"><LumpsumCalculator /></ToolItem>
        <ToolItem title="Goal Planning Calculator"><GoalCalculator /></ToolItem>
        <ToolItem title="Retirement Planning Calculator"><RetirementPlanningCalculator /></ToolItem>
        <ToolItem title="Step-Up SIP Calculator"><StepUpSipCalculator /></ToolItem>
      </CategorySection>

      <CategorySection title="Comparison of Products" description="Compare potential returns across FD, RD, PPF, NSC, PLI, and mutual funds side by side, with a graphical breakdown to show clients.">
        <ToolItem title="Investment Comparison"><InvestmentComparisonCalculator /></ToolItem>
      </CategorySection>
    </div>
  );
}
