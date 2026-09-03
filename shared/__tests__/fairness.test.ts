import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FAIRNESS_WEIGHTS,
  computeWorkload,
  restHoursBefore,
  summarizeBalance,
} from '../fairness';
import { wallClockToUtc } from '../time';

const TZ = 'Asia/Jerusalem';
const at = (day: string, time: string) => wallClockToUtc(day, time, TZ);

const assignments = [
  {
    id: 'day',
    startAt: at('2026-08-17', '08:00'),
    endAt: at('2026-08-17', '16:00'),
    assigneeIds: ['p1'],
  },
  {
    id: 'night',
    startAt: at('2026-08-18', '22:00'),
    endAt: at('2026-08-19', '06:00'),
    assigneeIds: ['p1'],
  },
  {
    id: 'weekend',
    startAt: at('2026-08-21', '08:00'),
    endAt: at('2026-08-21', '14:00'),
    assigneeIds: ['p1'],
  },
  {
    id: 'other-person',
    startAt: at('2026-08-17', '08:00'),
    endAt: at('2026-08-17', '20:00'),
    assigneeIds: ['p2'],
  },
];

describe('workload', () => {
  it('separates night and weekend hours from the total', () => {
    const workload = computeWorkload('p1', assignments, { timezone: TZ });
    expect(workload.totalHours).toBe(22);
    expect(workload.nightHours).toBe(8);
    expect(workload.weekendHours).toBe(6);
    expect(workload.assignmentCount).toBe(3);
  });

  it('ignores assignments belonging to other people', () => {
    const workload = computeWorkload('p2', assignments, { timezone: TZ });
    expect(workload.totalHours).toBe(12);
  });

  it('clips hours to the requested window', () => {
    const workload = computeWorkload('p1', assignments, {
      windowStart: at('2026-08-19', '00:00'),
      windowEnd: at('2026-08-22', '00:00'),
      timezone: TZ,
    });
    expect(workload.totalHours).toBe(12);
  });

  it('weights night and weekend hours more heavily in the score', () => {
    const light = computeWorkload('p1', [assignments[0]!], { timezone: TZ });
    const nightOnly = computeWorkload('p1', [assignments[1]!], { timezone: TZ });
    expect(nightOnly.score).toBeGreaterThan(light.score);
    expect(DEFAULT_FAIRNESS_WEIGHTS.nightHours).toBeGreaterThan(
      DEFAULT_FAIRNESS_WEIGHTS.totalHours,
    );
  });

  it('reports rest before a proposed start, or null with no history', () => {
    const workload = computeWorkload('p1', assignments, { timezone: TZ });
    expect(restHoursBefore(workload, at('2026-08-21', '20:00'))).toBe(6);
    expect(restHoursBefore(computeWorkload('nobody', assignments), 0)).toBeNull();
  });
});

describe('summarizeBalance', () => {
  const rows = (...values: number[]) =>
    values.map((value, index) => ({ personnelId: `p${index}`, value }));

  it('has nothing to say about nobody', () => {
    const balance = summarizeBalance([]);
    expect(balance.median).toBe(0);
    expect(balance.topFifthShare).toBeNull();
    expect(balance.heaviest).toBeNull();
  });

  it('measures against the median rather than the mean', () => {
    /*
     * One person on a fortnight of nights. The mean here is 48; measuring
     * against it would report all four of the others as under-loaded, when the
     * fact worth reporting is the one person carrying the company.
     */
    const balance = summarizeBalance(rows(40, 40, 40, 40, 80));
    expect(balance.median).toBe(40);
    expect(balance.deviation.get('p4')).toBe(40);
    expect(balance.deviation.get('p0')).toBe(0);
  });

  it('takes the middle of an even count from the two either side of it', () => {
    expect(summarizeBalance(rows(10, 20, 30, 40)).median).toBe(25);
  });

  it('reports the widest gap between two people', () => {
    expect(summarizeBalance(rows(12, 40, 31)).spread).toBe(28);
  });

  it('says a fifth of the people hold a fifth of the load when it is even', () => {
    expect(summarizeBalance(rows(10, 10, 10, 10, 10)).topFifthShare).toBe(0.2);
  });

  it('says so when the roster leans on a few', () => {
    const balance = summarizeBalance(rows(0, 0, 0, 0, 100));
    expect(balance.topFifthShare).toBe(1);
    expect(balance.heaviest).toBe('p4');
    expect(balance.lightest).toBe('p0');
  });
});
