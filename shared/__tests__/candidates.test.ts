import { describe, expect, it } from 'vitest';
import { rankCandidates } from '../candidates';
import { DEFAULT_RULES, type EngineAssignment, type EnginePerson } from '../conflicts';
import { wallClockToUtc } from '../time';

const TZ = 'Asia/Jerusalem';
const at = (day: string, time: string) => wallClockToUtc(day, time, TZ);

const target: EngineAssignment = {
  id: 'target',
  title: 'שמירה',
  startAt: at('2026-08-21', '08:00'),
  endAt: at('2026-08-21', '12:00'),
  requiredHeadcount: 1,
  requiredQualifications: [],
  assigneeIds: [],
  publicationState: 'draft',
};

const people: EnginePerson[] = [
  { id: 'busy', displayName: 'עמוס', qualificationIds: ['q_driver'] },
  { id: 'rested', displayName: 'רון', qualificationIds: ['q_driver'] },
];

const priorLoad: EngineAssignment[] = Array.from({ length: 4 }, (_, index) => ({
  id: `prior-${index}`,
  title: 'משימה קודמת',
  startAt: at(`2026-08-1${index + 3}`, '08:00'),
  endAt: at(`2026-08-1${index + 3}`, '20:00'),
  requiredHeadcount: 1,
  requiredQualifications: [],
  assigneeIds: ['busy'],
  publicationState: 'published',
}));

describe('candidate ranking', () => {
  it('prefers the person with the lighter recent workload', () => {
    const candidates = rankCandidates({
      assignment: target,
      personnel: people,
      assignments: [...priorLoad, target],
      absences: [],
      rules: DEFAULT_RULES,
      timezone: TZ,
    });
    expect(candidates[0]?.personnelId).toBe('rested');
    expect(candidates[0]?.score).toBeGreaterThan(candidates[1]?.score ?? 0);
  });

  it('explains every ranking with visible reasons', () => {
    const candidates = rankCandidates({
      assignment: target,
      personnel: people,
      assignments: [...priorLoad, target],
      absences: [],
      rules: DEFAULT_RULES,
      timezone: TZ,
    });
    for (const candidate of candidates) {
      expect(candidate.reasons.length).toBeGreaterThan(0);
    }
  });

  it('marks a person on leave as ineligible with the blocking reason', () => {
    const candidates = rankCandidates({
      assignment: target,
      personnel: people,
      assignments: [target],
      absences: [
        {
          personnelId: 'rested',
          kind: 'medical',
          startAt: at('2026-08-21', '06:00'),
          endAt: at('2026-08-21', '18:00'),
        },
      ],
      rules: DEFAULT_RULES,
      timezone: TZ,
    });
    const blocked = candidates.find((candidate) => candidate.personnelId === 'rested');
    expect(blocked?.eligible).toBe(false);
    expect(blocked?.score).toBe(0);
    expect(blocked?.blockers[0]).toContain('גימלים');
  });

  it('ranks eligible people above ineligible ones', () => {
    const candidates = rankCandidates({
      assignment: {
        ...target,
        requiredQualifications: [{ qualificationId: 'q_medic', minCount: 0 }],
      },
      personnel: [
        { id: 'medic', displayName: 'חובשת', qualificationIds: ['q_medic'] },
        { id: 'other', displayName: 'אחר', qualificationIds: [] },
      ],
      assignments: [target],
      absences: [],
      rules: DEFAULT_RULES,
      qualificationNames: { q_medic: 'חובש' },
      timezone: TZ,
    });
    expect(candidates[0]?.personnelId).toBe('medic');
    expect(candidates[1]?.eligible).toBe(false);
  });
});

describe('crew gaps', () => {
  const driver: EnginePerson = { id: 'd1', displayName: 'נהג', qualificationIds: ['q_drive'] };
  const commander: EnginePerson = { id: 'c1', displayName: 'מפקד', qualificationIds: ['q_cmd'] };
  const both: EnginePerson = {
    id: 'b1',
    displayName: 'שניהם',
    qualificationIds: ['q_drive', 'q_cmd'],
  };

  const target: EngineAssignment = {
    id: 'crew',
    title: 'סיור',
    startAt: at('2026-08-21', '08:00'),
    endAt: at('2026-08-21', '16:00'),
    requiredHeadcount: 4,
    requiredQualifications: [
      { qualificationId: 'q_drive', minCount: 1 },
      { qualificationId: 'q_cmd', minCount: 1 },
    ],
    assigneeIds: ['d1'],
    publicationState: 'draft',
  };

  it('does not claim a candidate fills a seat that is already taken', () => {
    const candidates = rankCandidates({
      assignment: target,
      personnel: [commander, both],
      roster: [driver, commander, both],
      assignments: [target],
      absences: [],
      rules: DEFAULT_RULES,
      qualificationNames: { q_drive: 'נהג', q_cmd: 'מפקד' },
      timezone: TZ,
    });
    const gapReasons = candidates
      .flatMap((candidate) => candidate.reasons)
      .filter((reason) => reason.startsWith('משלים הכשיר חסר'));
    expect(gapReasons.every((reason) => !reason.includes('נהג'))).toBe(true);
    expect(gapReasons.some((reason) => reason.includes('מפקד'))).toBe(true);
  });

  it('ranks whoever closes the open seat first', () => {
    const candidates = rankCandidates({
      assignment: target,
      personnel: [{ id: 'plain', displayName: 'לוחם', qualificationIds: [] }, commander],
      roster: [driver, commander],
      assignments: [target],
      absences: [],
      rules: DEFAULT_RULES,
      timezone: TZ,
    });
    expect(candidates[0]?.personnelId).toBe('c1');
  });
});
