import clsx from 'clsx';
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';
export function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span className={clsx('status-badge', `status-${tone}`)}>
      <span aria-hidden="true" className="status-dot" />
      {children}
    </span>
  );
}
