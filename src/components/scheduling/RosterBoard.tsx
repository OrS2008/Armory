import { Fragment } from 'react';
import type { Assignment, Qualification } from '@shared/types';
import type { Conflict } from '@shared/conflicts';
import { buildCrew, groupByPost, type PostGroup } from '@shared/crew';
import { formatTime } from '@shared/format';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/ui/States';

interface Props {
  assignments: Assignment[];
  conflicts: Conflict[];
  qualifications: Qualification[];
  timezone: string;
  onOpen: (assignmentId: string) => void;
}

/** Tinted post headers, matching the colour stored on the assignment type. */
const postTone: Record<string, string> = {
  brand: 'bg-brand-100 text-brand-700 border-brand-200',
  amber: 'bg-warning-soft text-warning border-warning',
  info: 'bg-brand-50 text-brand-700 border-brand-200',
  success: 'bg-success-soft text-success border-success',
  slate: 'bg-surface-sunken text-ink border-border-strong',
};

const tone = (color: string) => postTone[color] ?? postTone.slate ?? '';

/**
 * The duty sheet, grouped by post rather than laid on a time axis.
 *
 * A timeline answers "what is happening at 14:00"; the sheet a commander hands
 * out answers "who is on שער הדוקטור tonight, and in which seat". Every seat is
 * listed whether or not anyone fills it, so a hole in the crew is visible on
 * the page instead of having to be counted.
 */
export function RosterBoard({ assignments, conflicts, qualifications, timezone, onOpen }: Props) {
  const names = new Map(qualifications.map((item) => [item.id, item.name]));
  const qualificationName = (id: string) => names.get(id) ?? id;
  const posts = groupByPost(assignments);

  if (posts.length === 0) {
    return <EmptyState title={t('schedule.emptyDay')} description={t('schedule.emptyDayHint')} />;
  }

  return (
    <div className="roster-columns">
      {posts.map((post) => (
        <PostCard
          key={post.assignmentTypeId}
          post={post}
          conflicts={conflicts}
          qualificationName={qualificationName}
          timezone={timezone}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function PostCard({
  post,
  conflicts,
  qualificationName,
  timezone,
  onOpen,
}: {
  post: PostGroup;
  conflicts: Conflict[];
  qualificationName: (id: string) => string;
  timezone: string;
  onOpen: (assignmentId: string) => void;
}) {
  // A post whose every shift is one unnamed seat — ש.ג, בולם, חמ״ל — prints as
  // a plain time/name list. Giving it the full crew table would be four lines
  // of chrome around one name.
  const simple = post.shifts.every(
    (shift) => shift.requiredHeadcount <= 1 && shift.requiredQualifications.length === 0,
  );

  return (
    <section className="roster-card card mb-3 overflow-hidden p-0">
      <header className={cn('border-b px-3 py-2', tone(post.color))}>
        <h3 className="text-sm font-bold">{post.name}</h3>
        {post.instructions ? (
          <p className="mt-0.5 text-xs font-medium opacity-90">{post.instructions}</p>
        ) : null}
      </header>

      {simple ? (
        <ul>
          {post.shifts.map((shift) => (
            <li key={shift.id}>
              <button
                type="button"
                onClick={() => onOpen(shift.id)}
                className="flex w-full items-baseline gap-3 border-t border-border-subtle px-3 py-1.5 text-start text-sm hover:bg-surface-sunken"
              >
                <span className="ltr-inline w-24 shrink-0 font-semibold tabular-nums">
                  {formatTime(shift.startAt, timezone)} - {formatTime(shift.endAt, timezone)}
                </span>
                {shift.assignees[0] ? (
                  <span>{shift.assignees[0].personnelName}</span>
                ) : (
                  <span className="font-medium text-danger">{t('schedule.seatEmpty')}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        post.shifts.map((shift) => (
          <ShiftBlock
            key={shift.id}
            shift={shift}
            conflicts={conflicts}
            qualificationName={qualificationName}
            timezone={timezone}
            onOpen={onOpen}
          />
        ))
      )}
    </section>
  );
}

function ShiftBlock({
  shift,
  conflicts,
  qualificationName,
  timezone,
  onOpen,
}: {
  shift: Assignment;
  conflicts: Conflict[];
  qualificationName: (id: string) => string;
  timezone: string;
  onOpen: (assignmentId: string) => void;
}) {
  const seats = buildCrew(shift, qualificationName);
  const blocking = conflicts.some(
    (conflict) => conflict.assignmentId === shift.id && conflict.severity === 'blocking',
  );
  const note = shift.notes;

  return (
    <div className="border-t border-border-subtle">
      <button
        type="button"
        onClick={() => onOpen(shift.id)}
        className="flex w-full items-baseline gap-2 bg-surface-sunken px-3 py-1.5 text-start hover:bg-border-subtle"
      >
        <span className="text-sm font-bold">{shift.title ?? shift.assignmentTypeName}</span>
        <span className="ltr-inline ms-auto text-sm font-semibold tabular-nums">
          {formatTime(shift.startAt, timezone)} - {formatTime(shift.endAt, timezone)}
        </span>
        {blocking ? (
          <span className="text-xs font-semibold text-danger">{t('conflicts.blocking')}</span>
        ) : null}
      </button>

      <table className="w-full text-sm">
        <tbody>
          {seats.map((seat, index) => (
            <Fragment key={`${seat.roleQualificationId ?? 'plain'}-${index}`}>
              <tr className="border-t border-border-subtle">
                <td className="w-24 px-3 py-1 align-top text-xs font-semibold text-ink-muted">
                  {seat.label}
                </td>
                <td className="px-3 py-1 align-top">
                  {seat.assignee ? (
                    seat.assignee.personnelName
                  ) : (
                    <span className="font-medium text-danger">{t('schedule.seatEmpty')}</span>
                  )}
                </td>
                {index === 0 && note ? (
                  <td
                    rowSpan={seats.length}
                    className="w-40 border-s border-border-subtle px-3 py-1 align-top text-xs text-ink-muted"
                  >
                    {note}
                  </td>
                ) : null}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
