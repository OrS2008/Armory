import { describe, expect, it } from 'vitest';
import { daysInRange, planStandingShifts, shiftKey } from '../standing';
import { formatTime } from '../format';
import { HOUR, dayKey } from '../time';

const TZ = 'Asia/Jerusalem';
const shag = {
  assignmentTypeId: 'atp_shag',
  name: 'ש״ג',
  requiredHeadcount: 1,
  shiftHours: 8,
  shiftStartHour: 0,
};
const officer = {
  assignmentTypeId: 'atp_officer',
  name: 'קצין מוצב',
  requiredHeadcount: 1,
  shiftHours: 24,
  shiftStartHour: 0,
};

describe('the period', () => {
  it('includes both ends', () => {
    expect(daysInRange('2026-08-27', '2026-08-29')).toEqual([
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
    ]);
  });

  it('is empty when it runs backwards', () => {
    expect(daysInRange('2026-08-29', '2026-08-27')).toEqual([]);
  });
});

describe('laying out a standing post', () => {
  it('covers every day without a gap or an overlap', () => {
    const shifts = planStandingShifts([shag], '2026-08-27', '2026-08-29', TZ);
    expect(shifts).toHaveLength(9);
    for (let index = 1; index < shifts.length; index += 1) {
      expect(shifts[index]!.startAt).toBe(shifts[index - 1]!.endAt);
    }
  });

  it('gives a 24-hour post one shift a day, not three', () => {
    const shifts = planStandingShifts([officer], '2026-08-27', '2026-08-28', TZ);
    expect(shifts).toHaveLength(2);
    expect(shifts[0]!.endAt - shifts[0]!.startAt).toBe(24 * HOUR);
  });

  it('carries the post’s crew size into every shift', () => {
    const [first] = planStandingShifts(
      [{ ...shag, requiredHeadcount: 4 }],
      '2026-08-27',
      '2026-08-27',
      TZ,
    );
    expect(first?.requiredHeadcount).toBe(4);
  });

  it('starts the day where the post says it hands over', () => {
    const shifts = planStandingShifts(
      [{ ...shag, shiftStartHour: 6 }],
      '2026-08-27',
      '2026-08-27',
      TZ,
    );
    // 06:00, 14:00, 22:00 — the last of which finishes the following morning.
    expect(shifts.map((shift) => dayKey(shift.startAt, TZ))).toEqual([
      '2026-08-27',
      '2026-08-27',
      '2026-08-27',
    ]);
    // The last handover of the day runs past midnight, which is the point:
    // 22:00–06:00 is a real shift, and the day it starts is the day it belongs to.
    expect(dayKey(shifts[2]!.endAt, TZ)).toBe('2026-08-28');
  });

  it('refuses a shift length that does not tile a day', () => {
    expect(
      planStandingShifts([{ ...shag, shiftHours: 5 }], '2026-08-27', '2026-08-27', TZ),
    ).toEqual([]);
  });

  /*
   * Re-running the layout must be harmless — that is the whole reason the
   * period can be stated twice without producing two rosters.
   */
  it('produces the same keys every time it is run', () => {
    const once = planStandingShifts([shag, officer], '2026-08-27', '2026-09-02', TZ).map(shiftKey);
    const twice = planStandingShifts([shag, officer], '2026-08-27', '2026-09-02', TZ).map(shiftKey);
    expect(twice).toEqual(once);
    expect(new Set(once).size).toBe(once.length);
  });

  it('stamps a briefing note onto each shift when the post asks for one', () => {
    const shifts = planStandingShifts(
      [{ ...shag, name: 'עיט', briefingMinutesBefore: 20 }],
      '2026-08-27',
      '2026-08-27',
      TZ,
    );
    // The first shift starts at 00:00 wall clock; the briefing is 20 minutes
    // earlier, and the post is handed over three times a day, so the note has
    // to say which of the three a person is being briefed for.
    expect(shifts[0]?.notes).toBe('תדריך עלייה לעיט לילה בשעה 23:40');
    expect(shifts[1]?.notes).toBe('תדריך עלייה לעיט בוקר בשעה 07:40');
  });

  it('does not name the turn on a post that has only one a day', () => {
    const [first] = planStandingShifts(
      [{ ...officer, name: 'קצין מוצב', briefingMinutesBefore: 30 }],
      '2026-08-27',
      '2026-08-27',
      TZ,
    );
    expect(first?.notes).toBe('תדריך עלייה לקצין מוצב בשעה 23:30');
  });

  it('hands over on the half hour when the post does', () => {
    const shifts = planStandingShifts(
      [{ ...shag, name: 'משקיף', shiftStartHour: 6, shiftStartMinute: 30 }],
      '2026-08-27',
      '2026-08-27',
      TZ,
    );
    expect(shifts.map((shift) => formatTime(shift.startAt, TZ))).toEqual([
      '06:30',
      '14:30',
      '22:30',
    ]);
    // The last turn still finishes exactly where the next day's first begins.
    expect(formatTime(shifts[2]!.endAt, TZ)).toBe('06:30');
  });

  it('leaves the note blank for a post with no briefing', () => {
    const [first] = planStandingShifts([shag], '2026-08-27', '2026-08-27', TZ);
    expect(first?.notes).toBeNull();
  });

  it('lays out eleven weeks of the company’s posts in one pass', () => {
    const posts = [
      shag,
      {
        assignmentTypeId: 'atp_siur',
        name: 'עיט',
        requiredHeadcount: 4,
        shiftHours: 8,
        shiftStartHour: 0,
      },
      {
        assignmentTypeId: 'atp_nahal',
        name: 'נחל שכם',
        requiredHeadcount: 2,
        shiftHours: 8,
        shiftStartHour: 0,
      },
      {
        assignmentTypeId: 'atp_carmel',
        name: 'כיתת כוננות א׳ כרמל',
        requiredHeadcount: 4,
        shiftHours: 8,
        shiftStartHour: 0,
      },
    ];
    const shifts = planStandingShifts(posts, '2026-08-27', '2026-11-11', TZ);
    expect(daysInRange('2026-08-27', '2026-11-11')).toHaveLength(77);
    expect(shifts).toHaveLength(77 * 4 * 3);
  });
});
