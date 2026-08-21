import { TriangleAlert } from 'lucide-react';
import type { Assignment, Qualification } from '@shared/types';
import type { Conflict } from '@shared/conflicts';
import { buildCrew, dayPartLabel, groupByPost, type PostGroup } from '@shared/crew';
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

/** Tinted title bars, matching the colour stored on the assignment type. */
const postTone: Record<string, string> = {
  brand: 'sheet-title-brand',
  amber: 'sheet-title-amber',
  info: 'sheet-title-info',
  success: 'sheet-title-success',
  slate: 'sheet-title-slate',
};

const tone = (color: string) => postTone[color] ?? 'sheet-title-slate';

/**
 * The duty sheet, grouped by post rather than laid on a time axis.
 *
 * A timeline answers "what is happening at 14:00"; the sheet a commander hands
 * out answers "who is on שער הדוקטור tonight, and in which seat". It is built
 * as a real table with collapsed borders because that is what it is — the
 * printed page is the point, and a page of soft cards is not a duty sheet.
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

const span = (shift: Assignment, timezone: string) =>
  `${formatTime(shift.startAt, timezone)} - ${formatTime(shift.endAt, timezone)}`;

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
  // A one-seat post — ש״ג, בולם, חמ״ל — prints as a plain time/name list. Its
  // role column would only repeat what the title bar already says.
  const simple = post.shifts.every((shift) => shift.requiredHeadcount <= 1);
  // An empty הערות column would take a third of a narrow card for nothing.
  const hasNotes = post.shifts.some((shift) => Boolean(shift.notes));
  const columns = simple || !hasNotes ? 2 : 3;

  return (
    <table className="sheet roster-card">
      <thead>
        <tr>
          <th colSpan={columns} className={cn('sheet-title', tone(post.color))}>
            {post.name}
          </th>
        </tr>
        {post.instructions ? (
          <tr>
            <td colSpan={columns} className="sheet-subtitle">
              {post.instructions}
            </td>
          </tr>
        ) : null}
      </thead>

      {simple
        ? post.shifts.map((shift) => (
            <tbody key={shift.id}>
              <tr>
                <td className="sheet-time">
                  <button type="button" className="sheet-open" onClick={() => onOpen(shift.id)}>
                    {span(shift, timezone)}
                  </button>
                </td>
                <td>
                  {shift.assignees[0]?.personnelName ?? (
                    <span className="sheet-empty">{t('schedule.seatEmpty')}</span>
                  )}
                </td>
              </tr>
            </tbody>
          ))
        : post.shifts.map((shift) => (
            <ShiftRows
              key={shift.id}
              shift={shift}
              hasNotes={hasNotes}
              conflicts={conflicts}
              qualificationName={qualificationName}
              timezone={timezone}
              onOpen={onOpen}
            />
          ))}
    </table>
  );
}

function ShiftRows({
  shift,
  hasNotes,
  conflicts,
  qualificationName,
  timezone,
  onOpen,
}: {
  shift: Assignment;
  hasNotes: boolean;
  conflicts: Conflict[];
  qualificationName: (id: string) => string;
  timezone: string;
  onOpen: (assignmentId: string) => void;
}) {
  const seats = buildCrew(shift, qualificationName);
  const blocking = conflicts.some(
    (conflict) => conflict.assignmentId === shift.id && conflict.severity === 'blocking',
  );
  const label =
    shift.title ?? dayPartLabel(Number(formatTime(shift.startAt, timezone).slice(0, 2)));
  const short = shift.assignees.length < shift.requiredHeadcount;

  return (
    <tbody>
      <tr className={cn('sheet-shift', !hasNotes && 'sheet-shift-wide')}>
        <th className="sheet-shift-name">
          <button type="button" className="sheet-open" onClick={() => onOpen(shift.id)}>
            {label}
            {short ? (
              <span className="sheet-short">
                {shift.assignees.length}/{shift.requiredHeadcount}
              </span>
            ) : null}
            {blocking ? (
              <TriangleAlert className="sheet-warn size-3.5" aria-label={t('conflicts.title')} />
            ) : null}
          </button>
        </th>
        <th className="sheet-time">{span(shift, timezone)}</th>
        {hasNotes ? <th className="sheet-note-head">{t('schedule.notesColumn')}</th> : null}
      </tr>

      {seats.map((seat, index) => (
        <tr key={`${seat.roleQualificationId ?? 'plain'}-${index}`}>
          <td className="sheet-role">{seat.label}</td>
          <td className="sheet-name">
            {seat.assignee ? (
              seat.assignee.personnelName
            ) : (
              <span className="sheet-empty">{t('schedule.seatEmpty')}</span>
            )}
          </td>
          {hasNotes && index === 0 ? (
            <td rowSpan={seats.length} className="sheet-note">
              {shift.notes ?? ''}
            </td>
          ) : null}
        </tr>
      ))}
    </tbody>
  );
}
