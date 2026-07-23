import { useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { useClientList } from "../hooks/useCrm";
import { formatCount, formatDate, formatInrCompact } from "../lib/format";

export function CrmPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useClientList(search, page);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">CRM — Client Master</h1>
          <p className="text-sm text-ink-secondary">
            {data ? `${formatCount(data.total)} clients` : "Loading…"}
          </p>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, PAN, email…"
            className="w-72 rounded-md border border-[var(--border)] bg-surface py-1.5 pl-8 pr-3 text-sm text-ink outline-none focus:border-series-1"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-ink-secondary">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">PAN</th>
              <th className="px-4 py-2 font-medium">Contact</th>
              <th className="px-4 py-2 font-medium">Folios</th>
              <th className="px-4 py-2 text-right font-medium">Total AUM</th>
              <th className="px-4 py-2 font-medium">Onboarded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gridline)]">
            {!isLoading && data?.clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-muted">
                  No clients found.
                </td>
              </tr>
            )}
            {data?.clients.map((c) => (
              <tr key={c.id} className="hover:bg-[var(--gridline)]/30">
                <td className="px-4 py-2">
                  <Link to={`/crm/${c.id}`} className="text-series-1 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-ink-secondary">{c.panNumber ?? "—"}</td>
                <td className="px-4 py-2 text-ink-secondary">{c.email ?? c.phone ?? "—"}</td>
                <td className="px-4 py-2 text-ink-secondary">{c.folioCount}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink">{formatInrCompact(c.totalAum)}</td>
                <td className="px-4 py-2 text-ink-muted">{formatDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between text-sm text-ink-secondary">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
