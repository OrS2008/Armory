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
    expect(proposal.gaps[0]?.reason).toBe('כל הסגל כבר משובץ למשימה הזו');
  });

  /*
   * The gap reason used to be one fixed sentence regardless of cause — "no
   * qualified, available people" whether the real story was nobody holds the
   * qualification, everyone is already spoken for, or a rest rule is what is
   * actually in the way. A reviewer reading "אי אפשר לשבץ" with no cause is the
   * exact complaint this fixes: the reason has to name the actual obstacle.
   */
  it('names the missing qualification when nobody on the roster holds it', () => {
    const proposal = run(
      [post('a1', 'חבישה', '08:00', '16:00', 1, [{ qualificationId: 'q_medic', minCount: 1 }])],
      { qualificationNames: { q_drive: 'נהג', q_cmd: 'מפקד', q_medic: 'חובש' } },
    );
    expect(proposal.gaps).toHaveLength(1);
    expect(proposal.gaps[0]?.reason).toBe('אף אחד מהסגל אינו מוסמך חובש');
  });

  it('names the specific rule blocking the closest candidate, not a generic refusal', () => {
    const one = [person('d1', 'א דן', ['q_drive'])];
    const proposal = buildAutofillProposal({
      assignments: [
        post('a', 'סיור בוקר', '06:00', '14:00', 1, [{ qualificationId: 'q_drive', minCount: 1 }]),
        post('b', 'סיור צהריים', '08:00', '16:00', 1, [
          { qualificationId: 'q_drive', minCount: 1 },
        ]),
      ],
      personnel: one,
      absences: [],
      rules: DEFAULT_RULES,
      qualificationNames: { q_drive: 'נהג' },
      timezone: TZ,
    });
    expect(proposal.gaps).toHaveLength(1);
    // The one driver in reach is blocked by a real rule — here, the two posts
    // back to back would run him past the continuous-duty limit — not a
    // one-size-fits-all "nobody available" sentence.
    expect(proposal.gaps[0]?.reason).toContain('שעות');
    expect(proposal.gaps[0]?.reason).not.toBe('אין אנשים זמינים ומוכשרים שאינם מפרים כלל חוסם');
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
  // The company's own shape: an eight-hour shift, then sixteen hours off.
  const eightHours = DEFAULT_RULES;

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

    // A day needs three crews, and two people are one crew. Sixteen hours of
    // rest is what makes that arithmetic rather than an opinion: whoever stands
    // 00:00–08:00 is not available again until the next morning, so the other
    // two shifts are reported as gaps instead of quietly handed back to them.
    expect(proposal.proposed).toHaveLength(2);
    expect(proposal.gaps.reduce((total, gap) => total + gap.missing, 0)).toBe(4);
    expect(proposal.gaps.map((gap) => gap.assignmentId).sort()).toEqual(['b', 'c']);
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

describe('auto-fill repair pass', () => {
  it('moves someone rather than leaving the only driver in the wrong seat', () => {
    // Two people, one of them the only driver. The earlier post needs anybody;
    // the later one needs a driver and overlaps it, so a greedy pass that hands
    // the driver to the earlier post leaves the later one empty.
    const two = [person('d1', 'א דן', ['q_drive']), person('n1', 'ב נועה')];

    const proposal = buildAutofillProposal({
      assignments: [
        post('early', 'מטבח', '06:00', '14:00', 1),
        post('patrol', 'סיור', '08:00', '16:00', 1, [{ qualificationId: 'q_drive', minCount: 1 }]),
      ],
      personnel: two,
      absences: [],
      rules: DEFAULT_RULES,
      qualificationNames: { q_drive: 'נהג' },
      timezone: TZ,
    });

    expect(proposal.gaps).toEqual([]);
    expect(proposal.swaps).toBe(1);
    expect(proposal.proposed).toHaveLength(2);

    const patrol = proposal.proposed.find((item) => item.assignmentId === 'patrol');
    const early = proposal.proposed.find((item) => item.assignmentId === 'early');
    expect(patrol?.personnelId).toBe('d1');
    expect(early?.personnelId).toBe('n1');
  });

  it('leaves the schedule alone when a swap would only move the hole', () => {
    // One driver, two overlapping posts that both need one. No arrangement
    // fills both, and the proposal must not pretend otherwise.
    const one = [person('d1', 'א דן', ['q_drive'])];

    const proposal = buildAutofillProposal({
      assignments: [
        post('a', 'סיור בוקר', '06:00', '14:00', 1, [{ qualificationId: 'q_drive', minCount: 1 }]),
        post('b', 'סיור צהריים', '08:00', '16:00', 1, [
          { qualificationId: 'q_drive', minCount: 1 },
        ]),
      ],
      personnel: one,
      absences: [],
      rules: DEFAULT_RULES,
      qualificationNames: { q_drive: 'נהג' },
      timezone: TZ,
    });

    expect(proposal.swaps).toBe(0);
    expect(proposal.proposed).toHaveLength(1);
    expect(proposal.gaps).toHaveLength(1);
    expect(proposal.gaps[0]?.missing).toBe(1);
  });

  it('gives a crew the seats it can fill even when one seat cannot be filled', () => {
    // No commander exists. The patrol should still get its driver and its
    // לוחם rather than being abandoned at the first unfillable seat.
    const proposal = run([
      post('p', 'סיור', '08:00', '16:00', 3, [
        { qualificationId: 'q_cmd', minCount: 1 },
        { qualificationId: 'q_drive', minCount: 1 },
      ]),
    ]);

    expect(proposal.proposed.length).toBeGreaterThanOrEqual(3);
  });
});

/*
 * The marks the company actually uses.
 *
 * Auto-fill is the place these have to hold: a scheduler reading a proposal
 * cannot be expected to re-check every name against a rule the machine already
 * knows. If a proposal can name somebody the post excludes, the rule is
 * decoration.
 */
describe('who auto-fill will not propose', () => {
  const withMarks = [
    ...roster,
    person('p7', 'רן', ['q_ops']),
    person('p8', 'טל', ['q_ops', 'q_drive']),
    person('p9', 'משה', ['q_maflag']),
  ];

  const marked = (assignments: EngineAssignment[], extra = {}) =>
    buildAutofillProposal({
      assignments,
      personnel: withMarks,
      absences: [],
      rules: DEFAULT_RULES,
      qualificationNames: { q_drive: 'נהג', q_cmd: 'מפקד', q_ops: 'מבצעים', q_maflag: 'מפלג' },
      blockingQualificationIds: ['q_maflag'],
      timezone: TZ,
      ...extra,
    });

  it('never fills a seat with somebody the post excludes', () => {
    const proposal = marked([
      {
        ...post('siur', 'סיור', '08:00', '16:00', 8),
        excludedQualificationIds: ['q_ops'],
      },
    ]);
    const names = proposal.proposed.map((item) => item.personnelId);
    expect(names).not.toContain('p7');
    expect(names).not.toContain('p8');
    // …and it did fill the seats it could, rather than giving up on the post.
    expect(proposal.proposed.length).toBe(6);
  });

  it('leaves a named seat open rather than filling it from the excluded list', () => {
    // The only other driver is already out on the morning patrol, so the
    // excluded driver is the sole remaining candidate for the seat.
    const proposal = marked([
      post(
        'a',
        'סיור בוקר',
        '08:00',
        '16:00',
        2,
        [{ qualificationId: 'q_drive', minCount: 1 }],
        ['p1', 'p2'],
      ),
      {
        ...post('b', 'סיור ערב', '16:00', '23:00', 1, [
          { qualificationId: 'q_drive', minCount: 1 },
        ]),
        excludedQualificationIds: ['q_ops'],
      },
    ]);
    expect(proposal.proposed.map((item) => item.personnelId)).not.toContain('p8');
    expect(proposal.gaps.some((gap) => gap.assignmentId === 'b')).toBe(true);

    // The control: without the exclusion that seat is filled, and filled by
    // exactly the person the exclusion keeps out. Otherwise the gap above
    // would prove nothing.
    const allowed = marked([
      post(
        'a',
        'סיור בוקר',
        '08:00',
        '16:00',
        2,
        [{ qualificationId: 'q_drive', minCount: 1 }],
        ['p1', 'p2'],
      ),
      post('b', 'סיור ערב', '16:00', '23:00', 1, [{ qualificationId: 'q_drive', minCount: 1 }]),
    ]);
    expect(allowed.proposed.map((item) => item.personnelId)).toContain('p8');
    expect(allowed.gaps).toHaveLength(0);
  });

  it('never proposes somebody marked מפלג, whatever the post', () => {
    const proposal = marked([post('a', 'ש״ג', '08:00', '16:00', 9)]);
    expect(proposal.proposed.map((item) => item.personnelId)).not.toContain('p9');
  });
});
