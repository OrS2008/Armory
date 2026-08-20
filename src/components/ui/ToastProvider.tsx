import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { ToastContext, type Toast } from './toast-context';

const TONES = {
  success: 'bg-success-soft text-success border-success/30',
  error: 'bg-danger-soft text-danger border-danger/30',
  info: 'bg-info-soft text-info border-info/30',
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((tone: Toast['tone'], message: string) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, tone, message }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-center gap-2 sm:bottom-6"
      >
        {toasts.map((toast) => (
          <output
            key={toast.id}
            className={cn(
              'pointer-events-auto max-w-md rounded-[var(--radius-control)] border px-4 py-2.5 text-sm shadow-[var(--shadow-card)]',
              TONES[toast.tone],
            )}
          >
            {toast.message}
          </output>
        ))}
      </div>
    </ToastContext>
  );
}
