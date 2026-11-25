import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import type { ToastItem } from '../hooks/useVaultBeam.ts';

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-5 left-4 right-4 sm:left-auto sm:right-5 z-50 flex flex-col gap-2 sm:max-w-sm sm:w-full pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const icon =
          toast.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[var(--vb-verified)] shrink-0" />
          ) : toast.tone === 'error' ? (
            <AlertCircle className="w-4 h-4 text-[var(--vb-danger)] shrink-0" />
          ) : toast.tone === 'warning' ? (
            <TriangleAlert className="w-4 h-4 text-[var(--vb-caution)] shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-[var(--vb-accent)] shrink-0" />
          );

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl vb-panel-elevated text-sm text-[var(--vb-ink)] animate-vb-fade"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {icon}
              <span className="truncate">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-[var(--vb-ink-muted)] hover:text-[var(--vb-ink)] p-1 rounded-md cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--vb-accent)]"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
