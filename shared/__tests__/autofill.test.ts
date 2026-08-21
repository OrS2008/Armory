import { describe, expect, it } from 'vitest';
import { buildAutofillProposal } from '../autofill';
import { DEFAULT_RULES, type EngineAssignment, type EnginePerson } from '../conflicts';
import { wallClockToUtc } from '../time';

const TZ = 'Asia/Jerusalem';
const at = (day: string, time: string) => wallClockToUtc(day, time, TZ);

const person = (id: string, name: string, quals: string[] = []): EnginePerson => ({
  id,
  displayName: name,
  qualificationIds: quals,
});

const post = (
  id: string,
  title: string,
  start: string,
  end: string,
  headcount: number,
  quals: { qualificationId: string; minCount: number }[] = [],
  assigneeIds: string[] = [],
): EngineAssignment => ({
  id,
  title,
  startAt: at('2026-08-21', start),
  endAt: at('2026-08-21', end),
  requiredHeadcount: headcount,
  requiredQualifications: quals,
  assigneeIds,
  publicationState: 'draft',
});

const roster = [
  person('p1', 'אורי', ['q_drive', 'q_cmd']),
  person('p2', 'דניאל', ['q_drive']),
  person('p3', 'יונתן', ['q_cmd']),
  person('p4', 'איתי'),
  person('p5', 'נועם'),
  person('p6', 'עומר'),
];

const run = (
  assignments: EngineAssignment[],
  extra: Partial<Parameters<typeof buildAutofillProposal>[0]> = {},
) =>
  buildAutofillProposal({
    assignments,
    personnel: roster,
    absences: [],
    rules: DEFAULT_RULES,
    qualificationNames: { q_drive: 'נהג', q_cmd: 'מפקד' },
    timezone: TZ,
    ...extra,
  });

describe('auto-fill', () => {
  it('fills a simple post up to its headcount', () => {
    const proposal = run([post('a1', 'ש״ג', '08:00', '16:00', 1)]);
    expect(proposal.proposed).toHaveLength(1);
    expect(proposal.gaps).toEqual([]);
  });

  it('never puts the same person on two overlapping posts', () => {
    const proposal = run([
      post('a1', 'ש״ג', '08:00', '16:00', 1),
      post('a2', 'נחל שכם', '08:00', '16:00', 2),
    ]);
    const picks = proposal.proposed.map((item) => item.personnelId);
    expect(new Set(picks).size).toBe(picks.length);
  });

  it('satisfies a crew requirement for a driver and a commander', () => {
    const proposal = run([
      post('a1', 'סיור', '08:00', '16:00', 4, [
        { qualificationId: 'q_drive', minCount: 1 },
        { qualificationId: 'q_cmd', minCount: 1 },
      ]),
    ]);
    const picked = proposal.proposed.map((item) =>
      roster.find((person) => person.id === item.personnelId)!,
    );
    expect(picked).toHaveLength(4);
    expect(picked.some((person) => person.qualificationIds.includes('q_drive'))).toBe(true);
    expect(picked.some((person) => person.qualificationIds.includes('q_cmd'))).toBe(true);
  });

  it('does not strand a constrained post by spending its crew on an easy one', () => {
    const proposal = run([
      post('easy', 'נחל שכם', '08:00', '16:00', 2),
      post('hard', 'סיור', '08:00', '16:00', 2, [
        { qualificationId: 'q_drive', minCount: 1 },
        { qualificationId: 'q_cmd', minCount: 1 },
      ]),
    ]);
    expect(proposal.gaps).toEqual([]);
    const hard = proposal.proposed.filter((item) => item.assignmentId === 'hard');
    const quals = hard.flatMap(
      (item) => roster.find((person) => person.id === item.personnelId)!.qualificationIds,
    );
    expect(quals).toContain('q_drive');
    expect(quals).toContain('q_cmd');
  });

  it('reports a gap instead of inventing an ineligible assignment', () => {
    const proposal = run([post('a1', 'סיור', '08:00', '16:00', 20)]);
    expect(proposal.gaps).toHaveLength(1);
    expect(proposal.gaps[0]?.missing).toBe(20 - roster.length);
  });

  it('leaves people who are away out of the proposal', () => {
    const proposal = run([post('a1', 'ש״ג', '08:00', '16:00', 6)], {
      absences: roster.slice(0, 5).map((person) => ({
        personnelId: person.id,
        kind: 'leave' as const,
        startAt: at('2026-08-21', '00:00'),
        endAt: at('2026-08-22', '00:00'),
      })),
    });
    expect(proposal.proposed).toHaveLength(1);
    expect(proposal.proposed[0]?.personnelId).toBe('p6');
  });

  it('respects seats that are already filled', () => {
    const proposal = run([post('a1', 'ש״ג', '08:00', '16:00', 2, [], ['p1'])]);
    expect(proposal.proposed).toHaveLength(1);
    expect(proposal.proposed[0]?.personnelId).not.toBe('p1');
  });

  it('spreads the load rather than reusing one person all day', () => {
    const proposal = run([
      post('m', 'ש״ג בוקר', '00:00', '08:00', 1),
      post('n', 'ש״ג צהריים', '08:00', '16:00', 1),
      post('e', 'ש״ג ערב', '16:00', '23:59', 1),
    ]);
    const picks = proposal.proposed.map((item) => item.personnelId);
    expect(new Set(picks).size).toBe(3);
  });

  it('explains every pick', () => {
    const proposal = run([post('a1', 'ש״ג', '08:00', '16:00', 2)]);
    for (const item of proposal.proposed) {
      expect(item.reasons.length).toBeGreaterThan(0);
    }
  });

  it('changes nothing when every post is already staffed', () => {
    const proposal = run([post('a1', 'ש״ג', '08:00', '16:00', 1, [], ['p1'])]);
    expect(proposal.proposed).toEqual([]);
    expect(proposal.gaps).toEqual([]);
  });
});

describe('when the day asks more of the roster than it has', () => {
  const eightHours = DEFAULT_RULES.map((rule) =>
    rule.code === 'MAX_CONTINUOUS' ? { ...rule, config: { minutes: 480 } } : rule,
  );

  const shift = (id: string, from: number, to: number): EngineAssignment => ({
    id,
    title: 'סיור',
    startAt: Date.UTC(2026, 7, 21, from),
    endAt: Date.UTC(2026, 7, 21, to),
    requiredHeadcount: 2,
    requiredQualifications: [],
    assigneeIds: [],
    publicationState: 'draft',
  });

  const two: EnginePerson[] = [
    { id: 'p1', displayName: 'א', qualificationIds: [] },
    { id: 'p2', displayName: 'ב', qualificationIds: [] },
  ];

  it('leaves the seats empty rather than working two people around the clock', () => {
    // Three back-to-back eight-hour shifts, two seats each, two people.
    const proposal = buildAutofillProposal({
      assignments: [shift('a', 0, 8), shift('b', 8, 16), shift('c', 16, 24)],
      personnel: two,
      absences: [],
      rules: eightHours,
    });

    // The two shifts that are not adjacent are staffed — eight hours on, eight
    // off, eight on. The middle one would make a sixteen-hour run either side
    // of it, so it is left empty instead.
    expect(proposal.proposed).toHaveLength(4);
    expect(proposal.gaps.reduce((total, gap) => total + gap.missing, 0)).toBe(2);
    expect(proposal.gaps[0]?.assignmentId).toBe('b');
  });

  it('reports the arithmetic behind the gaps', () => {
    const proposal = buildAutofillProposal({
      assignments: [shift('a', 0, 8), shift('b', 8, 16), shift('c', 16, 24)],
      personnel: two,
      absences: [],
      rules: eightHours,
    });

    // Six seats of eight hours across two people: twenty-four hours each.
    expect(proposal.demand.seatHours).toBe(48);
    expect(proposal.demand.people).toBe(2);
    expect(proposal.demand.hoursPerPerson).toBe(24);
  });
});
