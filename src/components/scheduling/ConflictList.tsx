import type { Conflict } from '@shared/conflicts';
import { severityLabels } from '@shared/messages.he';
import { t } from '@/i18n';
import { Badge } from '@/components/ui/Badge';
import { severityTone } from '@/components/ui/badge-tones';
import { EmptyState } from '@/components/ui/States';

/**
 * Conflicts are always shown with what happened, who it affects and how to
 * resolve it — never a bare warning icon (plan section 6.6).
 */
export function ConflictList({ conflicts }: { conflicts: Conflict[] }) {
  if (conflicts.length === 0) return <EmptyState description={t('conflicts.none')} />;

  return (
    <ul className="flex flex-col gap-2">
      {conflicts.map((conflict) => (
        <li
          key={conflict.id}
          className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-raised p-3"
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tone={severityTone[conflict.severity]}>
              {severityLabels[conflict.severity]}
            </Badge>
            <span className="text-sm font-medium">{conflict.subject}</span>
            <span className="ms-auto text-xs text-ink-faint">{conflict.code}</span>
          </div>
          <p className="text-sm text-ink">{conflict.message}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {t('conflicts.resolution')}: {conflict.resolution}
          </p>
        </li>
      ))}
    </ul>
  );
}
