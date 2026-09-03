import { describe, expect, it } from 'vitest';
import { buildCalendar, escapeText, foldLine, icsStamp } from '../ics';

describe('icsStamp', () => {
  it('writes UTC, which is how the timestamp is stored', () => {
    expect(icsStamp(Date.UTC(2026, 8, 3, 5, 0, 0))).toBe('20260903T050000Z');
  });
});

describe('escapeText', () => {
  it('escapes the characters that separate one value from the next', () => {
    expect(escapeText('עיט, בוקר; נהג\\תורן')).toBe('עיט\\, בוקר\\; נהג\\\\תורן');
  });

  it('turns a newline into its escape rather than ending the line', () => {
    expect(escapeText('שורה\nשנייה')).toBe('שורה\\nשנייה');
  });
});

describe('foldLine', () => {
  it('leaves a short line alone', () => {
    expect(foldLine('SUMMARY:עיט')).toBe('SUMMARY:עיט');
  });

  it('folds by octet, because Hebrew is two octets a letter', () => {
    // 60 Hebrew letters is 120 octets: short by character count, long by the
    // measure the specification actually uses.
    const line = `SUMMARY:${'א'.repeat(60)}`;
    const folded = foldLine(line);
    expect(folded).toContain('\r\n ');
    for (const part of folded.split('\r\n')) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
  });

  it('never splits a letter in half', () => {
    const folded = foldLine(`SUMMARY:${'ש'.repeat(200)}`);
    const rejoined = folded
      .split('\r\n')
      .map((part, index) => (index === 0 ? part : part.slice(1)));
    expect(rejoined.join('')).toBe(`SUMMARY:${'ש'.repeat(200)}`);
    expect(folded).not.toContain('�');
  });
});

describe('buildCalendar', () => {
  const calendar = buildCalendar({
    name: 'שבצ״ק — דנה לוי',
    timezone: 'Asia/Jerusalem',
    stamp: Date.UTC(2026, 8, 3, 6, 0, 0),
    alarmMinutesBefore: 60,
    events: [
      {
        uid: 'asg_1@shabatzak',
        startAt: Date.UTC(2026, 8, 3, 5, 0, 0),
        endAt: Date.UTC(2026, 8, 3, 13, 0, 0),
        summary: 'עיט — נהג',
        description: 'תדריך בשעה 04:30',
        location: 'שער הדוקטור',
      },
    ],
  });

  it('opens and closes the calendar, with CRLF throughout', () => {
    expect(calendar.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(calendar.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(calendar.split('\n').every((line) => line === '' || line.endsWith('\r'))).toBe(true);
  });

  it('carries the shift as one event, in UTC', () => {
    expect(calendar).toContain('DTSTART:20260903T050000Z');
    expect(calendar).toContain('DTEND:20260903T130000Z');
    expect(calendar).toContain('UID:asg_1@shabatzak');
  });

  it('rings before the shift rather than at it', () => {
    expect(calendar).toContain('BEGIN:VALARM');
    expect(calendar).toContain('TRIGGER:-PT60M');
  });

  it('leaves the alarm out when nobody asked for one', () => {
    const quiet = buildCalendar({
      name: 'שבצ״ק',
      timezone: 'Asia/Jerusalem',
      stamp: 0,
      events: [{ uid: 'a', startAt: 0, endAt: 1, summary: 'ש״ג' }],
    });
    expect(quiet).not.toContain('VALARM');
  });

  it('tells a subscriber how often to come back', () => {
    expect(calendar).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT60M');
  });
});
