import { GripVertical, TriangleAlert } from 'lucide-react';
import type { Assignment, AssignmentAssignee, Qualification } from '@shared/types';
import type { Conflict } from '@shared/conflicts';
import {
  buildCrew,
  type CrewSeat,
  dayPartLabel,
  groupByPost,
  isFullDay,
  moveSheetCard,
  sheetColumns,
  sheetPlacements,
  turnLabels,
  type PostGroup,
  type SheetPlacement,
} from '@shared/crew';
import { formatTime } from '@shared/format';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/ui/States';
import { dropTargetAt, isAbove, useSheetDrag } from './useSheetDrag';

/** One person changing seats, and whoever they trade places with. */
export interface PersonMove {
  personnelId: string;
  personnelName: string;
  from: { assignmentId: string; role: string | null };
  to: { assignmentId: string; role: string | null };
  /** Who was already in the seat, and takes the one just vacated. */
  displaced: { personnelId: string; personnelName: string } | null;
}

interface Props {
  assignments: Assignment[];
  conflicts: Conflict[];
  qualifications: Qualification[];
  timezone: string;
  /** The day this sheet is for; a turn belongs to the day it starts. */
  window: { from: number; to: number };
  onOpen: (assignmentId: string) => void;
  /**
   * Rearranging the page. Absent when the reader may not change the posts.
   * `previous` is the page as it was, so the move can be put back.
   */
  onMoveCard?: (placements: SheetPlacement[], previous: SheetPlacement[]) => void;
  /** Moving somebody between seats. Absent when the reader may not assign. */
  onMovePerson?: (move: PersonMove) => void;
  /** Opening the post itself, from its title bar. Absent when there is nothing there to do. */
  onOpenPost?: (post: SheetPost) => void;
}

/** How a card names the post behind it, for whoever opens it. */
export interface SheetPost {
  assignmentTypeId: string;
  /** The post's own name, which is what an act on it is reported against. */
  name: string;
  /** What the title bar printed, which is what the reader pressed. */
  title: string;
}

/** What a press on the sheet may be carrying. */
type Payload =
  | { kind: 'card'; assignmentTypeId: string }
  | {
      kind: 'person';
      personnelId: string;
      personnelName: string;
      assignmentId: string;
      role: string | null;
      /** The seat they were lifted out of, so a drop back onto it is a no-op. */
      seat: string;
    };

type Drag = ReturnType<typeof useSheetDrag<Payload>>;

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

/*
 * A seat is addressed by its place in the crew, not by the role it carries.
 *
 * Two plain לוחם seats carry the same role, and a person seated in the מפקד
 * seat may hold no מפקד mark of their own — `buildCrew` decides who sits where.
 * Addressing a seat by its role therefore pointed at the wrong person, and at
 * two seats at once. Its index says exactly one thing.
 */
const seatKey = (assignmentId: string, index: number) => `${assignmentId}#${index}`;
/** A crewless turn is one line for everyone on it, so it has no seat index. */
const crowdKey = (assignmentId: string) => `${assignmentId}#*`;

/**
 * The duty sheet, laid out the way the company prints it.
 *
 * Three columns read right to left, each post in the place it always sits, and
 * a gate — שער הדוקטור — naming the crews stood at it. A timeline answers "what
 * is happening at 14:00"; this answers "who is on the gate tonight, and in
 * which seat", which is the sheet a commander hands out. It is built as real
 * tables with collapsed borders because that is what it is: the printed page is
 * the point, and a page of soft cards is not a duty sheet.
 *
 * Both kinds of arrangement are made by hand, by dragging: a card to the place
 * on the page where it belongs, and a person to the seat they should stand.
 */
export function RosterBoard({
  assignments,
  conflicts,
  qualifications,
  timezone,
  window: day,
  onOpen,
  onMoveCard,
  onMovePerson,
  onOpenPost,
}: Props) {
  const names = new Map(qualifications.map((item) => [item.id, item.name]));
  const qualificationName = (id: string) => names.get(id) ?? id;
  const posts = groupByPost(assignments, day);
  const columns = sheetColumns(posts);

  // The crews as the sheet prints them, so a drop lands on the person a reader
  // is actually pointing at rather than on whoever the data happens to list.
  const crews = new Map<string, CrewSeat[]>();
  for (const post of posts) {
    if (!post.crewed) continue;
    for (const shift of post.shifts) {
      crews.set(shift.id, buildCrew(shift, qualificationName, post.crewRoleSuffix));
    }
  }

  const drop = (payload: Payload, point: { x: number; y: number }) => {
    if (payload.kind === 'card') {
      if (!onMoveCard) return;
      const overColumn = dropTargetAt(point, 'data-sheet-column');
      if (!overColumn) return;
      const column = Number(overColumn.dataset.sheetColumn) - 1;
      const overCard = dropTargetAt(point, 'data-sheet-card');
      const inColumn = columns[column] ?? [];

      /*
       * The card the dropped one lands above, which is what `moveSheetCard`
       * resolves against. Landing on the lower half of a card means below it,
       * and a card is never its own landmark — dropping just above itself would
       * otherwise read as "move to where you already are, minus one".
       */
      let before: string | null = null;
      const overId = overCard?.dataset.sheetCard ?? null;
      if (overCard && overId) {
        const at = inColumn.findIndex((post) => post.assignmentTypeId === overId);
        const landmark = isAbove(overCard, point)
          ? overId
          : (inColumn[at + 1]?.assignmentTypeId ?? null);
        before = landmark === payload.assignmentTypeId ? null : landmark;
      }
      const placements = moveSheetCard(columns, payload.assignmentTypeId, { column, before });
      if (placements.length > 0) onMoveCard(placements, sheetPlacements(columns));
      return;
    }

    if (!onMovePerson) return;
    const key = dropTargetAt(point, 'data-sheet-seat')?.dataset.sheetSeat;
    if (!key || key === payload.seat) return;

    const [assignmentId, at] = key.split('#');
    if (!assignmentId) return;
    // Whoever is already in the seat takes the one being vacated, so a drag
    // onto a filled seat trades the two rather than refusing. A crewless turn
    // is a list, not a seat, so nobody is displaced by joining it.
    const seat = at === '*' ? null : crews.get(assignmentId)?.[Number(at)];
    if (at !== '*' && !seat) return;
    const sitting = seat?.assignee ?? null;
    if (sitting?.personnelId === payload.personnelId) return;

    /*
     * Two plain seats on one crew are the same seat as far as the roster is
     * concerned — both print לוחם, and which of them a person occupies is
     * decided by `buildCrew` rather than stored. Moving between them would
     * report a change and then quietly undo itself on the next read, so it is
     * refused before anything is written.
     */
    const toRole = seat?.roleQualificationId ?? null;
    if (assignmentId === payload.assignmentId && toRole === payload.role && !sitting) return;

    onMovePerson({
      personnelId: payload.personnelId,
      personnelName: payload.personnelName,
      from: { assignmentId: payload.assignmentId, role: payload.role },
      to: { assignmentId, role: toRole },
      displaced: sitting
        ? { personnelId: sitting.personnelId, personnelName: sitting.personnelName }
        : null,
    });
  };

  const drag = useSheetDrag<Payload>(drop);

  if (posts.length === 0) {
    return <EmptyState title={t('schedule.emptyDay')} description={t('schedule.emptyDayHint')} />;
  }

  return (
    <>
      <div className="roster-columns">
        {columns.map((column, index) => (
          // The column's place on the page is its identity; nothing reorders them.
          <div className="roster-column" key={index} data-sheet-column={index + 1}>
            {column.map((post) => (
              <PostCard
                key={post.assignmentTypeId}
                post={post}
                conflicts={conflicts}
                crews={crews}
                timezone={timezone}
                drag={drag}
                canArrange={Boolean(onMoveCard)}
                canMovePeople={Boolean(onMovePerson)}
                onOpen={onOpen}
                {...(onOpenPost ? { onOpenPost } : {})}
              />
            ))}
          </div>
        ))}
      </div>
      {drag.item ? (
        <div
          className="sheet-ghost"
          style={{ transform: `translate(${drag.at.x}px, ${drag.at.y}px)` }}
          aria-hidden
        >
          {drag.item.label}
        </div>
      ) : null}
    </>
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

/** A name that can be picked up and put in another seat. */
function PersonName({
  person,
  assignmentId,
  role,
  seat,
  drag,
  draggable,
}: {
  person: AssignmentAssignee;
  assignmentId: string;
  role: string | null;
  /** Where they are being lifted from, addressed the way a drop target is. */
  seat: string;
  drag: Drag;
  draggable: boolean;
}) {
  if (!draggable) return <>{person.personnelName}</>;
  return (
    <span
      className="sheet-drag-name"
      onPointerDown={(event) =>
        drag.start(
          {
            label: person.personnelName,
            payload: {
              kind: 'person',
              personnelId: person.personnelId,
              personnelName: person.personnelName,
              assignmentId,
              role,
              seat,
            },
          },
          event,
        )
      }
    >
      {person.personnelName}
    </span>
  );
}

function PostCard({
  post,
  conflicts,
  crews,
  timezone,
  drag,
  canArrange,
  canMovePeople,
  onOpen,
  onOpenPost,
}: {
  post: PostGroup;
  conflicts: Conflict[];
  crews: Map<string, CrewSeat[]>;
  timezone: string;
  drag: Drag;
  canArrange: boolean;
  canMovePeople: boolean;
  onOpen: (assignmentId: string) => void;
  onOpenPost?: (post: SheetPost) => void;
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

  /*
   * The title bar is both a handle and a way in. A press that turned into a
   * drag is not also a click on what it started from — the same guard the shift
   * names use, because the bar is the biggest drag target on the card.
   */
  const openPost = (event: React.MouseEvent) => {
    if (drag.suppressClick()) {
      event.preventDefault();
      return;
    }
    onOpenPost?.({
      assignmentTypeId: post.assignmentTypeId,
      name: post.name,
      title: post.title,
    });
  };

  const title = (
    <>
      {canArrange ? <GripVertical className="sheet-grip size-3.5" aria-hidden /> : null}
      {post.title}
    </>
  );

  return (
    <table className="sheet roster-card" data-sheet-card={post.assignmentTypeId}>
      <thead>
        <tr>
          <th
            colSpan={titleSpan}
            className={cn('sheet-title', tone(post.color), canArrange && 'sheet-grab')}
            title={canArrange ? t('schedule.dragCardHint') : undefined}
            onPointerDown={
              canArrange
                ? (event) =>
                    drag.start(
                      {
                        label: post.title,
                        payload: { kind: 'card', assignmentTypeId: post.assignmentTypeId },
                      },
                      event,
                    )
                : undefined
            }
          >
            {onOpenPost ? (
              <button
                type="button"
                className="sheet-title-open"
                title={t('schedule.openPostHint')}
                onClick={openPost}
              >
                {title}
              </button>
            ) : (
              title
            )}
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

      {post.shifts.map((shift, turn) => (
        <ShiftRows
          key={shift.id}
          post={post}
          shift={shift}
          turn={turn}
          hasNotes={hasNotes}
          columns={columns}
          conflicts={conflicts}
          crews={crews}
          timezone={timezone}
          drag={drag}
          canMovePeople={canMovePeople}
          onOpen={onOpen}
        />
      ))}
    </table>
  );
}

function ShiftRows({
  post,
  shift,
  turn,
  hasNotes,
  columns,
  conflicts,
  crews,
  timezone,
  drag,
  canMovePeople,
  onOpen,
}: {
  post: PostGroup;
  shift: Assignment;
  /** Which of the post's turns this is, counting from the day's first. */
  turn: number;
  hasNotes: boolean;
  columns: number;
  conflicts: Conflict[];
  crews: Map<string, CrewSeat[]>;
  timezone: string;
  drag: Drag;
  canMovePeople: boolean;
  onOpen: (assignmentId: string) => void;
}) {
  const note = noteFor(post, shift);
  const fullDay = isFullDay(shift);

  // A turn is named by its place in the post's day, so the card always reads
  // בוקר, צהריים, ערב downwards however early the post hands over. Only a
  // rhythm nobody has names for falls back to the clock.
  const dayPart =
    turnLabels(post.shifts.length)?.[turn] ??
    dayPartLabel(Number(formatTime(shift.startAt, timezone).slice(0, 2)));
  // A post stood at a gate is titled by the gate, so its shifts have to say
  // which post they are — משקיף בוקר. One titled by its own name does not.
  const label = shift.title ?? (post.section ? `${post.name} ${dayPart}` : dayPart);

  // A press that turned into a drag is not also a click on what it started from.
  const open = (event: React.MouseEvent) => {
    if (drag.suppressClick()) {
      event.preventDefault();
      return;
    }
    onOpen(shift.id);
  };

  if (!post.crewed) {
    // A crewless post is a list: the turn's clock, and whoever stands it. A
    // full-day turn has no clock worth printing — it is simply today.
    return (
      <tbody>
        <tr data-sheet-seat={crowdKey(shift.id)}>
          {fullDay ? (
            <td colSpan={hasNotes ? columns - 1 : columns} className="sheet-solo">
              <Crowd shift={shift} drag={drag} canMovePeople={canMovePeople} onOpen={open} />
            </td>
          ) : (
            <>
              <td className="sheet-time">
                <button type="button" className="sheet-open" onClick={open}>
                  {span(shift, timezone)}
                </button>
              </td>
              <td>
                <Crowd shift={shift} drag={drag} canMovePeople={canMovePeople} onOpen={open} />
              </td>
            </>
          )}
          {hasNotes ? <td className="sheet-note">{note ?? ''}</td> : null}
        </tr>
      </tbody>
    );
  }

  // The same crew the drop resolution reads, so what a reader points at and
  // what the sheet moves are the same seat.
  const seats = crews.get(shift.id) ?? [];
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
            <button type="button" className="sheet-open" onClick={open}>
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
        <tr
          key={`${seat.roleQualificationId ?? 'plain'}-${index}`}
          data-sheet-seat={seatKey(shift.id, index)}
        >
          <td className="sheet-role">{seat.label}</td>
          <td className="sheet-name">
            {seat.assignee ? (
              <PersonName
                person={seat.assignee}
                assignmentId={shift.id}
                role={seat.roleQualificationId}
                seat={seatKey(shift.id, index)}
                drag={drag}
                draggable={canMovePeople}
              />
            ) : (
              <button type="button" className="sheet-open sheet-empty" onClick={open}>
                {t('schedule.seatEmpty')}
              </button>
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

/** Everyone on a crewless turn, on the one line the sheet gives them. */
function Crowd({
  shift,
  drag,
  canMovePeople,
  onOpen,
}: {
  shift: Assignment;
  drag: Drag;
  canMovePeople: boolean;
  onOpen: (event: React.MouseEvent) => void;
}) {
  if (shift.assignees.length === 0) {
    return (
      <button type="button" className="sheet-open sheet-empty" onClick={onOpen}>
        {t('schedule.seatEmpty')}
      </button>
    );
  }
  return (
    <>
      {shift.assignees.map((person, index) => (
        <span key={person.personnelId}>
          {index > 0 ? ' + ' : ''}
          <PersonName
            person={person}
            assignmentId={shift.id}
            role={person.role ?? null}
            seat={crowdKey(shift.id)}
            drag={drag}
            draggable={canMovePeople}
          />
        </span>
      ))}
    </>
  );
}
