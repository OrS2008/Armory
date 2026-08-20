import { describe, expect, it } from 'vitest';
import { wallClockToUtc } from '@shared/time';
import { blockGeometry, dayWindow, hourTicks } from '../timeline';

const TZ = 'Asia/Jerusalem';
const at = (day: string, time: string) => wallClockToUtc(day, time, TZ);

describe('timeline geometry', () => {
  const window = dayWindow('2026-08-21', TZ);

  it('places a midday block in the middle of the row', () => {
    const geometry = blockGeometry(window, at('2026-08-21', '12:00'), at('2026-08-21', '18:00'));
    expect(geometry?.offsetPercent).toBeCloseTo(50, 5);
    expect(geometry?.widthPercent).toBeCloseTo(25, 5);
  });

  it('clips an overnight block at midnight and marks it', () => {
    const geometry = blockGeometry(window, at('2026-08-21', '22:00'), at('2026-08-22', '06:00'));
    expect(geometry?.offsetPercent).toBeCloseTo(91.666, 2);
    expect(geometry?.clippedEnd).toBe(true);
  });

  it('returns nothing for an assignment on another day', () => {
    expect(blockGeometry(window, at('2026-08-23', '08:00'), at('2026-08-23', '12:00'))).toBeNull();
  });

  it('produces one extra tick on the 25-hour DST day', () => {
    const dstWindow = dayWindow('2026-10-25', TZ);
    expect(hourTicks(dstWindow, 1)).toHaveLength(25);
    expect(hourTicks(window, 1)).toHaveLength(24);
  });
});
