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
 * Seats in the order they are read out: named roles first, plain seats after.
 *
 * A qualification with `minCount > 0` contributes that many named seats — "a
 * driver among the four". One with `minCount === 0` binds every seat instead,
 * so it names them all rather than adding any: a חמ״ל shift is one חמ״ל seat,
 * not a חמ״ל plus a spare.
 */
/**
 * The role each seat carries, in reading order: named roles first, plain seats
 * after. A qualification with `minCount > 0` contributes that many named seats
 * — "a driver among the four". One with `minCount === 0` binds every seat
 * instead, so it names them all rather than adding any: a חמ״ל shift is one
 * חמ״ל seat, not a חמ״ל plus a spare.
 */
export function seatRoles(source: {
  requiredHeadcount: number;
  requiredQualifications: { qualificationId: string; minCount: number }[];
}): (string | null)[] {
  const roles: (string | null)[] = [];
  for (const item of source.requiredQualifications) {
    if (item.minCount <= 0) continue;
    for (let index = 0; index < item.minCount; index += 1) roles.push(item.qualificationId);
  }
  const bindsEveryone = source.requiredQualifications.find((item) => item.minCount <= 0);
  const plain = bindsEveryone ? bindsEveryone.qualificationId : null;
  while (roles.length < source.requiredHeadcount) roles.push(plain);
  return roles;
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

/** Seats in the order they are read out, each with whoever fills it. */
export function buildCrew(
  assignment: CrewSource,
  qualificationName: (id: string) => string,
): CrewSeat[] {
  const bindsEveryone = assignment.requiredQualifications.find((item) => item.minCount <= 0);
  const plainLabel = bindsEveryone
    ? qualificationName(bindsEveryone.qualificationId)
    : DEFAULT_CREW_ROLE;

  const seats: CrewSeat[] = seatRoles(assignment).map((role) => ({
    roleQualificationId: role,
    label: role ? qualificationName(role) : plainLabel,
    assignee: null,
  }));

  // Whoever holds a named role sits in it; everyone else fills the remaining
  // seats in order. An over-full crew keeps its extra people rather than
  // dropping them — a seat that should not exist is still someone's shift.
  const remaining = [...assignment.assignees];
  for (const seat of seats) {
    if (!seat.roleQualificationId) continue;
    const index = remaining.findIndex((person) => person.role === seat.roleQualificationId);
    if (index >= 0) seat.assignee = remaining.splice(index, 1)[0] ?? null;
  }
  for (const seat of seats) {
    if (seat.assignee || remaining.length === 0) continue;
    seat.assignee = remaining.shift() ?? null;
  }
  for (const person of remaining) {
    seats.push({
      roleQualificationId: person.role,
      label: person.role ? qualificationName(person.role) : plainLabel,
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
export function dayPartLabel(startHour: number): string {
  // The small hours are tested first: they are night, and every later bound
  // would otherwise catch them on the way past.
  if (startHour < 4) return 'לילה';
  if (startHour < 12) return 'בוקר';
  if (startHour < 18) return 'צהריים';
  if (startHour < 22) return 'ערב';
  return 'לילה';
}

/** Assignments grouped into the cards the sheet prints, one per post. */
export interface PostGroup {
  assignmentTypeId: string;
  name: string;
  color: string;
  instructions: string | null;
  shifts: Assignment[];
}

export function groupByPost(assignments: Assignment[]): PostGroup[] {
  const groups = new Map<string, PostGroup>();
  for (const assignment of assignments) {
    if (assignment.status === 'cancelled') continue;
    const existing = groups.get(assignment.assignmentTypeId);
    if (existing) {
      existing.shifts.push(assignment);
    } else {
      groups.set(assignment.assignmentTypeId, {
        assignmentTypeId: assignment.assignmentTypeId,
        name: assignment.assignmentTypeName,
        color: assignment.color,
        instructions: assignment.instructions ?? null,
        shifts: [assignment],
      });
    }
  }

  for (const group of groups.values()) {
    group.shifts.sort((left, right) => left.startAt - right.startAt);
  }

  // Longest posts first, so a 24-hour duty heads its column and the short
  // rotations stack underneath — the reading order of the printed sheet.
  return [...groups.values()].sort((left, right) => {
    const span = (group: PostGroup) =>
      Math.max(...group.shifts.map((shift) => shift.endAt - shift.startAt));
    return span(right) - span(left) || left.name.localeCompare(right.name, 'he');
  });
}
