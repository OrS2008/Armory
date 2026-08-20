import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { t } from '@/i18n';
import { Button } from './Button';

/** Every screen defines loading, empty, error and permission states (plan 11). */
export function LoadingState({ label = t('state.loading') }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-ink-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title = t('state.emptyTitle'),
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Inbox className="size-8 text-ink-faint" aria-hidden />
      <p className="font-medium text-ink">{title}</p>
      {description ? <p className="max-w-md text-sm text-ink-muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const isForbidden = error instanceof ApiError && error.status === 403;
  const message = error instanceof ApiError ? error.message : t('state.errorBody');

  return (
    <div role="alert" className="flex flex-col items-center gap-2 py-12 text-center">
      {isForbidden ? (
        <Lock className="size-8 text-ink-faint" aria-hidden />
      ) : (
        <AlertTriangle className="size-8 text-warning" aria-hidden />
      )}
      <p className="font-medium text-ink">
        {isForbidden ? t('state.forbiddenTitle') : t('state.errorTitle')}
      </p>
      <p className="max-w-md text-sm text-ink-muted">
        {isForbidden ? t('state.forbiddenBody') : message}
      </p>
      {onRetry && !isForbidden ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('app.retry')}
        </Button>
      ) : null}
    </div>
  );
}

/** Renders the right state for a query result, or the loaded children. */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyDescription,
  onRetry,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyDescription?: string;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} {...(onRetry ? { onRetry } : {})} />;
  if (isEmpty)
    return <EmptyState {...(emptyDescription ? { description: emptyDescription } : {})} />;
  return <>{children}</>;
}
