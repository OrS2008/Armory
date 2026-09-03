import { describe, expect, it } from 'vitest';
import { buildAutofillProposal } from '../autofill';
import { DEFAULT_RULES, detectConflicts, type EngineAssignment } from '../conflicts';

/*
 * "צוות שלם, בלי חריגות בכלל."
 *
 * חפ״ק is not four seats filled from the roster: it is two rotations of four
 * who go on together. That is a fact about the group, so it cannot be said
 * with a qualification — a qualification is always a fact about one person.
 */
const CREWS = {
  atp_hafak: [
    { id: 'crew_a', name: 'סבב א׳', position: 1, memberIds: ['a1', 'a2', 'a3', 'a4'] },
    { id: 'crew_b', name: 'סבב ב׳', position: 2, memberIds: ['b1', 'b2', 'b3', 'b4'] },
  ],
};

const people = (...ids: string[]) =>
  ids.map((id) => ({ id, displayName: id, qualificationIds: [] }));

const shift = (assigneeIds: string[], typeId = 'atp_hafak'): EngineAssignment => ({
  id: 'asg_1',
  assignmentTypeId: typeId,
  title: 'חפ״ק',
  startAt: Date.UTC(2026, 8, 3, 0, 0),
  endAt: Date.UTC(2026, 8, 4, 0, 0),
  requiredHeadcount: 4,
  requiredQualifications: [],
  assigneeIds,
  publicationState: 'draft',
});

const run = (assignment: EngineAssignment, ids: string[]) =>
  detectConflicts({
    assignments: [assignment],
    personnel: people(...ids),
    absences: [],
    rules: DEFAULT_RULES,
    crewsByType: CREWS,
  });

describe('a post stood by fixed crews', () => {
  it('accepts one whole crew', () => {
    const conflicts = run(shift(['a1', 'a2', 'a3', 'a4']), ['a1', 'a2', 'a3', 'a4']);
    expect(conflicts.filter((one) => one.code.startsWith('CREW_'))).toEqual([]);
  });

  it('refuses somebody who is in no crew of that post', () => {
    const conflicts = run(shift(['a1', 'a2', 'a3', 'stranger']), ['a1', 'a2', 'a3', 'stranger']);
    const refused = conflicts.find((one) => one.code === 'CREW_MEMBER_ONLY');
    expect(refused?.personnelId).toBe('stranger');
    expect(refused?.severity).toBe('blocking');
    // "בלי חריגות בכלל" — there is nothing for an override to mean.
    expect(refused?.overridable).toBe(false);
  });

  it('refuses a mix of two crews, naming which shift is which', () => {
    const conflicts = run(shift(['a1', 'a2', 'a3', 'b4']), ['a1', 'a2', 'a3', 'b4']);
    const mixed = conflicts.filter((one) => one.code === 'CREW_NO_MIX');
    expect(mixed).toHaveLength(1);
    expect(mixed[0]?.personnelId).toBe('b4');
    expect(mixed[0]?.message).toContain('סבב ב׳');
    expect(mixed[0]?.message).toContain('סבב א׳');
  });

  it('blames the smaller half, not whichever came back second', () => {
    // The same shift stated in the other order must produce the same answer,
    // or two against two would blame whoever SQLite happened to list last.
    const one = run(shift(['b1', 'b2', 'b3', 'a4']), ['b1', 'b2', 'b3', 'a4']);
    const other = run(shift(['a4', 'b3', 'b2', 'b1']), ['a4', 'b3', 'b2', 'b1']);
    const blamed = (list: typeof one) =>
      list.filter((each) => each.code === 'CREW_NO_MIX').map((each) => each.personnelId);
    expect(blamed(one)).toEqual(['a4']);
    expect(blamed(other)).toEqual(['a4']);
  });

  it('takes the crew that was on it first when a shift is split evenly', () => {
    const conflicts = run(shift(['b1', 'b2', 'a1', 'a2']), ['b1', 'b2', 'a1', 'a2']);
    const blamed = conflicts
      .filter((one) => one.code === 'CREW_NO_MIX')
      .map((one) => one.personnelId);
    expect(blamed).toEqual(['a1', 'a2']);
  });

  it('leaves a post with no crews exactly as it was', () => {
    const conflicts = run(shift(['x1', 'x2'], 'atp_shag'), ['x1', 'x2']);
    expect(conflicts.filter((one) => one.code.startsWith('CREW_'))).toEqual([]);
  });
});

describe('auto-fill on a post stood by fixed crews', () => {
  /*
   * Four named seats for four people, and two crews that each hold exactly one
   * of every mark. Nothing here picks a crew: the first seat taken makes the
   * other crew ineligible for the rest of the shift, so one whole crew falls
   * out of the ranking that was already there.
   */
  const MARKS = { cmd: 'מפקד', drv: 'נהג', med: 'חובש', mrk: 'קלע' };
  const crewOf = (prefix: string) => [
    { id: `${prefix}1`, displayName: `${prefix} מפקד`, qualificationIds: ['cmd'] },
    { id: `${prefix}2`, displayName: `${prefix} נהג`, qualificationIds: ['drv'] },
    { id: `${prefix}3`, displayName: `${prefix} חובש`, qualificationIds: ['med'] },
    { id: `${prefix}4`, displayName: `${prefix} קלע`, qualificationIds: ['mrk'] },
  ];
  const roster = [...crewOf('a'), ...crewOf('b')];
  const crews = {
    atp_hafak: [
      { id: 'crew_a', name: 'סבב א׳', position: 1, memberIds: ['a1', 'a2', 'a3', 'a4'] },
      { id: 'crew_b', name: 'סבב ב׳', position: 2, memberIds: ['b1', 'b2', 'b3', 'b4'] },
    ],
  };
  const hafak: EngineAssignment = {
    id: 'asg_hafak',
    assignmentTypeId: 'atp_hafak',
    title: 'חפ״ק',
    startAt: Date.UTC(2026, 8, 10, 0, 0),
    endAt: Date.UTC(2026, 8, 11, 0, 0),
    // Handed over once a day, and the post says so — otherwise MAX_CONTINUOUS
    // reads a designed twenty-four-hour turn as somebody stacking three.
    maxContinuousMinutes: 1440,
    requiredHeadcount: 4,
    requiredQualifications: [
      { qualificationId: 'cmd', minCount: 1 },
      { qualificationId: 'drv', minCount: 1 },
      { qualificationId: 'med', minCount: 1 },
      { qualificationId: 'mrk', minCount: 1 },
    ],
    assigneeIds: [],
    publicationState: 'draft',
  };

  const fill = (assignment: EngineAssignment) =>
    buildAutofillProposal({
      assignments: [assignment],
      personnel: roster,
      absences: [],
      rules: DEFAULT_RULES,
      qualificationNames: MARKS,
      crewsByType: crews,
    });

  it('fills all four seats with one crew and no one from the other', () => {
    const { proposed, gaps } = fill(hafak);
    expect(gaps).toEqual([]);
    expect(proposed).toHaveLength(4);
    const prefixes = new Set(proposed.map((one) => one.personnelId[0]));
    expect(prefixes.size).toBe(1);
    // Every seat is the one that person's mark names.
    for (const pick of proposed) {
      const person = roster.find((one) => one.id === pick.personnelId);
      expect(person?.qualificationIds).toContain(pick.role);
    }
  });

  it('follows the crew already on the shift rather than starting a second', () => {
    const started = { ...hafak, assigneeIds: ['b1'], assigneeRoles: { b1: 'cmd' } };
    const { proposed } = fill(started);
    expect(proposed).toHaveLength(3);
    expect(proposed.every((one) => one.personnelId.startsWith('b'))).toBe(true);
  });

  it('proposes nobody at all when the post has crews and the roster is outside them', () => {
    const outsiders = buildAutofillProposal({
      assignments: [hafak],
      personnel: [{ id: 'x1', displayName: 'זר', qualificationIds: ['cmd', 'drv', 'med', 'mrk'] }],
      absences: [],
      rules: DEFAULT_RULES,
      qualificationNames: MARKS,
      crewsByType: crews,
    });
    expect(outsiders.proposed).toEqual([]);
    expect(outsiders.gaps).toHaveLength(1);
  });
});
