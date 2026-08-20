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
  requiredQualificationIds: [],
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
  requiredQualificationIds: [],
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
      assignment: { ...target, requiredQualificationIds: ['q_medic'] },
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
