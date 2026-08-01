import { formatInrCompact, formatInrExact } from "../../lib/format";

/**
 * Shows the exact rupee figure as the primary value with the Cr/L-rounded
 * figure alongside in muted text — the exact value is what the user needs
 * to cross-check against source RTA/CAS data; the compact figure is what
 * the dashboard/report views showed before this existed. Drop-in
 * replacement for a bare `{formatInrCompact(x)}` JSX expression.
 */
export function Amount({
  value,
  className = "",
  compactClassName = "ml-1 text-xs text-ink-muted",
}: {
  value: string | number | null | undefined;
  className?: string;
  compactClassName?: string;
}) {
  if (value === null || value === undefined || value === "") {
    return <span className={className}>—</span>;
  }
  return (
    <span className={className}>
      {formatInrExact(value)}
      <span className={compactClassName}>({formatInrCompact(value)})</span>
    </span>
  );
}
