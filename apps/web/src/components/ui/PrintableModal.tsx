import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Printer } from "lucide-react";

/**
 * Full-view / printable modal, portalled to document.body (a sibling of the
 * app shell, not nested inside it) so print CSS can hide the shell entirely
 * and let this modal's own content flow normally across as many printed
 * pages as it needs — see the `.print-modal-open`/`.print-modal-portal`
 * rules in index.css. The `print-modal-open` body class also lets any
 * child render print-only content via Tailwind's `print:` variant.
 */
export function PrintableModal({
  title,
  subtitle,
  onClose,
  toolbar,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.body.classList.add("print-modal-open");
    return () => document.body.classList.remove("print-modal-open");
  }, []);

  return createPortal(
    <div className="print-modal-portal fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="print-modal-panel flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3 print:mb-2">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle && <p className="text-xs text-ink-secondary">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {toolbar}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-ink hover:bg-[var(--gridline)]/30"
            >
              <Printer size={14} /> Print / Save as PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-ink-muted hover:bg-[var(--gridline)]/30 hover:text-ink"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
