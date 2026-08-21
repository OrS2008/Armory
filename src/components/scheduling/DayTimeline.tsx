import type { Assignment } from '@shared/types';
import type { Conflict } from '@shared/conflicts';
import { t } from '@/i18n';
import { EmptyState } from '@/components/ui/States';
import { AssignmentBlock } from './AssignmentBlock';
import { blockGeometry, dayWindow, hourTicks } from './timeline';

interface Props {
  dayKey: string;
  timezone: string;
  assignments: Assignment[];
  conflicts: Conflict[];
  onOpen: (assignmentId: string) => void;
}

/** Rows = assignments, columns = time. RTL: the day starts on the right. */
export function DayTimeline({ dayKey, timezone, assignments, conflicts, onOpen }: Props) {
  const window = dayWindow(dayKey, timezone);
  const ticks = hourTicks(window);
  const visible = assignments.filter((assignment) =>
    blockGeometry(window, assignment.startAt, assignment.endAt),
  );

  if (visible.length === 0) {
    return <EmptyState title={t('schedule.emptyDay')} description={t('schedule.emptyDayHint')} />;
  }

  return (
    <div className="app-scrollbar overflow-x-auto">
      <div className="min-w-[48rem]">
        <div className="mb-1 flex border-b border-border-subtle pb-1 ps-40">
          <div className="relative h-5 flex-1">
            {ticks.map((tick) => {
              const geometry = blockGeometry(window, tick.at, tick.at + 1);
              return geometry ? (
                <span
                  key={tick.at}
                  style={{ insetInlineStart: `${geometry.offsetPercent}%` }}
                  className="ltr-inline absolute -translate-x-1/2 text-[11px] text-ink-faint"
                >
                  {tick.label}
                </span>
              ) : null;
            })}
          </div>
        </div>

        <ul className="flex flex-col gap-1.5">
          {visible.map((assignment) => {
            const geometry = blockGeometry(window, assignment.startAt, assignment.endAt);
            const assignmentConflicts = conflicts.filter(
              (conflict) => conflict.assignmentId === assignment.id,
            );
            const missing = assignment.requiredHeadcount - assignment.assignees.length;

            return (
              <li key={assignment.id} className="flex items-stretch gap-2">
                <div className="w-40 shrink-0 py-1.5 pe-2">
                  <p className="truncate text-sm font-medium">
                    {assignment.title ?? assignment.assignmentTypeName}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {assignment.assignees.map((assignee) => assignee.personnelName).join(', ') ||
                      (missing > 0
                        ? missing === 1
                          ? t('schedule.missingOne')
                          : t('schedule.missingPerson', { count: missing })
                        : '')}
                  </p>
                </div>
                <div className="relative min-h-14 flex-1 rounded-md bg-surface-sunken">
                  {ticks.map((tick) => {
                    const tickGeometry = blockGeometry(window, tick.at, tick.at + 1);
                    return tickGeometry ? (
                      <span
                        key={tick.at}
                        aria-hidden
                        style={{ insetInlineStart: `${tickGeometry.offsetPercent}%` }}
                        className="absolute inset-y-0 w-px bg-border-subtle"
                      />
                    ) : null;
                  })}
                  {geometry ? (
                    <AssignmentBlock
                      assignment={assignment}
                      geometry={geometry}
                      conflicts={assignmentConflicts}
                      timezone={timezone}
                      onOpen={onOpen}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
