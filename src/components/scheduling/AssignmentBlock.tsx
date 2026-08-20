import type { Assignment } from '@shared/types';
import type { Conflict } from '@shared/conflicts';
import { formatRange } from '@shared/format';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import type { BlockGeometry } from './timeline';

interface Props {
  assignment: Assignment;
  geometry: BlockGeometry;
  conflicts: Conflict[];
  timezone: string;
  onOpen: (assignmentId: string) => void;
  compact?: boolean;
}

export function AssignmentBlock({
  assignment,
  geometry,
  conflicts,
  timezone,
  onOpen,
  compact = false,
}: Props) {
  const missing = assignment.requiredHeadcount - assignment.assignees.length;
  const blocking = conflicts.some((conflict) => conflict.severity === 'blocking');
  const warning = conflicts.some((conflict) => conflict.severity === 'warning');

  return (
    <button
      type="button"
      onClick={() => onOpen(assignment.id)}
      style={{
        insetInlineStart: `${geometry.offsetPercent}%`,
        inlineSize: `${Math.max(geometry.widthPercent, 4)}%`,
      }}
      className={cn(
        'absolute inset-y-1 flex flex-col justify-center gap-0.5 overflow-hidden rounded-md border px-2 text-start text-xs',
        'transition-shadow hover:shadow-[var(--shadow-card)]',
        blocking
          ? 'border-danger/40 bg-danger-soft text-danger'
          : warning
            ? 'border-warning/40 bg-warning-soft text-warning'
            : assignment.publicationState === 'published'
              ? 'border-success/30 bg-success-soft text-success'
              : 'border-brand-200 bg-brand-50 text-brand-700',
      )}
      aria-label={`${assignment.title ?? assignment.assignmentTypeName} · ${formatRange(assignment.startAt, assignment.endAt, timezone)}`}
    >
      <span className="truncate font-semibold">
        {assignment.title ?? assignment.assignmentTypeName}
      </span>
      {!compact ? (
        <span className="ltr-inline truncate opacity-80">
          {assignment.assignees.length}/{assignment.requiredHeadcount}
          {missing > 0 ? ` ⚠` : ''}
        </span>
      ) : null}
      <span className="sr-only">
        {missing > 0
          ? missing === 1
            ? t('schedule.missingOne')
            : t('schedule.missingPerson', { count: missing })
          : ''}
      </span>
    </button>
  );
}
