import { describe, expect, it } from 'vitest';
import { buildCrew, dayPartLabel, groupByPost, openSeatRoles, seatRoles } from '../crew';
import type { Assignment, AssignmentAssignee } from '../types';

const name = (id: string) => ({ q_driver: 'נהג', q_cmd: 'מפקד', q_hamal: 'חמ״ל' })[id] ?? id;

const person = (id: string, role: string | null): AssignmentAssignee => ({
  personnelId: id,
  personnelName: id,
  unitId: null,
  role,
  assignedAt: 0,
  acknowledgedAt: null,
  overrideReason: null,
});

const patrol = {
  requiredHeadcount: 4,
  requiredQualifications: [
    { qualificationId: 'q_cmd', minCount: 1 },
    { qualificationId: 'q_driver', minCount: 1 },
  ],
};

describe('seats in a crew', () => {
  it('names one seat per required role and leaves the rest plain', () => {
    expect(seatRoles(patrol)).toEqual(['q_cmd', 'q_driver', null, null]);
  });

  it('binds every seat when the qualification applies to all of them', () => {
    // A חמ״ל shift is one חמ״ל seat, not a חמ״ל plus a spare.
    expect(
      seatRoles({
        requiredHeadcount: 1,
        requiredQualifications: [{ qualificationId: 'q_hamal', minCount: 0 }],
      }),
    ).toEqual(['q_hamal']);
  });

  it('reports only the seats nobody fills yet', () => {
    expect(
      openSeatRoles({
        ...patrol,
        assigneeIds: ['a', 'b'],
        assigneeRoles: { a: 'q_cmd', b: null },
      }),
    ).toEqual(['q_driver', null]);
  });
});

describe('the printed crew', () => {
  it('seats each person in the role they hold, and shows the empty seats', () => {
    const crew = buildCrew(
      { ...patrol, assignees: [person('דנה', 'q_driver'), person('רון', null)] },
      name,
    );
    expect(crew.map((seat) => [seat.label, seat.assignee?.personnelName ?? null])).toEqual([
      ['מפקד', 'רון'],
      ['נהג', 'דנה'],
      ['לוחם', null],
      ['לוחם', null],
    ]);
  });

  it('keeps an extra person rather than dropping them from the sheet', () => {
    const crew = buildCrew(
      {
        requiredHeadcount: 1,
        requiredQualifications: [],
        assignees: [person('א', null), person('ב', null)],
      },
      name,
    );
    expect(crew).toHaveLength(2);
    expect(crew[1]?.assignee?.personnelName).toBe('ב');
  });
});

const shift = (over: Partial<Assignment>): Assignment => ({
  id: 'x',
  scheduleId: null,
  assignmentTypeId: 'atp',
  assignmentTypeName: 'סיור',
  priority: 2,
  color: 'amber',
  unitId: null,
  title: null,
  startAt: 0,
  endAt: 4 * 3600_000,
  requiredHeadcount: 1,
  status: 'planned',
  publicationState: 'draft',
  notes: null,
  assignees: [],
  requiredQualifications: [],
  excludedQualificationIds: [],
  instructions: null,
  updatedAt: 0,
  ...over,
});

describe('grouping into posts', () => {
  it('collects a post’s shifts in time order, tallest post first', () => {
    const posts = groupByPost([
      shift({ id: 'b', assignmentTypeId: 'shag', assignmentTypeName: 'ש״ג', startAt: 3600_000 }),
      shift({ id: 'a', assignmentTypeId: 'shag', assignmentTypeName: 'ש״ג', startAt: 0 }),
      shift({
        id: 'c',
        assignmentTypeId: 'siur',
        assignmentTypeName: 'סיור',
        requiredHeadcount: 4,
      }),
    ]);
    // סיור prints a header plus four seats; ש״ג prints two single lines.
    expect(posts.map((post) => post.name)).toEqual(['סיור', 'ש״ג']);
    expect(posts[1]?.shifts.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('leaves a cancelled shift off the sheet', () => {
    expect(groupByPost([shift({ status: 'cancelled' })])).toHaveLength(0);
  });

  it('groups a lower priority number first, even over a taller post', () => {
    const posts = groupByPost([
      shift({
        id: 'a',
        assignmentTypeId: 'carmel',
        assignmentTypeName: 'כיתת כוננות א׳ כרמל',
        requiredHeadcount: 4,
        priority: 2,
      }),
      shift({ id: 'b', assignmentTypeId: 'medic', assignmentTypeName: 'חובש תורן', priority: 1 }),
      shift({
        id: 'c',
        assignmentTypeId: 'hafak',
        assignmentTypeName: 'חפ"ק',
        requiredHeadcount: 4,
        priority: 1,
      }),
    ]);
    // חפ"ק prints tallest within priority 1, so it still leads its group.
    expect(posts.map((post) => post.name)).toEqual(['חפ"ק', 'חובש תורן', 'כיתת כוננות א׳ כרמל']);
  });
});

describe('naming a shift with no title', () => {
  it('reads by the part of day it covers', () => {
    expect(dayPartLabel(6)).toBe('בוקר');
    expect(dayPartLabel(14)).toBe('צהריים');
    expect(dayPartLabel(19)).toBe('ערב');
    expect(dayPartLabel(23)).toBe('לילה');
    expect(dayPartLabel(2)).toBe('לילה');
  });
});
