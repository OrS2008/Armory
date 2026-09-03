/**
 * Crew seats.
 *
 * The printed sheet lists a crew as one labelled row per seat — מפקד, נהג, then
 * the plain לוחם seats — including the seats nobody fills yet. That shape is
 * not stored anywhere: it follows from the assignment type's headcount and its
 * required qualifications, so it is derived once here and used by the board,
 * the PDF and the assign dialog alike.
 */
import { DEFAULT_CREW_ROLE } from './messages.he';
import type { Assignment, AssignmentAssignee } from './types';

export interface CrewSeat {
  /** The qualification naming this seat, or null for a plain combatant seat. */
  roleQualificationId: string | null;
  label: string;
  assignee: AssignmentAssignee | null;
}

interface CrewSource {
  requiredHeadcount: number;
  requiredQualifications: { qualificationId: string; minCount: number }[];
  assignees: AssignmentAssignee[];
}

/**
 * A seat in the crew, before anybody is put in it.
 *
 * `named` is the distinction that matters: a named seat is a post's נהג or
 * מפקד — a job only its holder may do — while an unnamed one is a plain
 * combatant seat that anybody on the roster can stand. Both can carry a
 * qualification: a חמ״ל shift binds every seat to חמ״ל without any of them
 * being the crew's one חמ״ל, and that is what keeps the two apart.
 */
export interface SeatSlot {
  role: string | null;
  named: boolean;
}

/**
 * The seats a post stands, in reading order: named roles first, plain seats
 * after. The named ones keep the order the post lists them in, which is the
 * order they are read out — מפקד before נהג before the plain seats.
 *
 * A qualification with `minCount > 0` contributes that many named seats — "a
 * driver among the four". One with `minCount === 0` binds every seat instead,
 * so it names them all rather than adding any: a חמ״ל shift is one חמ״ל seat,
 * not a חמ״ל plus a spare.
 */
export function seatPlan(source: {
  requiredHeadcount: number;
  requiredQualifications: { qualificationId: string; minCount: number }[];
}): SeatSlot[] {
  const seats: SeatSlot[] = [];
  for (const item of source.requiredQualifications) {
    if (item.minCount <= 0) continue;
    for (let index = 0; index < item.minCount; index += 1) {
      seats.push({ role: item.qualificationId, named: true });
    }
  }
  const bindsEveryone = source.requiredQualifications.find((item) => item.minCount <= 0);
  const plain = bindsEveryone ? bindsEveryone.qualificationId : null;
  while (seats.length < source.requiredHeadcount) seats.push({ role: plain, named: false });
  return seats;
}

/** The plan as bare roles, for the places that only ask what each seat is. */
export function seatRoles(source: {
  requiredHeadcount: number;
  requiredQualifications: { qualificationId: string; minCount: number }[];
}): (string | null)[] {
  return seatPlan(source).map((seat) => seat.role);
}

/**
 * The marks that name a seat somewhere on the board.
 *
 * A מפקד or a נהג is scarce in a way a לוחם is not: one of each is what makes a
 * crew a crew, and there are only so many of them. Spending one on a plain seat
 * is spending it — the post it was needed at is short a commander, and the sheet
 * says so the following morning. This is who must be kept for those seats.
 */
export function namedSeatMarks(
  posts: { requiredQualifications: { qualificationId: string; minCount: number }[] }[],
): Set<string> {
  const marks = new Set<string>();
  for (const post of posts) {
    for (const item of post.requiredQualifications) {
      if (item.minCount > 0) marks.add(item.qualificationId);
    }
  }
  return marks;
}

/** Seats nobody fills yet, given who is already on the crew. */
export function openSeatRoles(source: {
  requiredHeadcount: number;
  requiredQualifications: { qualificationId: string; minCount: number }[];
  assigneeIds: string[];
  assigneeRoles?: Record<string, string | null> | undefined;
}): (string | null)[] {
  const taken = source.assigneeIds.map((id) => source.assigneeRoles?.[id] ?? null);
  const open: (string | null)[] = [];
  for (const seat of seatRoles(source)) {
    const index = taken.indexOf(seat);
    if (index >= 0) {
      taken.splice(index, 1);
      continue;
    }
    open.push(seat);
  }
  return open;
}

/**
 * Seats in the order they are read out, each with whoever fills it.
 *
 * `roleSuffix` names the post inside the seat — מפקד סיור rather than מפקד —
 * which is how a sheet carrying two crewed posts keeps them apart when it is
 * read aloud. It belongs to the post, not to the mark: the same מפקד stands
 * כיתת כוננות with no suffix at all.
 */
export function buildCrew(
  assignment: CrewSource,
  qualificationName: (id: string) => string,
  roleSuffix?: string | null,
  /**
   * Whether a person holds a mark. Given it, somebody put on the shift without
   * a seat can still be shown in the named one they are qualified for; without
   * it, only the person recorded in that seat is ever printed there. Either way
   * nobody unqualified appears in it.
   */
  holds?: (personnelId: string, qualificationId: string) => boolean,
): CrewSeat[] {
  const suffixed = (label: string) => (roleSuffix ? `${label} ${roleSuffix}` : label);
  const bindsEveryone = assignment.requiredQualifications.find((item) => item.minCount <= 0);
  const plainLabel = suffixed(
    bindsEveryone ? qualificationName(bindsEveryone.qualificationId) : DEFAULT_CREW_ROLE,
  );

  const plan = seatPlan(assignment);
  const seats: CrewSeat[] = plan.map(({ role }) => ({
    roleQualificationId: role,
    label: role ? suffixed(qualificationName(role)) : plainLabel,
    assignee: null,
  }));

  /*
   * Only the person assigned to a named seat sits in it.
   *
   * A נהג seat is filled by the person recorded as this shift's נהג and by
   * nobody else. Letting the leftovers spill into an empty named seat is how a
   * plain combatant came to be printed as the driver — the sheet said מפקד
   * beside a name the roster had never made a commander, and the seat that
   * actually needed filling looked filled. An empty named seat stays empty:
   * that is the truth, and it is what a reader has to see.
   */
  const remaining = [...assignment.assignees];
  const take = (match: (person: AssignmentAssignee) => boolean) => {
    const at = remaining.findIndex(match);
    return at >= 0 ? (remaining.splice(at, 1)[0] ?? null) : null;
  };

  // The seat's own person first: whoever was recorded as this shift's נהג.
  for (const seat of seats) {
    if (!seat.roleQualificationId) continue;
    seat.assignee = take((person) => person.role === seat.roleQualificationId);
  }
  // Then, only where we can tell, somebody qualified for the seat who was put
  // on the shift without one.
  for (const [index, seat] of seats.entries()) {
    const role = seat.roleQualificationId;
    if (seat.assignee || !role || !plan[index]?.named || !holds) continue;
    seat.assignee = take((person) => !person.role && holds(person.personnelId, role));
  }
  // Everyone else fills the plain seats. A named seat left over stays empty —
  // that is the truth, and printing a combatant in it is how the sheet came to
  // say מפקד beside somebody the roster had never made one.
  for (const [index, seat] of seats.entries()) {
    if (seat.assignee || remaining.length === 0 || plan[index]?.named) continue;
    seat.assignee = remaining.shift() ?? null;
  }
  for (const person of remaining) {
    seats.push({
      roleQualificationId: person.role,
      label: person.role ? suffixed(qualificationName(person.role)) : plainLabel,
      assignee: person,
    });
  }

  return seats;
}

/**
 * What to call a shift that carries no title of its own.
 *
 * Repeating the post name on every row of its own card says nothing; the sheet
 * names its shifts by the part of day they cover — בוקר, צהריים, לילה — which
 * is how people refer to them out loud.
 */
/**
 * What a post's turns are called, in the order it hands them over.
 *
 * A turn is named by its place in the post's own day, not by the clock: the
 * first one out is בוקר whether the post changes at 05:00 or at 06:30, and the
 * sheet reads בוקר, צהריים, ערב down the card every time. Naming them by the
 * hour instead made the same turn read differently on two posts that do the
 * same job an hour and a half apart.
 *
 * Only the shapes a person actually says out loud are listed. A post handed
 * over more often than four times a day — ש״ג every four hours — has no such
 * names, and prints as a plain list of times anyway.
 */
const TURN_NAMES: Record<number, string[]> = {
  2: ['בוקר', 'ערב'],
  3: ['בוקר', 'צהריים', 'ערב'],
  4: ['בוקר', 'צהריים', 'ערב', 'לילה'],
};

export function turnLabels(count: number): string[] | null {
  return TURN_NAMES[count] ?? null;
}

/**
 * What to call a turn when the post's rhythm has no name for it — an ad-hoc
 * task, or a post handed over more times a day than anyone names.
 */
export function dayPartLabel(startHour: number): string {
  // The small hours are tested first: they are night, and every later bound
  // would otherwise catch them on the way past.
  if (startHour < 4) return 'לילה';
  if (startHour < 12) return 'בוקר';
  if (startHour < 18) return 'צהריים';
  // A post handed over three times a day changes at 21:00 or 22:00 into what
  // everyone calls the night shift, so ערב stops before the last handover.
  if (startHour < 21) return 'ערב';
  return 'לילה';
}

/** Assignments grouped into the cards the sheet prints, one per post. */
export interface PostGroup {
  assignmentTypeId: string;
  name: string;
  /** What the title bar prints: the gate, else the sheet label, else the name. */
  title: string;
  /** The gate the post is stood at, when it has one. */
  section: string | null;
  color: string;
  instructions: string | null;
  priority: number;
  /** Appended to every seat label here: מפקד becomes מפקד סיור. */
  crewRoleSuffix: string | null;
  /** The sheet column the post is printed in, or null to let the sheet place it. */
  column: number | null;
  shifts: Assignment[];
  /**
   * Whether the post prints its seats by role. A post whose crew has named
   * seats — one מפקד and one נהג among the four — prints a role beside every
   * name; one that just needs bodies prints the names on the time's own line,
   * because a column of לוחם beside them says nothing.
   */
  crewed: boolean;
}

/**
 * @param window The day the sheet is for. A turn belongs to the day it *starts*
 * — 21:00–05:00 is the evening turn of the day it begins, not the first line of
 * the next morning's sheet — so a window keeps last night off today's page. The
 * timeline views want the opposite, everything in progress, and pass none.
 */
export function groupByPost(
  assignments: Assignment[],
  window?: { from: number; to: number },
): PostGroup[] {
  const groups = new Map<string, PostGroup>();
  for (const assignment of assignments) {
    if (assignment.status === 'cancelled') continue;
    if (window && (assignment.startAt < window.from || assignment.startAt > window.to)) continue;
    /*
     * A retired post stops printing. Retiring is how a company says "we do not
     * stand this any more", and the shifts already laid out for it are not
     * undone by that — so leaving them on the page turned one renamed post into
     * a card nobody could read, beside an empty one under the new name.
     *
     * A shift somebody is actually on still prints, retired or not: that is a
     * person's shift, and hiding it is how somebody ends up not being relieved.
     */
    if (!assignment.postActive && assignment.assignees.length === 0) continue;
    const existing = groups.get(assignment.assignmentTypeId);
    if (existing) {
      existing.shifts.push(assignment);
      continue;
    }
    const section = assignment.section ?? null;
    groups.set(assignment.assignmentTypeId, {
      assignmentTypeId: assignment.assignmentTypeId,
      name: assignment.assignmentTypeName,
      title: section ?? assignment.sheetLabel ?? assignment.assignmentTypeName,
      section,
      color: assignment.color,
      instructions: assignment.instructions ?? null,
      priority: assignment.priority,
      crewRoleSuffix: assignment.crewRoleSuffix ?? null,
      column: assignment.sheetColumn ?? null,
      shifts: [assignment],
      crewed: assignment.requiredQualifications.some((item) => item.minCount > 0),
    });
  }

  for (const group of groups.values()) {
    group.shifts.sort((left, right) => left.startAt - right.startAt);
  }

  // Priority is the sheet's own reading order, set post by post: the page is
  // laid out the way the company prints it, not the way the data happens to
  // sort. Two posts sharing a priority fall back to the taller one first, so a
  // short card does not leave a hole beneath it for the whole row.
  return [...groups.values()].sort(
    (left, right) =>
      left.priority - right.priority ||
      printedRows(right) - printedRows(left) ||
      left.name.localeCompare(right.name, 'he'),
  );
}

/**
 * The posts of each printed column, right to left.
 *
 * A post that names its column goes there; the rest are dealt into whichever
 * column is shortest so far, which is what keeps an ad-hoc task — and any post
 * created before the sheet had columns — from piling onto the end of the page.
 */
export function sheetColumns(posts: PostGroup[], count = 3): PostGroup[][] {
  const columns: PostGroup[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);

  for (const post of posts) {
    const named = post.column === null ? -1 : Math.min(post.column, count) - 1;
    const index = named >= 0 ? named : heights.indexOf(Math.min(...heights));
    columns[index]!.push(post);
    heights[index] = (heights[index] ?? 0) + printedRows(post);
  }
  return columns;
}

/** Roughly how many rows a post takes on the sheet, for packing the columns. */
function printedRows(post: PostGroup): number {
  return post.shifts.reduce((total, shift) => {
    const seats = Math.max(shift.requiredHeadcount, shift.assignees.length);
    // A crewless post prints one time/name line however many people stand it.
    return total + (post.crewed ? 1 + seats : 1);
  }, 0);
}

/** Where one post sits on the page, as the sheet stores it. */
export interface SheetPlacement {
  assignmentTypeId: string;
  column: number;
  priority: number;
}

/**
 * Where every post sits after one card is dropped somewhere else.
 *
 * Dragging a card is a statement about the whole page, not about one post: the
 * cards below the gap close up and the ones below the landing spot move down.
 * So the move is resolved against the columns as drawn and the result is the
 * page in full, which is also what makes it undoable — the caller keeps the
 * placements it had before and puts them back.
 *
 * Priorities are renumbered from one, in reading order, so the order a person
 * sees is the order stored rather than a set of gaps that drift over time.
 */
export function moveSheetCard(
  columns: PostGroup[][],
  assignmentTypeId: string,
  to: { column: number; before: string | null },
): SheetPlacement[] {
  const next = columns.map((column) =>
    column.filter((post) => post.assignmentTypeId !== assignmentTypeId),
  );
  const moved = columns.flat().find((post) => post.assignmentTypeId === assignmentTypeId);
  if (!moved) return [];

  const target = next[Math.min(Math.max(to.column, 0), next.length - 1)];
  if (!target) return [];
  // The landing spot is named by the card it goes above, rather than by an
  // index: the card being moved has already been lifted out, and an index
  // measured before that would be one out whenever it came from higher up the
  // same column. `null` is the foot of the column.
  const before = to.before ? target.findIndex((post) => post.assignmentTypeId === to.before) : -1;
  target.splice(before < 0 ? target.length : before, 0, moved);

  return sheetPlacements(next);
}

/**
 * The page as it stands, numbered from one in reading order.
 *
 * Renumbering rather than keeping the stored priorities means the order a
 * person sees is the order stored, instead of a set of gaps that drift apart
 * every time a card moves.
 */
export function sheetPlacements(columns: PostGroup[][]): SheetPlacement[] {
  const placements: SheetPlacement[] = [];
  let priority = 1;
  columns.forEach((column, index) => {
    for (const post of column) {
      placements.push({ assignmentTypeId: post.assignmentTypeId, column: index + 1, priority });
      priority += 1;
    }
  });
  return placements;
}

/** A shift that covers the whole day prints its crew with no clock beside it. */
export function isFullDay(shift: { startAt: number; endAt: number }): boolean {
  return shift.endAt - shift.startAt >= 24 * 3600_000;
}
