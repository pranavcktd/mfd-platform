export function Pager({
  page,
  setPage,
  total,
  pageSize,
}: {
  page: number;
  setPage: (p: number) => void;
  total: number;
  pageSize: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-ink-secondary">
      <span>
        Page {page} of {totalPages} ({total.toLocaleString("en-IN")} rows)
      </span>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
          className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
