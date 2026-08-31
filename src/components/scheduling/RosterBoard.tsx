import { TriangleAlert } from 'lucide-react';
import type { Assignment, Qualification } from '@shared/types';
import type { Conflict } from '@shared/conflicts';
import {
  buildCrew,
  dayPartLabel,
  groupByPost,
  isFullDay,
  sheetColumns,
  type PostGroup,
} from '@shared/crew';
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
  rose: 'sheet-title-rose',
};

const tone = (color: string) => postTone[color] ?? 'sheet-title-slate';

/** Everyone standing a shift, on the one line the sheet gives them. */
const CREW_SEPARATOR = ' + ';

/**
 * The duty sheet, laid out the way the company prints it.
 *
 * Three columns read right to left, each post in the place it always sits, and
 * a gate — שער הדוקטור — naming the crews stood at it. A timeline answers "what
 * is happening at 14:00"; this answers "who is on the gate tonight, and in
 * which seat", which is the sheet a commander hands out. It is built as real
 * tables with collapsed borders because that is what it is: the printed page is
 * the point, and a page of soft cards is not a duty sheet.
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
      {sheetColumns(posts).map((column, index) => (
        // The column's place on the page is its identity; nothing reorders them.
        <div className="roster-column" key={index}>
          {column.map((post) => (
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
      ))}
    </div>
  );
}

const span = (shift: Assignment, timezone: string) =>
  `${formatTime(shift.startAt, timezone)} - ${formatTime(shift.endAt, timezone)}`;

/**
 * What the הערות column says for one shift.
 *
 * A note written onto the shift itself wins — that is the day's own handover or
 * briefing. A post whose note never changes states it once on the post, and
 * every shift carries it.
 */
const noteFor = (post: PostGroup, shift: Assignment) => shift.notes ?? post.instructions;

/** Everyone on a shift, or the word that says nobody is. */
function Names({ shift }: { shift: Assignment }) {
  if (shift.assignees.length === 0) {
    return <span className="sheet-empty">{t('schedule.seatEmpty')}</span>;
  }
  return <>{shift.assignees.map((person) => person.personnelName).join(CREW_SEPARATOR)}</>;
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
  // A crewed post carries the הערות column, because that is where its briefing
  // and handover lines live. A crewless one is a time/name list, so a note is
  // only worth a column when a shift actually wrote one of its own.
  const hasNotes = post.crewed
    ? post.shifts.some((shift) => Boolean(noteFor(post, shift)))
    : post.shifts.some((shift) => Boolean(shift.notes));
  const columns = hasNotes ? 3 : 2;

  // A post handed over once a day has no shift header to hang the הערות label
  // on, so it goes beside the title instead.
  const titleOnly = post.shifts.every(isFullDay);
  const titleSpan = titleOnly && hasNotes ? columns - 1 : columns;

  return (
    <table className="sheet roster-card">
      <thead>
        <tr>
          <th colSpan={titleSpan} className={cn('sheet-title', tone(post.color))}>
            {post.title}
          </th>
          {titleSpan < columns ? (
            <th className="sheet-note-head">{t('schedule.notesColumn')}</th>
          ) : null}
        </tr>
        {/*
         * A rule that holds for every shift of the post — "תדריך 20 דק לפני
         * משמרת" — reads across the card. When the card has a הערות column the
         * rule is printed there instead, beside the shifts it governs.
         */}
        {post.instructions && !hasNotes ? (
          <tr>
            <td colSpan={columns} className="sheet-subtitle">
              {post.instructions}
            </td>
          </tr>
        ) : null}
      </thead>

      {post.shifts.map((shift) => (
        <ShiftRows
          key={shift.id}
          post={post}
          shift={shift}
          hasNotes={hasNotes}
          columns={columns}
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
  post,
  shift,
  hasNotes,
  columns,
  conflicts,
  qualificationName,
  timezone,
  onOpen,
}: {
  post: PostGroup;
  shift: Assignment;
  hasNotes: boolean;
  columns: number;
  conflicts: Conflict[];
  qualificationName: (id: string) => string;
  timezone: string;
  onOpen: (assignmentId: string) => void;
}) {
  const note = noteFor(post, shift);
  const fullDay = isFullDay(shift);

  // A post stood at a gate is titled by the gate, so its shifts have to say
  // which post they are — משקיף בוקר. One titled by its own name does not.
  const dayPart = dayPartLabel(Number(formatTime(shift.startAt, timezone).slice(0, 2)));
  const label = shift.title ?? (post.section ? `${post.name} ${dayPart}` : dayPart);

  if (!post.crewed) {
    // A crewless post is a list: the turn's clock, and whoever stands it. A
    // full-day turn has no clock worth printing — it is simply today.
    return (
      <tbody>
        <tr>
          {fullDay ? (
            <td colSpan={hasNotes ? columns - 1 : columns} className="sheet-solo">
              <button type="button" className="sheet-open" onClick={() => onOpen(shift.id)}>
                <Names shift={shift} />
              </button>
            </td>
          ) : (
            <>
              <td className="sheet-time">
                <button type="button" className="sheet-open" onClick={() => onOpen(shift.id)}>
                  {span(shift, timezone)}
                </button>
              </td>
              <td>
                <Names shift={shift} />
              </td>
            </>
          )}
          {hasNotes ? <td className="sheet-note">{note ?? ''}</td> : null}
        </tr>
      </tbody>
    );
  }

  const seats = buildCrew(shift, qualificationName, post.crewRoleSuffix);
  const blocking = conflicts.some(
    (conflict) => conflict.assignmentId === shift.id && conflict.severity === 'blocking',
  );
  const short = shift.assignees.length < shift.requiredHeadcount;

  return (
    <tbody>
      {/* A single full-day crew needs no header: the title bar already named it. */}
      {fullDay ? null : (
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
      )}

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
              {note ?? ''}
            </td>
          ) : null}
        </tr>
      ))}
    </tbody>
  );
}
