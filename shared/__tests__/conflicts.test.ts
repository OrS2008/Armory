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

/*
 * Marks that disqualify.
 *
 * A post can already say what it needs; these say who it will not take. The two
 * are not the same statement and neither can be written as the other: "אי אפשר
 * לשבץ חייל מהמבצעים" is a fact about מבצעים, not a qualification anybody else
 * holds.
 */
describe('marks that disqualify', () => {
  const ops: EnginePerson = { id: 'p3', displayName: 'רן', qualificationIds: ['q_ops'] };
  const maflag: EnginePerson = { id: 'p4', displayName: 'משה', qualificationIds: ['q_maflag'] };

  const withPeople = (assignments: EngineAssignment[], extra = {}) =>
    detectConflicts({
      assignments,
      personnel: [dan, noa, ops, maflag],
      absences: [],
      rules: DEFAULT_RULES,
      qualificationNames: { q_ops: 'מבצעים', q_maflag: 'מפלג' },
      timezone: TZ,
      ...extra,
    });

  it('blocks somebody the post excludes', () => {
    const conflicts = withPeople([
      assignment({ assigneeIds: ['p3'], excludedQualificationIds: ['q_ops'] }),
    ]);
    const blocked = conflicts.find((conflict) => conflict.code === 'EXCLUDED_QUALIFICATION');
    expect(blocked?.severity).toBe('blocking');
    expect(blocked?.personnelId).toBe('p3');
    expect(blocked?.message).toContain('מבצעים');
    // Overridable: a commander can still say yes, and it is recorded.
    expect(blocked?.overridable).toBe(true);
  });

  it('leaves the same post alone for somebody who does not hold the mark', () => {
    const conflicts = withPeople([
      assignment({ assigneeIds: ['p2'], excludedQualificationIds: ['q_ops'] }),
    ]);
    expect(conflicts.some((conflict) => conflict.code === 'EXCLUDED_QUALIFICATION')).toBe(false);
  });

  it('says nothing when the post excludes nobody', () => {
    const conflicts = withPeople([assignment({ assigneeIds: ['p3'] })]);
    expect(conflicts.some((conflict) => conflict.code === 'EXCLUDED_QUALIFICATION')).toBe(false);
  });

  it('takes מפלג out of the rotation on every post, not one', () => {
    const conflicts = withPeople([assignment({ assigneeIds: ['p4'] })], {
      blockingQualificationIds: ['q_maflag'],
    });
    const blocked = conflicts.find((conflict) => conflict.code === 'NOT_SCHEDULABLE');
    expect(blocked?.severity).toBe('blocking');
    expect(blocked?.message).toContain('מפלג');
  });

  it('does not invent a NOT_SCHEDULABLE for anybody else', () => {
    const conflicts = withPeople([assignment({ assigneeIds: ['p1'] })], {
      blockingQualificationIds: ['q_maflag'],
    });
    expect(conflicts.some((conflict) => conflict.code === 'NOT_SCHEDULABLE')).toBe(false);
  });

  it('holds its peace once a commander has overridden it', () => {
    const conflicts = withPeople([
      assignment({
        assigneeIds: ['p3'],
        excludedQualificationIds: ['q_ops'],
        overriddenBy: ['p3'],
      }),
    ]);
    expect(conflicts.some((conflict) => conflict.code === 'EXCLUDED_QUALIFICATION')).toBe(false);
  });
});

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
  // Eight hours on, sixteen off. Blocking rather than advisory — a warning is a
  // note nothing acts on — but overridable, so a commander can still say yes.
  it('blocks an assignment that leaves less rest than the minimum', () => {
    const conflicts = run([
      assignment(),
      assignment({
        id: 'a2',
        startAt: at('2026-08-21', '14:00'),
        endAt: at('2026-08-21', '18:00'),
      }),
    ]);
    const conflict = conflicts.find((item) => item.code === 'MIN_REST');
    expect(conflict?.severity).toBe('blocking');
    expect(conflict?.overridable).toBe(true);
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

  // The sheet goes out as a PDF in the group chat, so there is nothing to
  // publish and nothing to be behind on. The rule is kept for units that do run
  // a publication step, but it is off unless somebody turns it on.
  it('says nothing about publication by default', () => {
    const conflicts = run([assignment({ publicationState: 'draft' })]);
    expect(conflicts.some((item) => item.code === 'UNPUBLISHED_CHANGES')).toBe(false);
  });

  it('flags unpublished changes when a unit turns the rule back on', () => {
    const conflicts = run(
      [assignment({ publicationState: 'draft' })],
      DEFAULT_RULES.map((rule) =>
        rule.code === 'UNPUBLISHED_CHANGES' ? { ...rule, enabled: true } : rule,
      ),
    );
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

describe('a post scheduled twice for the same hours', () => {
  const shift = (id: string, typeId: string) =>
    assignment({ id, assignmentTypeId: typeId, title: 'ש״ג' });

  it('names the second copy, and only the second', () => {
    const conflicts = run([shift('a1', 'shag'), shift('a2', 'shag')]).filter(
      (conflict) => conflict.code === 'DUPLICATE_ASSIGNMENT',
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.assignmentId).toBe('a2');
  });

  it('leaves two shifts of the same post at different hours alone', () => {
    const later = assignment({
      id: 'a2',
      assignmentTypeId: 'shag',
      startAt: at('2026-08-21', '12:00'),
      endAt: at('2026-08-21', '16:00'),
      assigneeIds: ['p2'],
    });
    const conflicts = run([shift('a1', 'shag'), later]);
    expect(conflicts.some((conflict) => conflict.code === 'DUPLICATE_ASSIGNMENT')).toBe(false);
  });

  it('leaves two different posts at the same hours alone', () => {
    const conflicts = run([shift('a1', 'shag'), shift('a2', 'siur')]);
    expect(conflicts.some((conflict) => conflict.code === 'DUPLICATE_ASSIGNMENT')).toBe(false);
  });
});

describe('continuous duty across back-to-back shifts', () => {
  const eightHourLimit = DEFAULT_RULES.map((item) =>
    item.code === 'MAX_CONTINUOUS' ? { ...item, config: { minutes: 480 } } : item,
  );

  const shift = (id: string, from: string, to: string) =>
    assignment({ id, startAt: at('2026-08-21', from), endAt: at('2026-08-21', to) });

  it('adds up two shifts that touch', () => {
    // Off ש״ג at 14:00 and straight onto סיור: sixteen hours, not two eights.
    const conflicts = run(
      [shift('a1', '06:00', '14:00'), shift('a2', '14:00', '22:00')],
      eightHourLimit,
    ).filter((conflict) => conflict.code === 'MAX_CONTINUOUS');

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.message).toContain('16');
    // Reported against the shift that ends the run — the one to hand over.
    expect(conflicts[0]?.assignmentId).toBe('a2');
  });

  it('leaves a touching pair to MAX_CONTINUOUS rather than reporting it twice', () => {
    // Off at 14:00 and straight back on is one run, not a rest of zero. Both
    // rules used to fire, saying different things about the same fact.
    const conflicts = run(
      [shift('a1', '06:00', '14:00'), shift('a2', '14:00', '22:00')],
      eightHourLimit,
    );

    expect(conflicts.filter((item) => item.code === 'MIN_REST')).toHaveLength(0);
    expect(conflicts.filter((item) => item.code === 'MAX_CONTINUOUS')).toHaveLength(1);
  });

  it('still reports a rest that is short but real', () => {
    const conflicts = run(
      [shift('a1', '06:00', '14:00'), shift('a2', '15:00', '22:00')],
      eightHourLimit,
    ).filter((item) => item.code === 'MIN_REST');

    expect(conflicts).toHaveLength(1);
  });

  it('leaves a single shift at the limit alone', () => {
    const conflicts = run([shift('a1', '06:00', '14:00')], eightHourLimit);
    expect(conflicts.some((conflict) => conflict.code === 'MAX_CONTINUOUS')).toBe(false);
  });

  it('treats a gap between shifts as the end of the run', () => {
    const conflicts = run(
      [shift('a1', '06:00', '14:00'), shift('a2', '16:00', '23:00')],
      eightHourLimit,
    );
    expect(conflicts.some((conflict) => conflict.code === 'MAX_CONTINUOUS')).toBe(false);
  });

  /*
   * A post that hands over once a day is saying what one turn is. The rule
   * exists to catch somebody stacking turns, and could not tell the two apart
   * until a post could declare its own length — which made auto-fill refuse
   * every candidate for a standing post and propose nobody at all.
   */
  it('lets a post stand the turn it says it stands', () => {
    const turn = assignment({
      id: 'a1',
      startAt: at('2026-08-21', '05:00'),
      endAt: at('2026-08-22', '05:00'),
      maxContinuousMinutes: 1440,
    });

    expect(run([turn], eightHourLimit).some((item) => item.code === 'MAX_CONTINUOUS')).toBe(false);
  });

  it('still catches two of those turns back to back', () => {
    const turn = (id: string, from: string, to: string) =>
      assignment({
        id,
        startAt: at('2026-08-21', from),
        endAt: at('2026-08-22', to),
        maxContinuousMinutes: 1440,
      });
    // The allowance is one turn, not a licence for the post.
    const conflicts = run(
      [
        assignment({
          id: 'a1',
          startAt: at('2026-08-20', '05:00'),
          endAt: at('2026-08-21', '05:00'),
          maxContinuousMinutes: 1440,
        }),
        turn('a2', '05:00', '05:00'),
      ],
      eightHourLimit,
    ).filter((item) => item.code === 'MAX_CONTINUOUS');

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.message).toContain('48');
  });

  it('lets a crew hold a post for the tour the post declares', () => {
    // חפ״ק: seven touching twenty-four-hour turns, one crew, handed over once a
    // week. Before the post could state its tour this was a 168-hour run
    // refused on every turn after the first, plus a MIN_REST on each of them —
    // the roster the unit actually stands, reported as fourteen violations.
    const week = Array.from({ length: 7 }, (_, day) =>
      assignment({
        id: `a${day}`,
        startAt: at(`2026-09-0${3 + day}`, '05:00'),
        endAt: at(`2026-09-0${4 + day}`, '05:00'),
        maxContinuousMinutes: 7 * 24 * 60,
      }),
    );

    const conflicts = run(week, eightHourLimit).filter(
      (item) => item.code === 'MIN_REST' || item.code === 'MAX_CONTINUOUS',
    );

    expect(conflicts).toHaveLength(0);
  });

  it('still refuses an eighth day on a seven-day tour', () => {
    // The tour is an allowance, not an exemption: one day past what the post
    // says it stands is still a run too long, and the crew that should have
    // handed over is still told so.
    const eight = Array.from({ length: 8 }, (_, day) =>
      assignment({
        id: `a${day}`,
        startAt: at(`2026-09-${String(3 + day).padStart(2, '0')}`, '05:00'),
        endAt: at(`2026-09-${String(4 + day).padStart(2, '0')}`, '05:00'),
        maxContinuousMinutes: 7 * 24 * 60,
      }),
    );

    const conflicts = run(eight, eightHourLimit).filter((item) => item.code === 'MAX_CONTINUOUS');

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.message).toContain('192');
  });

  it('reports one conflict for a run, not one per shift', () => {
    const conflicts = run(
      [shift('a1', '00:00', '06:00'), shift('a2', '06:00', '12:00'), shift('a3', '12:00', '18:00')],
      eightHourLimit,
    ).filter((conflict) => conflict.code === 'MAX_CONTINUOUS');

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.message).toContain('18');
  });
});
