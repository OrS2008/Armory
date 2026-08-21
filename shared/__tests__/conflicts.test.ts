import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  blockingConflicts,
  detectConflicts,
  summarizeConflicts,
  type EngineAssignment,
  type EnginePerson,
  type SchedulingRule,
} from '../conflicts';
import { wallClockToUtc } from '../time';

const TZ = 'Asia/Jerusalem';
const at = (day: string, time: string) => wallClockToUtc(day, time, TZ);

const dan: EnginePerson = { id: 'p1', displayName: 'דניאל', qualificationIds: ['q_driver'] };
const noa: EnginePerson = { id: 'p2', displayName: 'נועה', qualificationIds: [] };

function assignment(overrides: Partial<EngineAssignment> = {}): EngineAssignment {
  return {
    id: 'a1',
    title: 'שמירה',
    startAt: at('2026-08-21', '08:00'),
    endAt: at('2026-08-21', '12:00'),
    requiredHeadcount: 1,
    requiredQualifications: [],
    assigneeIds: ['p1'],
    publicationState: 'published',
    ...overrides,
  };
}

function run(assignments: EngineAssignment[], rules: SchedulingRule[] = DEFAULT_RULES, extra = {}) {
  return detectConflicts({
    assignments,
    personnel: [dan, noa],
    absences: [],
    rules,
    timezone: TZ,
    ...extra,
  });
}

describe('overlap detection', () => {
  it('blocks a person assigned to two overlapping assignments', () => {
    const conflicts = run([
      assignment(),
      assignment({
        id: 'a2',
        title: 'מטבח',
        startAt: at('2026-08-21', '10:00'),
        endAt: at('2026-08-21', '14:00'),
      }),
    ]);
    const overlap = conflicts.find((conflict) => conflict.code === 'NO_OVERLAP');
    expect(overlap?.severity).toBe('blocking');
    expect(overlap?.personnelId).toBe('p1');
    expect(overlap?.message).toContain('דניאל');
    expect(overlap?.message).toContain('10:00');
    expect(overlap?.resolution).toBeTruthy();
  });

  it('allows back-to-back assignments that only touch at the boundary', () => {
    const conflicts = run([
      assignment(),
      assignment({
        id: 'a2',
        startAt: at('2026-08-21', '12:00'),
        endAt: at('2026-08-21', '16:00'),
      }),
    ]);
    expect(conflicts.some((conflict) => conflict.code === 'NO_OVERLAP')).toBe(false);
  });
});

describe('availability', () => {
  it('blocks assigning someone who is on approved leave', () => {
    const conflicts = detectConflicts({
      assignments: [assignment()],
      personnel: [dan],
      absences: [
        {
          personnelId: 'p1',
          kind: 'leave',
          startAt: at('2026-08-21', '00:00'),
          endAt: at('2026-08-22', '00:00'),
        },
      ],
      rules: DEFAULT_RULES,
      timezone: TZ,
    });
    const conflict = conflicts.find((item) => item.code === 'AVAILABILITY_REQUIRED');
    expect(conflict?.severity).toBe('blocking');
    expect(conflict?.message).toContain('חופשה');
  });

  it('ignores absences that do not overlap the assignment', () => {
    const conflicts = detectConflicts({
      assignments: [assignment()],
      personnel: [dan],
      absences: [
        {
          personnelId: 'p1',
          kind: 'leave',
          startAt: at('2026-08-22', '00:00'),
          endAt: at('2026-08-23', '00:00'),
        },
      ],
      rules: DEFAULT_RULES,
      timezone: TZ,
    });
    expect(conflicts.some((item) => item.code === 'AVAILABILITY_REQUIRED')).toBe(false);
  });
});

describe('qualifications', () => {
  it('blocks a person missing a required qualification', () => {
    const conflicts = run(
      [
        assignment({
          assigneeIds: ['p2'],
          requiredQualifications: [{ qualificationId: 'q_driver', minCount: 0 }],
        }),
      ],
      DEFAULT_RULES,
      { qualificationNames: { q_driver: 'נהיגה' } },
    );
    const conflict = conflicts.find((item) => item.code === 'QUALIFICATION_REQUIRED');
    expect(conflict?.severity).toBe('blocking');
    expect(conflict?.message).toContain('נהיגה');
  });

  it('accepts a person who holds it', () => {
    const conflicts = run([
      assignment({ requiredQualifications: [{ qualificationId: 'q_driver', minCount: 0 }] }),
    ]);
    expect(conflicts.some((item) => item.code === 'QUALIFICATION_REQUIRED')).toBe(false);
  });
});

describe('rest and duration rules', () => {
  it('warns when rest between assignments is below the configured minimum', () => {
    const conflicts = run([
      assignment(),
      assignment({
        id: 'a2',
        startAt: at('2026-08-21', '14:00'),
        endAt: at('2026-08-21', '18:00'),
      }),
    ]);
    const conflict = conflicts.find((item) => item.code === 'MIN_REST');
    expect(conflict?.severity).toBe('warning');
    expect(conflict?.message).toContain('2');
  });

  it('warns when a single assignment runs longer than allowed', () => {
    const conflicts = run([
      assignment({ startAt: at('2026-08-21', '06:00'), endAt: at('2026-08-21', '23:00') }),
    ]);
    expect(conflicts.some((item) => item.code === 'MAX_CONTINUOUS')).toBe(true);
  });

  it('warns when a person exceeds the daily assignment count', () => {
    const conflicts = run([
      assignment({
        id: 'a1',
        startAt: at('2026-08-21', '00:00'),
        endAt: at('2026-08-21', '02:00'),
      }),
      assignment({
        id: 'a2',
        startAt: at('2026-08-21', '10:00'),
        endAt: at('2026-08-21', '12:00'),
      }),
      assignment({
        id: 'a3',
        startAt: at('2026-08-21', '20:00'),
        endAt: at('2026-08-21', '22:00'),
      }),
    ]);
    const conflict = conflicts.find((item) => item.code === 'MAX_ASSIGNMENTS_PER_DAY');
    expect(conflict?.message).toContain('21/08/2026');
  });
});

describe('staffing', () => {
  it('warns on understaffing and reports the gap', () => {
    const conflicts = run([assignment({ requiredHeadcount: 3 })]);
    const conflict = conflicts.find((item) => item.code === 'UNDERSTAFFED');
    expect(conflict?.severity).toBe('warning');
    expect(conflict?.message).toContain('1');
    expect(conflict?.message).toContain('3');
  });

  it('reports overstaffing as information only', () => {
    const conflicts = run([assignment({ requiredHeadcount: 0 })]);
    expect(conflicts.find((item) => item.code === 'OVERSTAFFED')?.severity).toBe('info');
  });

  it('flags assignments that have not been published', () => {
    const conflicts = run([assignment({ publicationState: 'draft' })]);
    expect(conflicts.some((item) => item.code === 'UNPUBLISHED_CHANGES')).toBe(true);
  });
});

describe('rule configuration', () => {
  it('produces nothing when every rule is disabled', () => {
    const disabled = DEFAULT_RULES.map((rule) => ({ ...rule, enabled: false }));
    expect(run([assignment({ requiredHeadcount: 5 })], disabled)).toEqual([]);
  });

  it('honours a severity change from warning to blocking', () => {
    const rules = DEFAULT_RULES.map((rule) =>
      rule.code === 'UNDERSTAFFED' ? { ...rule, severity: 'blocking' as const } : rule,
    );
    const conflicts = run([assignment({ requiredHeadcount: 3 })], rules);
    expect(blockingConflicts(conflicts).some((item) => item.code === 'UNDERSTAFFED')).toBe(true);
  });

  it('skips checks for an assignee the scheduler explicitly overrode', () => {
    const conflicts = detectConflicts({
      assignments: [assignment({ overriddenBy: ['p1'] })],
      personnel: [dan],
      absences: [
        {
          personnelId: 'p1',
          kind: 'leave',
          startAt: at('2026-08-21', '00:00'),
          endAt: at('2026-08-22', '00:00'),
        },
      ],
      rules: DEFAULT_RULES,
      timezone: TZ,
    });
    expect(conflicts.some((item) => item.code === 'AVAILABILITY_REQUIRED')).toBe(false);
  });

  it('ignores cancelled assignments entirely', () => {
    expect(run([assignment({ cancelled: true, requiredHeadcount: 9 })])).toEqual([]);
  });
});

describe('summary', () => {
  it('counts conflicts by severity and sorts the worst first', () => {
    const conflicts = run([
      assignment({ requiredHeadcount: 4, publicationState: 'draft' }),
      assignment({
        id: 'a2',
        startAt: at('2026-08-21', '10:00'),
        endAt: at('2026-08-21', '14:00'),
        requiredHeadcount: 1,
      }),
    ]);
    const summary = summarizeConflicts(conflicts);
    expect(summary.blocking).toBeGreaterThan(0);
    expect(conflicts[0]?.severity).toBe('blocking');
  });
});

describe('crew-level qualifications', () => {
  const driver: EnginePerson = { id: 'd1', displayName: 'נהג', qualificationIds: ['q_drive'] };
  const commander: EnginePerson = { id: 'c1', displayName: 'מפקד', qualificationIds: ['q_cmd'] };
  const plain: EnginePerson = { id: 'x1', displayName: 'לוחם', qualificationIds: [] };
  const names = { q_drive: 'נהג', q_cmd: 'מפקד' };

  const crew = (assigneeIds: string[]): EngineAssignment =>
    assignment({
      title: 'סיור',
      requiredHeadcount: 4,
      assigneeIds,
      requiredQualifications: [
        { qualificationId: 'q_drive', minCount: 1 },
        { qualificationId: 'q_cmd', minCount: 1 },
      ],
    });

  const evaluate = (assigneeIds: string[]) =>
    detectConflicts({
      assignments: [crew(assigneeIds)],
      personnel: [driver, commander, plain],
      absences: [],
      rules: DEFAULT_RULES,
      qualificationNames: names,
      timezone: TZ,
    });

  it('accepts a crew that contains one driver and one commander', () => {
    const conflicts = evaluate(['d1', 'c1', 'x1', 'x1']);
    expect(conflicts.some((c) => c.code === 'QUALIFICATION_REQUIRED')).toBe(false);
  });

  it('does not demand that every member hold every qualification', () => {
    const conflicts = evaluate(['d1', 'c1']);
    expect(conflicts.filter((c) => c.code === 'QUALIFICATION_REQUIRED')).toEqual([]);
  });

  it('reports the missing role against the assignment, not against a person', () => {
    const conflicts = evaluate(['d1', 'x1']);
    const missing = conflicts.find((c) => c.code === 'QUALIFICATION_REQUIRED');
    expect(missing?.personnelId).toBeNull();
    expect(missing?.message).toContain('מפקד');
    expect(missing?.message).toContain('סיור');
  });

  it('reports each missing role separately', () => {
    const conflicts = evaluate(['x1', 'x1']);
    expect(conflicts.filter((c) => c.code === 'QUALIFICATION_REQUIRED')).toHaveLength(2);
  });

  it('still requires every assignee to hold a minCount-zero qualification', () => {
    const conflicts = detectConflicts({
      assignments: [
        assignment({
          assigneeIds: ['d1', 'x1'],
          requiredQualifications: [{ qualificationId: 'q_drive', minCount: 0 }],
        }),
      ],
      personnel: [driver, plain],
      absences: [],
      rules: DEFAULT_RULES,
      qualificationNames: names,
      timezone: TZ,
    });
    const missing = conflicts.filter((c) => c.code === 'QUALIFICATION_REQUIRED');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.personnelId).toBe('x1');
  });
});

describe('crew roles', () => {
  it('refuses a second person in a role that is already taken', () => {
    const conflicts = run([
      assignment({
        requiredHeadcount: 2,
        assigneeIds: ['p1', 'p2'],
        assigneeRoles: { p1: 'q_driver', p2: 'q_driver' },
      }),
    ]);
    const taken = conflicts.filter((conflict) => conflict.code === 'ROLE_TAKEN');
    expect(taken).toHaveLength(1);
    // Blamed on the second arrival, not on whoever already holds the seat.
    expect(taken[0]?.personnelId).toBe('p2');
    expect(taken[0]?.severity).toBe('blocking');
  });

  it('accepts several people in the plain seat', () => {
    const conflicts = run([
      assignment({
        requiredHeadcount: 2,
        assigneeIds: ['p1', 'p2'],
        assigneeRoles: { p1: null, p2: null },
      }),
    ]);
    expect(conflicts.filter((conflict) => conflict.code === 'ROLE_TAKEN')).toHaveLength(0);
  });

  it('refuses someone in a role whose qualification they lack', () => {
    const conflicts = run([assignment({ assigneeIds: ['p2'], assigneeRoles: { p2: 'q_driver' } })]);
    expect(conflicts.some((conflict) => conflict.code === 'ROLE_QUALIFICATION')).toBe(true);
  });

  it('says nothing when the person holds the role they fill', () => {
    const conflicts = run([assignment({ assigneeIds: ['p1'], assigneeRoles: { p1: 'q_driver' } })]);
    expect(conflicts.some((conflict) => conflict.code === 'ROLE_QUALIFICATION')).toBe(false);
  });
});

describe('an exclusive qualification', () => {
  const hamal: EnginePerson = { id: 'p3', displayName: 'תהילה', qualificationIds: ['q_hamal'] };

  const runWithHamal = (assignments: EngineAssignment[]) =>
    detectConflicts({
      assignments,
      personnel: [dan, noa, hamal],
      absences: [],
      rules: DEFAULT_RULES,
      exclusiveQualificationIds: ['q_hamal'],
      qualificationNames: { q_hamal: 'חמ״ל' },
      timezone: TZ,
    });

  it('keeps its holder off an assignment that does not ask for it', () => {
    const conflicts = runWithHamal([assignment({ assigneeIds: ['p3'] })]);
    const blocked = conflicts.filter((conflict) => conflict.code === 'EXCLUSIVE_QUALIFICATION');
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.personnelId).toBe('p3');
  });

  it('allows the assignment that requires it', () => {
    const conflicts = runWithHamal([
      assignment({
        assigneeIds: ['p3'],
        requiredQualifications: [{ qualificationId: 'q_hamal', minCount: 0 }],
      }),
    ]);
    expect(conflicts.some((conflict) => conflict.code === 'EXCLUSIVE_QUALIFICATION')).toBe(false);
  });

  it('leaves everyone else alone', () => {
    const conflicts = runWithHamal([assignment({ assigneeIds: ['p1'] })]);
    expect(conflicts.some((conflict) => conflict.code === 'EXCLUSIVE_QUALIFICATION')).toBe(false);
  });
});

describe('the hours before a soldier leaves', () => {
  // Departure at 18:00 with an eight-hour buffer: nothing may run past 10:00.
  const departure = {
    personnelId: 'p1',
    kind: 'home' as const,
    startAt: at('2026-08-21', '18:00'),
    endAt: at('2026-08-23', '18:00'),
  };

  const runWithDeparture = (assignments: EngineAssignment[]) =>
    detectConflicts({
      assignments,
      personnel: [dan, noa],
      absences: [departure],
      rules: DEFAULT_RULES,
      timezone: TZ,
    });

  it('blocks a shift that runs into the buffer', () => {
    const conflicts = runWithDeparture([
      assignment({
        startAt: at('2026-08-21', '08:00'),
        endAt: at('2026-08-21', '14:00'),
      }),
    ]);
    expect(conflicts.some((conflict) => conflict.code === 'PRE_DEPARTURE_REST')).toBe(true);
  });

  it('allows a shift that ends before the buffer opens', () => {
    const conflicts = runWithDeparture([
      assignment({
        startAt: at('2026-08-21', '04:00'),
        endAt: at('2026-08-21', '10:00'),
      }),
    ]);
    expect(conflicts.some((conflict) => conflict.code === 'PRE_DEPARTURE_REST')).toBe(false);
  });

  it('leaves a shift after the return alone', () => {
    const conflicts = runWithDeparture([
      assignment({
        startAt: at('2026-08-24', '08:00'),
        endAt: at('2026-08-24', '12:00'),
      }),
    ]);
    expect(conflicts.some((conflict) => conflict.code === 'PRE_DEPARTURE_REST')).toBe(false);
  });
});
