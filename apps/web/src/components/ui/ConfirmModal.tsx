import { AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Generic "are you sure" gate for actions that shouldn't fire on a single accidental click (delete, reset password, etc). */
export function ConfirmModal({ title, message, confirmLabel = "Confirm", destructive = true, isPending, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-lg bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start gap-3">
          <div className={`rounded-full p-2 ${destructive ? "bg-status-critical/10" : "bg-status-warning/10"}`}>
            <AlertTriangle size={18} className={destructive ? "text-status-critical" : "text-status-warning"} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            <p className="mt-1 text-xs text-ink-secondary">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)]/50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className={`rounded-md px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 ${destructive ? "bg-status-critical" : "bg-series-1"}`}
          >
            {isPending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
