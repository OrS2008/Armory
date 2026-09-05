import { describe, expect, it } from 'vitest';
import type { EngineCrew } from '../conflicts';
import { crewOnDuty, crewOnDutyAt } from '../rotation';
import { wallClockToUtc } from '../time';

const alef: EngineCrew = { id: 'a', name: 'סבב א׳', position: 1, memberIds: ['p1', 'p2'] };
const bet: EngineCrew = { id: 'b', name: 'סבב ב׳', position: 2, memberIds: ['p3', 'p4'] };
const crews = [alef, bet];
const weekly = { anchorDay: '2026-09-03', periodDays: 7 };

const on = (day: string) => crewOnDuty(crews, weekly, day)?.name;

describe('whose week it is', () => {
  it('gives the first crew the week the rotation starts', () => {
    for (const day of ['2026-09-03', '2026-09-05', '2026-09-09']) {
      expect(on(day)).toBe('סבב א׳');
    }
  });

  it('hands over on the eighth day, not the seventh', () => {
    // Seven days is a turn, so the last day of סבב א׳ is the 9th and ב׳ takes
    // the 10th. Off by one here is a crew turning up a day early all period.
    expect(on('2026-09-09')).toBe('סבב א׳');
    expect(on('2026-09-10')).toBe('סבב ב׳');
    expect(on('2026-09-16')).toBe('סבב ב׳');
    expect(on('2026-09-17')).toBe('סבב א׳');
  });

  it('keeps alternating months later', () => {
    // 2026-11-11 is 69 days on: 69/7 = turn 9, which is odd, so סבב ב׳.
    expect(on('2026-11-11')).toBe('סבב ב׳');
  });

  it('runs backwards evenly before the anchor', () => {
    // The day before the anchor is the previous crew's last day. Truncating
    // toward zero instead of flooring would answer סבב א׳ here and make that
    // one turn fourteen days long.
    expect(on('2026-09-02')).toBe('סבב ב׳');
    expect(on('2026-08-27')).toBe('סבב ב׳');
    expect(on('2026-08-26')).toBe('סבב א׳');
  });

  it('takes crews in rotation order, not the order they were handed over', () => {
    expect(crewOnDuty([bet, alef], weekly, '2026-09-03')?.name).toBe('סבב א׳');
  });

  it('survives the clocks going back', () => {
    // Israel leaves daylight saving on 2026-10-25. A rotation counted in
    // milliseconds drifts by an hour here and hands over on the wrong day.
    expect(on('2026-10-24')).toBe('סבב ב׳');
    expect(on('2026-10-25')).toBe('סבב ב׳');
    expect(on('2026-10-26')).toBe('סבב ב׳');
    expect(on('2026-10-29')).toBe('סבב א׳');
  });

  it('answers for a shift by the day it starts', () => {
    // The turn runs 05:00 to 05:00, so the shift that begins on ב׳'s first
    // morning is ב׳'s — even though most of the previous night was א׳'s.
    const starts = wallClockToUtc('2026-09-10', '05:00', 'Asia/Jerusalem');
    expect(crewOnDutyAt(crews, weekly, starts)?.name).toBe('סבב ב׳');
  });

  it('has no answer without crews, or without a sane period', () => {
    expect(crewOnDuty([], weekly, '2026-09-03')).toBeNull();
    expect(crewOnDuty(crews, { anchorDay: '2026-09-03', periodDays: 0 }, '2026-09-03')).toBeNull();
    expect(crewOnDuty(crews, { anchorDay: 'לא תאריך', periodDays: 7 }, '2026-09-03')).toBeNull();
  });

  it('rotates three crews as readily as two', () => {
    const gimel: EngineCrew = { id: 'c', name: 'סבב ג׳', position: 3, memberIds: ['p5'] };
    const three = [alef, bet, gimel];
    expect(crewOnDuty(three, weekly, '2026-09-03')?.name).toBe('סבב א׳');
    expect(crewOnDuty(three, weekly, '2026-09-10')?.name).toBe('סבב ב׳');
    expect(crewOnDuty(three, weekly, '2026-09-17')?.name).toBe('סבב ג׳');
    expect(crewOnDuty(three, weekly, '2026-09-24')?.name).toBe('סבב א׳');
  });
});
