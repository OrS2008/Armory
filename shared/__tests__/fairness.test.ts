import { describe, expect, it } from 'vitest';
import { DEFAULT_FAIRNESS_WEIGHTS, computeWorkload, restHoursBefore } from '../fairness';
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
