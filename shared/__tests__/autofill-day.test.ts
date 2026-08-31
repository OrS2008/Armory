import { describe, expect, it } from 'vitest';
import { buildAutofillProposal } from '../autofill';
import { DEFAULT_RULES } from '../conflicts';
import { planStandingShifts } from '../standing';

/**
 * A whole day of the company's real posts, auto-filled in one press.
 *
 * "שיבוץ אוטומטי" runs in the browser, on the phone of whoever is on duty, and
 * nothing on screen moves while it does. So how long it takes is a property of
 * the feature, not a detail: at nine seconds the button reads as broken, and
 * the end-to-end suite started timing out on it.
 *
 * The budget is deliberately loose — this runs on whatever machine CI gives it
 * — but it is far below the cost of asking the conflict engine about every post
 * once per candidate, which is the mistake it exists to catch.
 */
const BUDGET_MS = 5_000;

const posts = [
  {
    assignmentTypeId: 'officer',
    name: 'קצין מוצב',
    requiredHeadcount: 1,
    shiftHours: 24,
    shiftStartHour: 0,
  },
  {
    assignmentTypeId: 'mashkif',
    name: 'משקיף',
    requiredHeadcount: 4,
    shiftHours: 8,
    shiftStartHour: 6,
    shiftStartMinute: 30,
  },
  {
    assignmentTypeId: 'hamal',
    name: 'חמ״ל',
    requiredHeadcount: 1,
    shiftHours: 8,
    shiftStartHour: 6,
  },
  {
    assignmentTypeId: 'medic',
    name: 'חובש תורן',
    requiredHeadcount: 1,
    shiftHours: 24,
    shiftStartHour: 0,
  },
  { assignmentTypeId: 'siur', name: 'עיט', requiredHeadcount: 4, shiftHours: 8, shiftStartHour: 5 },
  {
    assignmentTypeId: 'carmel',
    name: 'כיתת כוננות א׳ כרמל',
    requiredHeadcount: 4,
    shiftHours: 24,
    shiftStartHour: 0,
  },
  { assignmentTypeId: 'shag', name: 'ש״ג', requiredHeadcount: 1, shiftHours: 4, shiftStartHour: 5 },
  {
    assignmentTypeId: 'bolem',
    name: 'בולם',
    requiredHeadcount: 1,
    shiftHours: 6,
    shiftStartHour: 6,
  },
  {
    assignmentTypeId: 'nahal',
    name: 'נחל שכם',
    requiredHeadcount: 2,
    shiftHours: 6,
    shiftStartHour: 5,
  },
];

/** עיט, משקיף and כיתת כוננות each want a commander and a driver among them. */
const crewed = new Set(['siur', 'carmel', 'mashkif']);

const day = () => {
  const assignments = planStandingShifts(posts, '2026-08-27', '2026-08-27').map((shift, index) => ({
    id: `a${index}`,
    assignmentTypeId: shift.assignmentTypeId,
    title: shift.assignmentTypeId,
    startAt: shift.startAt,
    endAt: shift.endAt,
    requiredHeadcount: shift.requiredHeadcount,
    requiredQualifications: crewed.has(shift.assignmentTypeId)
      ? [
          { qualificationId: 'q_drive', minCount: 1 },
          { qualificationId: 'q_cmd', minCount: 1 },
        ]
      : [],
    excludedQualificationIds: ['q_ops'],
    assigneeIds: [] as string[],
    publicationState: 'draft' as const,
  }));
  const personnel = Array.from({ length: 24 }, (_unused, index) => ({
    id: `p${index}`,
    displayName: `חייל ${index}`,
    qualificationIds:
      index < 6 ? ['q_drive'] : index < 12 ? ['q_cmd'] : index < 15 ? ['q_ops'] : [],
  }));
  return { assignments, personnel };
};

describe('auto-filling a whole day', () => {
  it('proposes a roster for every post without stalling the screen', () => {
    const { assignments, personnel } = day();
    expect(assignments).toHaveLength(26);

    const started = Date.now();
    const proposal = buildAutofillProposal({
      assignments,
      personnel,
      absences: [],
      rules: DEFAULT_RULES,
    });
    const elapsed = Date.now() - started;

    expect(proposal.proposed.length).toBeGreaterThan(0);
    // A company of 24 cannot cover 51 seat-shifts a day, and the proposal says
    // so in gaps rather than by quietly overworking somebody.
    expect(proposal.gaps.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
});
