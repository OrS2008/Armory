/**
 * iCalendar output — enough of RFC 5545 to publish one person's duty times to
 * whatever calendar they already carry.
 *
 * A soldier's real question is "when am I next on duty?", and the honest place
 * to answer it is the calendar already on their phone, which rings on its own.
 * That makes a subscription feed worth more than a reminder we would have to
 * send: it survives us being offline, and it is where they look anyway.
 */

export interface CalendarEvent {
  /** Stable across refreshes, so an edit updates the event instead of adding one. */
  uid: string;
  startAt: number;
  endAt: number;
  summary: string;
  description?: string | null;
  location?: string | null;
}

export interface CalendarOptions {
  name: string;
  timezone: string;
  events: CalendarEvent[];
  /** Passed in rather than read, so the output is the same twice under test. */
  stamp: number;
  /** Minutes before a shift to ring. Null leaves the alarm out entirely. */
  alarmMinutesBefore?: number | null;
  /** How long a subscriber should wait before coming back. */
  refreshMinutes?: number;
}

const CRLF = '\r\n';

/** `20260903T050000Z` — UTC, which is how every timestamp is stored anyway. */
export function icsStamp(at: number): string {
  const date = new Date(at);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Backslash, semicolon and comma are separators in a property value. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Content lines are folded at 75 **octets**, not characters. Hebrew is two
 * octets a letter, so counting characters would produce lines a strict parser
 * rejects — and folding by octet without looking would split a letter in half.
 */
export function foldLine(line: string): string {
  const limit = 75;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const character of line) {
    const width = new TextEncoder().encode(character).length;
    // A continuation line spends one octet on its leading space.
    const budget = parts.length === 0 ? limit : limit - 1;
    if (bytes + width > budget) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += character;
    bytes += width;
  }
  parts.push(current);
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join(CRLF);
}

function property(name: string, value: string): string {
  return foldLine(`${name}:${escapeText(value)}`);
}

export function buildCalendar(options: CalendarOptions): string {
  const refresh = options.refreshMinutes ?? 60;
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shabatzak//Duty roster//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    property('X-WR-CALNAME', options.name),
    `X-WR-TIMEZONE:${options.timezone}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refresh}M`,
    `X-PUBLISHED-TTL:PT${refresh}M`,
  ];

  for (const event of options.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${icsStamp(options.stamp)}`,
      `DTSTART:${icsStamp(event.startAt)}`,
      `DTEND:${icsStamp(event.endAt)}`,
      property('SUMMARY', event.summary),
    );
    if (event.description) lines.push(property('DESCRIPTION', event.description));
    if (event.location) lines.push(property('LOCATION', event.location));
    if (options.alarmMinutesBefore) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER:-PT${options.alarmMinutesBefore}M`,
        property('DESCRIPTION', event.summary),
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join(CRLF)}${CRLF}`;
}
