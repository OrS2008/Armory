import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('card p-4 sm:p-5', className)}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const accents = {
    neutral: 'text-ink',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  } as const;

  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="text-sm text-ink-muted">{label}</span>
      <strong className={cn('ltr-inline text-3xl font-semibold tabular-nums', accents[tone])}>
        {value}
      </strong>
      {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
    </div>
  );
}
