export interface FinancialYearOption {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
}

/** April 1 - March 31 — only offers FYs that actually overlap the client's real transaction history, not a fixed hardcoded list. */
export function financialYearOptions(minDate: string | null | undefined, maxDate: string | null | undefined): FinancialYearOption[] {
  if (!minDate || !maxDate) return [];
  const min = new Date(minDate);
  const max = new Date(maxDate);
  const fyStartYear = (d: Date) => (d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1);
  const minYear = fyStartYear(min);
  const maxYear = fyStartYear(max);
  const options: FinancialYearOption[] = [];
  for (let y = maxYear; y >= minYear; y--) {
    options.push({
      key: String(y),
      label: `FY ${y}-${String(y + 1).slice(2)}`,
      startDate: `${y}-04-01`,
      endDate: `${y + 1}-03-31`,
    });
  }
  return options;
}
