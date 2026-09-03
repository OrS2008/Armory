import { describe, expect, it } from 'vitest';
import { formatCountdown } from '../format';

describe('formatCountdown', () => {
  it('counts in minutes while the handover is under an hour away', () => {
    expect(formatCountdown(25 * 60_000)).toBe('25 דק׳');
  });

  it('rounds up, because fifty seconds away is a minute away and not none', () => {
    expect(formatCountdown(50_000)).toBe('1 דק׳');
  });

  it('switches to hours and minutes above the hour', () => {
    expect(formatCountdown(107 * 60_000)).toBe('1:47');
    expect(formatCountdown(60 * 60_000)).toBe('1:00');
  });

  it('never counts below zero for a handover already past', () => {
    expect(formatCountdown(-5000)).toBe('0 דק׳');
  });
});
