import type { Assignment, Personnel } from '@shared/types';
import type { Conflict } from '@shared/conflicts';
import { t } from '@/i18n';
import { EmptyState } from '@/components/ui/States';
import { AssignmentBlock } from './AssignmentBlock';
import { blockGeometry, dayWindow, hourTicks } from './timeline';

interface Props {
  dayKey: string;
  timezone: string;
  personnel: Personnel[];
  assignments: Assignment[];
  conflicts: Conflict[];
  onOpen: (assignmentId: string) => void;
}

/** One row per person — the view a commander uses to see who is free. */
export function PersonnelTimeline({
  dayKey,
  timezone,
  personnel,
  assignments,
  conflicts,
  onOpen,
}: Props) {
  const window = dayWindow(dayKey, timezone);
  const ticks = hourTicks(window, 4);

  if (personnel.length === 0) return <EmptyState description={t('personnel.empty')} />;

  return (
    <div className="app-scrollbar overflow-x-auto">
      <ul className="flex min-w-[48rem] flex-col gap-1">
        {personnel.map((person) => {
          const mine = assignments.filter((assignment) =>
            assignment.assignees.some((assignee) => assignee.personnelId === person.id),
          );
          const personConflicts = conflicts.filter(
            (conflict) => conflict.personnelId === person.id,
          );

          return (
            <li key={person.id} className="flex items-stretch gap-2">
              <div className="w-40 shrink-0 py-2 pe-2">
                <p className="truncate text-sm font-medium">{person.displayName}</p>
                <p className="truncate text-xs text-ink-muted">{person.unitName ?? ''}</p>
              </div>
              <div className="relative min-h-12 flex-1 rounded-md bg-surface-sunken">
                {ticks.map((tick) => {
                  const geometry = blockGeometry(window, tick.at, tick.at + 1);
                  return geometry ? (
                    <span
                      key={tick.at}
                      aria-hidden
                      style={{ insetInlineStart: `${geometry.offsetPercent}%` }}
                      className="absolute inset-y-0 w-px bg-border-subtle"
                    />
                  ) : null;
                })}
                {mine.map((assignment) => {
                  const geometry = blockGeometry(window, assignment.startAt, assignment.endAt);
                  return geometry ? (
                    <AssignmentBlock
                      key={assignment.id}
                      assignment={assignment}
                      geometry={geometry}
                      conflicts={personConflicts.filter(
                        (conflict) => conflict.assignmentId === assignment.id,
                      )}
                      timezone={timezone}
                      onOpen={onOpen}
                      compact
                    />
                  ) : null;
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
