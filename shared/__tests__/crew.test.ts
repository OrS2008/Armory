import { describe, expect, it } from 'vitest';
import {
  buildCrew,
  dayPartLabel,
  turnLabels,
  groupByPost,
  isFullDay,
  moveSheetCard,
  openSeatRoles,
  seatRoles,
  sheetColumns,
  type SheetPlacement,
} from '../crew';
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
    // רון is on the shift without a seat, so he stands as a לוחם. The מפקד seat
    // stays empty rather than printing his name under a role he does not hold.
    expect(crew.map((seat) => [seat.label, seat.assignee?.personnelName ?? null])).toEqual([
      ['מפקד', null],
      ['נהג', 'דנה'],
      ['לוחם', 'רון'],
      ['לוחם', null],
    ]);
  });

  it('never prints a plain combatant in a named seat', () => {
    // Four people, none of them recorded as the commander or the driver: the
    // named seats are empty and every name reads לוחם, which is what they are.
    const crew = buildCrew(
      { ...patrol, assignees: ['א', 'ב', 'ג', 'ד'].map((id) => person(id, null)) },
      name,
    );
    expect(crew.filter((seat) => seat.label === 'מפקד' || seat.label === 'נהג')).toEqual([
      { roleQualificationId: 'q_cmd', label: 'מפקד', assignee: null },
      { roleQualificationId: 'q_driver', label: 'נהג', assignee: null },
    ]);
    expect(crew.filter((seat) => seat.assignee).every((seat) => seat.label === 'לוחם')).toBe(true);
    expect(crew.filter((seat) => seat.assignee)).toHaveLength(4);
  });

  it('seats somebody qualified for a named seat when it can tell they hold it', () => {
    // Told who holds what, a driver put on the shift without a seat is shown in
    // the driver's seat — and the person beside him, who holds nothing, is not.
    const holds = (personnelId: string, qualificationId: string) =>
      personnelId === 'דנה' && qualificationId === 'q_driver';
    const crew = buildCrew(
      { ...patrol, assignees: [person('רון', null), person('דנה', null)] },
      name,
      null,
      holds,
    );
    expect(crew.map((seat) => [seat.label, seat.assignee?.personnelName ?? null])).toEqual([
      ['מפקד', null],
      ['נהג', 'דנה'],
      ['לוחם', 'רון'],
      ['לוחם', null],
    ]);
  });

  it('still fills a seat that names everyone, because it is not a named seat', () => {
    // A חמ״ל shift binds its one seat to חמ״ל; that is the post's requirement,
    // not a role inside a crew, so whoever is on the shift is printed in it.
    const crew = buildCrew(
      {
        requiredHeadcount: 1,
        requiredQualifications: [{ qualificationId: 'q_hamal', minCount: 0 }],
        assignees: [person('נועה', null)],
      },
      name,
    );
    expect(crew.map((seat) => [seat.label, seat.assignee?.personnelName ?? null])).toEqual([
      ['חמ״ל', 'נועה'],
    ]);
  });

  it('names the post inside the seat when the post asks for it', () => {
    const crew = buildCrew({ ...patrol, assignees: [person('דנה', 'q_driver')] }, name, 'סיור');
    expect(crew.map((seat) => seat.label)).toEqual([
      'מפקד סיור',
      'נהג סיור',
      'לוחם סיור',
      'לוחם סיור',
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
  section: null,
  sheetLabel: null,
  crewRoleSuffix: null,
  maxContinuousMinutes: null,
  sheetColumn: null,
  postActive: true,
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
        requiredQualifications: [{ qualificationId: 'q_cmd', minCount: 1 }],
      }),
    ]);
    // סיור prints a header plus four seats; ש״ג prints two single lines.
    expect(posts.map((post) => post.name)).toEqual(['סיור', 'ש״ג']);
    expect(posts[1]?.shifts.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('leaves a cancelled shift off the sheet', () => {
    expect(groupByPost([shift({ status: 'cancelled' })])).toHaveLength(0);
  });

  /*
   * Retiring a post is how a company says it no longer stands one. The shifts
   * laid out for it are not undone by that, and a renamed post whose old row
   * kept its hundreds of shifts printed a card nobody could read beside an
   * empty one under the new name.
   */
  it('leaves a retired post off the sheet', () => {
    expect(groupByPost([shift({ postActive: false })])).toHaveLength(0);
  });

  it('still prints a retired post while somebody is on it', () => {
    // Hiding a shift somebody is standing is how they end up not relieved.
    const posts = groupByPost([shift({ postActive: false, assignees: [person('דנה', null)] })]);
    expect(posts).toHaveLength(1);
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
        requiredQualifications: [{ qualificationId: 'q_cmd', minCount: 1 }],
      }),
    ]);
    // חפ"ק prints tallest within priority 1, so it still leads its group.
    expect(posts.map((post) => post.name)).toEqual(['חפ"ק', 'חובש תורן', 'כיתת כוננות א׳ כרמל']);
  });
});

describe('the printed page', () => {
  const post = (id: string, over: Partial<Assignment> = {}) =>
    shift({ id, assignmentTypeId: id, assignmentTypeName: id, ...over });

  it('prints a post in the column it says it belongs to', () => {
    const columns = sheetColumns(
      groupByPost([
        post('a', { sheetColumn: 3, priority: 1 }),
        post('b', { sheetColumn: 1, priority: 2 }),
        post('c', { sheetColumn: 3, priority: 3 }),
      ]),
    );
    expect(columns.map((column) => column.map((item) => item.name))).toEqual([
      ['b'],
      [],
      ['a', 'c'],
    ]);
  });

  it('deals a post with no column of its own into the emptiest one', () => {
    const columns = sheetColumns(
      groupByPost([post('a', { sheetColumn: 1 }), post('b'), post('c')]),
    );
    // Column 1 already carries a post, so the two loose ones fill 2 and 3.
    expect(columns.map((column) => column.length)).toEqual([1, 1, 1]);
  });

  it('folds the third column into the second when the page is narrower', () => {
    const columns = sheetColumns(groupByPost([post('a', { sheetColumn: 3 })]), 2);
    expect(columns).toHaveLength(2);
    expect(columns[1]?.map((item) => item.name)).toEqual(['a']);
  });

  it('calls a post crewed only when its seats carry names', () => {
    const [named] = groupByPost([
      post('siur', { requiredQualifications: [{ qualificationId: 'q_cmd', minCount: 1 }] }),
    ]);
    const [plain] = groupByPost([
      post('shag', { requiredQualifications: [{ qualificationId: 'q_hamal', minCount: 0 }] }),
    ]);
    expect(named?.crewed).toBe(true);
    // Binding every seat to one mark names nothing: it is still a plain list.
    expect(plain?.crewed).toBe(false);
  });

  it('titles a card by its gate, and falls back to the sheet label', () => {
    const [gated] = groupByPost([post('mashkif', { section: 'שער הדוקטור' })]);
    const [labelled] = groupByPost([post('shag', { sheetLabel: 'ש.ג. - 4 שעות משמרת' })]);
    expect(gated?.title).toBe('שער הדוקטור');
    expect(labelled?.title).toBe('ש.ג. - 4 שעות משמרת');
  });

  it('reads a whole-day turn as one that needs no clock', () => {
    expect(isFullDay({ startAt: 0, endAt: 24 * 3600_000 })).toBe(true);
    expect(isFullDay({ startAt: 0, endAt: 8 * 3600_000 })).toBe(false);
  });
});

describe('dragging a card to another place on the page', () => {
  const post = (id: string, over: Partial<Assignment> = {}) =>
    shift({ id, assignmentTypeId: id, assignmentTypeName: id, ...over });
  const page = (...ids: string[][]) =>
    sheetColumns(
      groupByPost(
        ids.flatMap((column, index) =>
          column.map((id, at) => post(id, { sheetColumn: index + 1, priority: index * 10 + at })),
        ),
      ),
    );
  const shape = (placements: SheetPlacement[]) =>
    placements
      .slice()
      .sort((left, right) => left.priority - right.priority)
      .map((item) => `${item.column}:${item.assignmentTypeId}`);

  it('drops a card above a named one, and closes the gap it left', () => {
    const placements = moveSheetCard(page(['a', 'b'], ['c', 'd'], []), 'd', {
      column: 0,
      before: 'b',
    });
    expect(shape(placements)).toEqual(['1:a', '1:d', '1:b', '2:c']);
  });

  it('drops a card at the foot of a column when nothing is named', () => {
    const placements = moveSheetCard(page(['a'], ['b', 'c'], []), 'a', {
      column: 1,
      before: null,
    });
    expect(shape(placements)).toEqual(['2:b', '2:c', '2:a']);
  });

  it('moves a card down its own column without landing one place short', () => {
    // The card is lifted out before it lands, so "above c" is above c as the
    // reader sees it, not above whatever c became once a was removed.
    const placements = moveSheetCard(page(['a', 'b', 'c'], [], []), 'a', {
      column: 0,
      before: 'c',
    });
    expect(shape(placements)).toEqual(['1:b', '1:a', '1:c']);
  });

  it('fills an empty column', () => {
    const placements = moveSheetCard(page(['a', 'b'], [], []), 'b', {
      column: 2,
      before: null,
    });
    expect(shape(placements)).toEqual(['1:a', '3:b']);
  });

  it('numbers the page from one, so the order stored is the order seen', () => {
    const placements = moveSheetCard(page(['a', 'b'], ['c'], []), 'c', {
      column: 0,
      before: 'a',
    });
    expect(placements.map((item) => item.priority)).toEqual([1, 2, 3]);
  });

  it('says nothing about a card that is not on the page', () => {
    expect(moveSheetCard(page(['a'], [], []), 'ghost', { column: 0, before: null })).toEqual([]);
  });
});

describe('naming the turns of a post', () => {
  it('reads down the card בוקר, צהריים, ערב however early the post hands over', () => {
    expect(turnLabels(3)).toEqual(['בוקר', 'צהריים', 'ערב']);
    expect(turnLabels(2)).toEqual(['בוקר', 'ערב']);
    expect(turnLabels(4)).toEqual(['בוקר', 'צהריים', 'ערב', 'לילה']);
  });

  it('has no names for a rhythm nobody says out loud', () => {
    // ש״ג changes every four hours and prints as a list of times instead.
    expect(turnLabels(6)).toBeNull();
    expect(turnLabels(1)).toBeNull();
  });
});

describe('the day a turn belongs to', () => {
  const DAY = 24 * 3600_000;
  const window = { from: DAY, to: 2 * DAY - 1 };

  it('keeps last night off this morning’s sheet', () => {
    const posts = groupByPost(
      [
        // Yesterday's evening turn, still running at midnight.
        shift({ id: 'yesterday', startAt: DAY - 3 * 3600_000, endAt: DAY + 5 * 3600_000 }),
        shift({ id: 'today', startAt: DAY + 5 * 3600_000, endAt: DAY + 13 * 3600_000 }),
      ],
      window,
    );
    expect(posts[0]?.shifts.map((item) => item.id)).toEqual(['today']);
  });

  it('keeps a turn that runs past midnight on the day it starts', () => {
    const posts = groupByPost(
      [shift({ id: 'tonight', startAt: DAY + 21 * 3600_000, endAt: 2 * DAY + 5 * 3600_000 })],
      window,
    );
    expect(posts[0]?.shifts.map((item) => item.id)).toEqual(['tonight']);
  });

  it('shows everything in progress when no day is named', () => {
    expect(groupByPost([shift({ startAt: 0, endAt: DAY })])).toHaveLength(1);
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
