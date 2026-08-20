import { useMemo, useState } from 'react';
import type { Severity } from '@shared/types';
import { severityLabels } from '@shared/messages.he';
import { DAY, startOfDay } from '@shared/time';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { todayKey } from '@/lib/datetime';
import { QueryState } from '@/components/ui/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConflictList } from '@/components/scheduling/ConflictList';
import { useConflicts } from '@/hooks/queries';

const RANGE_DAYS = 14;

export function ConflictsPage() {
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const window = useMemo(() => {
    const from = startOfDay(todayKey());
    return { from, to: from + RANGE_DAYS * DAY };
  }, []);

  const conflicts = useConflicts(window);
  const all = conflicts.data?.conflicts ?? [];
  const summary = conflicts.data?.summary ?? { blocking: 0, warning: 0, info: 0 };
  const filtered = severity === 'all' ? all : all.filter((item) => item.severity === severity);

  return (
    <>
      <PageHeader title={t('conflicts.title')} />

      <div role="tablist" className="mb-4 flex flex-wrap gap-2">
        {(['all', 'blocking', 'warning', 'info'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={severity === option}
            onClick={() => setSeverity(option)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              severity === option
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-border-subtle text-ink-muted hover:bg-surface-sunken',
            )}
          >
            {option === 'all' ? t('app.all') : severityLabels[option]}
            <span className="ltr-inline ms-1.5 text-xs">
              {option === 'all' ? all.length : summary[option]}
            </span>
          </button>
        ))}
      </div>

      <QueryState
        isLoading={conflicts.isLoading}
        error={conflicts.error}
        onRetry={() => void conflicts.refetch()}
      >
        <ConflictList conflicts={filtered} />
      </QueryState>
    </>
  );
}
