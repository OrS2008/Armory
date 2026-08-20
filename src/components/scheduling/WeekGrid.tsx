import type { Assignment } from '@shared/types';
import type { Conflict } from '@shared/conflicts';
import { formatDayKey, formatTime, weekdayName } from '@shared/format';
import { dayKeysInRange } from '@shared/time';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';

interface Props {
  days: string[];
  timezone: string;
  assignments: Assignment[];
  conflicts: Conflict[];
  onOpen: (assignmentId: string) => void;
  onSelectDay: (dayKey: string) => void;
}

export function WeekGrid({ days, timezone, assignments, conflicts, onOpen, onSelectDay }: Props) {
  const byDay = new Map<string, Assignment[]>();
  for (const assignment of assignments) {
    for (const key of dayKeysInRange(assignment.startAt, assignment.endAt, timezone)) {
      const list = byDay.get(key) ?? [];
      list.push(assignment);
      byDay.set(key, list);
    }
  }

  return (
    <div className="app-scrollbar overflow-x-auto">
      <div className="grid min-w-[52rem] grid-cols-7 gap-2">
        {days.map((day) => {
          const items = (byDay.get(day) ?? []).sort((a, b) => a.startAt - b.startAt);
          return (
            <section
              key={day}
              className="flex min-h-40 flex-col rounded-[var(--radius-card)] bg-surface-sunken p-2"
            >
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                className="mb-2 rounded-md px-1 py-0.5 text-start hover:bg-surface-raised"
              >
                <span className="block text-sm font-semibold">{weekdayName(day)}</span>
                <span className="ltr-inline block text-xs text-ink-faint">{formatDayKey(day)}</span>
              </button>

              <ul className="flex flex-col gap-1.5">
                {items.map((assignment) => {
                  const assignmentConflicts = conflicts.filter(
                    (conflict) => conflict.assignmentId === assignment.id,
                  );
                  const blocking = assignmentConflicts.some(
                    (conflict) => conflict.severity === 'blocking',
                  );
                  const missing = assignment.requiredHeadcount - assignment.assignees.length;
                  return (
                    <li key={`${day}-${assignment.id}`}>
                      <button
                        type="button"
                        onClick={() => onOpen(assignment.id)}
                        className={cn(
                          'w-full rounded-md border px-2 py-1.5 text-start text-xs',
                          blocking
                            ? 'border-danger/40 bg-danger-soft text-danger'
                            : assignment.publicationState === 'published'
                              ? 'border-success/30 bg-success-soft text-success'
                              : 'border-brand-200 bg-brand-50 text-brand-700',
                        )}
                      >
                        <span className="block truncate font-semibold">
                          {assignment.title ?? assignment.assignmentTypeName}
                        </span>
                        <span className="ltr-inline block opacity-80">
                          {formatTime(assignment.startAt, timezone)}–
                          {formatTime(assignment.endAt, timezone)}
                        </span>
                        {missing > 0 ? (
                          <Badge tone="warning" className="mt-1">
                            {missing === 1
                              ? t('schedule.missingOne')
                              : t('schedule.missingPerson', { count: missing })}
                          </Badge>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
