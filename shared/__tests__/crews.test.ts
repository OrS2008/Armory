import { describe, expect, it } from 'vitest';
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

  it('takes the earlier rotation when a shift is split evenly', () => {
    const conflicts = run(shift(['a1', 'a2', 'b1', 'b2']), ['a1', 'a2', 'b1', 'b2']);
    const blamed = conflicts
      .filter((one) => one.code === 'CREW_NO_MIX')
      .map((one) => one.personnelId);
    expect(blamed).toEqual(['b1', 'b2']);
  });

  it('leaves a post with no crews exactly as it was', () => {
    const conflicts = run(shift(['x1', 'x2'], 'atp_shag'), ['x1', 'x2']);
    expect(conflicts.filter((one) => one.code.startsWith('CREW_'))).toEqual([]);
  });
});
