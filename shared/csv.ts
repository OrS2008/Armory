/**
 * CSV import for the roster and for availability (plan section 44).
 *
 * Parsing and validation live here, away from the UI, so the preview the
 * scheduler sees and the rows the server writes come from the same code. A
 * malformed record is never silently imported: every row is either valid or
 * carries the reason it is not.
 */
import { z } from 'zod';
import { validationMessages as v } from './messages.he';
import { isDayKey } from './time';
import type { AvailabilityKind } from './types';

/**
 * Split CSV text into rows. Handles quoted fields, escaped quotes, embedded
 * commas and newlines, a UTF-8 BOM, and both CRLF and LF line endings —
 * everything Excel produces when a Hebrew sheet is saved as CSV.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',' || char === ';' || char === '\t') endField();
    else if (char === '\n') endRow();
    else if (char !== '\r') field += char;
  }
  if (field !== '' || row.length > 0) endRow();

  return rows;
}

/** Header spellings accepted for each column, Hebrew and English. */
const HEADER_ALIASES = {
  displayName: ['שם', 'שם מלא', 'שם החייל', 'name', 'full name', 'fullname'],
  externalId: ['מספר אישי', 'מ״א', 'מא', 'מספר', 'id', 'personal id', 'external id'],
  unit: ['מסגרת', 'מחלקה', 'צוות', 'פלוגה', 'unit', 'team', 'platoon'],
  roleTitle: ['תפקיד', 'role', 'title'],
  phone: ['טלפון', 'נייד', 'phone', 'mobile'],
  qualifications: ['הכשירים', 'הכשיר', 'כשירויות', 'qualifications', 'skills'],
} as const satisfies Record<string, readonly string[]>;

export type PersonnelColumn = keyof typeof HEADER_ALIASES;

const normalise = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[״"'`]/g, '')
    .replace(/\s+/g, ' ');

export function mapHeaders(header: string[]): Partial<Record<PersonnelColumn, number>> {
  const mapping: Partial<Record<PersonnelColumn, number>> = {};
  header.forEach((cell, index) => {
    const key = normalise(cell);
    for (const column of Object.keys(HEADER_ALIASES) as PersonnelColumn[]) {
      const aliases: readonly string[] = HEADER_ALIASES[column];
      if (mapping[column] === undefined && aliases.some((alias) => normalise(alias) === key)) {
        mapping[column] = index;
      }
    }
  });
  return mapping;
}

export interface ImportRow {
  /** 1-based line number in the original file, for the error report. */
  line: number;
  displayName: string;
  externalId: string | null;
  unit: string | null;
  roleTitle: string | null;
  phone: string | null;
  qualifications: string[];
}

export interface RowProblem {
  line: number;
  message: string;
}

export interface ParsedImport {
  rows: ImportRow[];
  problems: RowProblem[];
  /** Columns recognised in the header, for the "what we understood" summary. */
  columns: PersonnelColumn[];
}

const rowSchema = z.object({
  displayName: z.string().trim().min(2, v.nameTooShort).max(80, v.tooLong),
  externalId: z.string().trim().max(32, v.tooLong).nullable(),
  unit: z.string().trim().max(80, v.tooLong).nullable(),
  roleTitle: z.string().trim().max(60, v.tooLong).nullable(),
  phone: z.string().trim().max(20, v.phone).nullable(),
  qualifications: z.array(z.string().trim().min(1)).max(20),
});

const blankToNull = (value: string | undefined) => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

export function parsePersonnelCsv(text: string): ParsedImport {
  const grid = parseCsv(text);
  if (grid.length === 0) {
    return { rows: [], problems: [{ line: 0, message: 'הקובץ ריק.' }], columns: [] };
  }

  const [header, ...body] = grid as [string[], ...string[][]];
  const mapping = mapHeaders(header);
  if (mapping.displayName === undefined) {
    return {
      rows: [],
      problems: [{ line: 1, message: 'לא נמצאה עמודת שם. נדרשת כותרת "שם".' }],
      columns: [],
    };
  }

  const rows: ImportRow[] = [];
  const problems: RowProblem[] = [];
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();

  body.forEach((cells, index) => {
    const line = index + 2; // header is line 1
    const read = (column: PersonnelColumn) => {
      const at = mapping[column];
      return at === undefined ? null : blankToNull(cells[at]);
    };

    const candidate = {
      displayName: read('displayName') ?? '',
      externalId: read('externalId'),
      unit: read('unit'),
      roleTitle: read('roleTitle'),
      phone: read('phone'),
      qualifications: (read('qualifications') ?? '')
        .split(/[,;|/]/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    };

    const parsed = rowSchema.safeParse(candidate);
    if (!parsed.success) {
      problems.push({ line, message: parsed.error.issues[0]?.message ?? v.required });
      return;
    }

    // Duplicates inside the file itself, before anything reaches the database.
    const nameKey = parsed.data.displayName.toLowerCase();
    if (parsed.data.externalId && seenIds.has(parsed.data.externalId)) {
      problems.push({ line, message: `מספר אישי כפול בקובץ: ${parsed.data.externalId}` });
      return;
    }
    if (!parsed.data.externalId && seenNames.has(nameKey)) {
      problems.push({ line, message: `שם כפול בקובץ: ${parsed.data.displayName}` });
      return;
    }
    if (parsed.data.externalId) seenIds.add(parsed.data.externalId);
    seenNames.add(nameKey);

    rows.push({ line, ...parsed.data });
  });

  return {
    rows,
    problems,
    columns: Object.keys(mapping) as PersonnelColumn[],
  };
}

/** What each recognised column is called on screen. */
export const COLUMN_LABELS: Record<PersonnelColumn, string> = {
  displayName: 'שם',
  externalId: 'מספר אישי',
  unit: 'מסגרת',
  roleTitle: 'תפקיד',
  phone: 'טלפון',
  qualifications: 'הכשירים',
};

export const CSV_TEMPLATE = 'שם,מספר אישי,מסגרת,תפקיד,טלפון,הכשירים\n';

// ------------------------------------------------------------ availability --

/**
 * Availability import. The roster import answers "who exists"; this one answers
 * "who is not here", which is the other half of a day the scheduler cannot see
 * without typing it in one person at a time.
 */
const AVAILABILITY_ALIASES = {
  person: ['שם', 'שם מלא', 'שם החייל', 'name', 'full name'],
  externalId: ['מספר אישי', 'מ״א', 'מא', 'id', 'personal id'],
  kind: ['סוג', 'סיבה כללית', 'סטטוס', 'kind', 'type'],
  from: ['מתאריך', 'מ־תאריך', 'התחלה', 'from', 'start'],
  to: ['עד תאריך', 'עד־תאריך', 'סיום', 'to', 'end'],
  reason: ['סיבה', 'הערה', 'הערות', 'reason', 'note'],
} as const satisfies Record<string, readonly string[]>;

export type AvailabilityColumn = keyof typeof AVAILABILITY_ALIASES;

export const AVAILABILITY_COLUMN_LABELS: Record<AvailabilityColumn, string> = {
  person: 'שם',
  externalId: 'מספר אישי',
  kind: 'סוג',
  from: 'מתאריך',
  to: 'עד תאריך',
  reason: 'סיבה',
};

/** Hebrew words a sheet actually uses, mapped onto the stored kinds. */
const KIND_WORDS: Record<string, AvailabilityKind> = {
  זמין: 'available',
  חופשה: 'leave',
  חופש: 'leave',
  רגילה: 'leave',
  הכשרה: 'training',
  קורס: 'training',
  אימון: 'training',
  גימלים: 'medical',
  גימלימים: 'medical',
  מחלה: 'medical',
  רפואי: 'medical',
  בבית: 'home',
  בית: 'home',
  אחר: 'other',
  היעדרות: 'other',
  'היעדרות מאושרת': 'other',
};

export interface AvailabilityImportRow {
  line: number;
  person: string;
  externalId: string | null;
  kind: AvailabilityKind;
  fromDay: string;
  fromTime: string;
  toDay: string;
  toTime: string;
  reason: string | null;
}

export interface ParsedAvailabilityImport {
  rows: AvailabilityImportRow[];
  problems: RowProblem[];
  columns: AvailabilityColumn[];
}

function mapAvailabilityHeaders(header: string[]): Partial<Record<AvailabilityColumn, number>> {
  const mapping: Partial<Record<AvailabilityColumn, number>> = {};
  header.forEach((cell, index) => {
    const key = normalise(cell);
    for (const column of Object.keys(AVAILABILITY_ALIASES) as AvailabilityColumn[]) {
      const aliases: readonly string[] = AVAILABILITY_ALIASES[column];
      if (mapping[column] === undefined && aliases.some((alias) => normalise(alias) === key)) {
        mapping[column] = index;
      }
    }
  });
  return mapping;
}

/**
 * A date cell as a person writes it: 21/08/2026, 21.8.26, 2026-08-21, with an
 * optional time after it. Returns null rather than guessing at anything else.
 */
export function parseDateCell(value: string): { day: string; time: string | null } | null {
  const text = value.trim();
  if (text === '') return null;

  const [datePart, timePart] = text.split(/[\sT]+/);
  if (!datePart) return null;
  const time =
    timePart && /^([01]?\d|2[0-3]):[0-5]\d$/.test(timePart) ? timePart.padStart(5, '0') : null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(datePart);
  const local = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(datePart);

  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    [, year, month, day] = iso.map(Number) as [number, number, number, number];
  } else if (local) {
    const [, d, m, y] = local.map(Number) as [number, number, number, number];
    day = d;
    month = m;
    // Two digits mean this century: a duty sheet is not about 1926.
    year = y < 100 ? 2000 + y : y;
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isDayKey(key) ? { day: key, time } : null;
}

export function parseAvailabilityCsv(text: string): ParsedAvailabilityImport {
  const grid = parseCsv(text);
  if (grid.length === 0) {
    return { rows: [], problems: [{ line: 0, message: 'הקובץ ריק.' }], columns: [] };
  }

  const [header, ...body] = grid as [string[], ...string[][]];
  const mapping = mapAvailabilityHeaders(header);
  if (mapping.person === undefined && mapping.externalId === undefined) {
    return {
      rows: [],
      problems: [{ line: 1, message: 'לא נמצאה עמודת שם או מספר אישי.' }],
      columns: [],
    };
  }
  if (mapping.from === undefined) {
    return {
      rows: [],
      problems: [{ line: 1, message: 'לא נמצאה עמודת תאריך התחלה. נדרשת כותרת "מתאריך".' }],
      columns: [],
    };
  }

  const rows: AvailabilityImportRow[] = [];
  const problems: RowProblem[] = [];

  body.forEach((cells, index) => {
    const line = index + 2;
    const read = (column: AvailabilityColumn) => {
      const at = mapping[column];
      return at === undefined ? null : blankToNull(cells[at]);
    };

    const person = read('person');
    const externalId = read('externalId');
    if (!person && !externalId) {
      problems.push({ line, message: 'אין שם ואין מספר אישי.' });
      return;
    }

    const from = parseDateCell(read('from') ?? '');
    if (!from) {
      problems.push({ line, message: 'תאריך התחלה אינו תקין.' });
      return;
    }
    // A single-day absence is written once; the row then covers that whole day.
    const to = parseDateCell(read('to') ?? '') ?? { day: from.day, time: null };

    const kindCell = read('kind');
    const kind = kindCell ? KIND_WORDS[normalise(kindCell)] : 'leave';
    if (kindCell && !kind) {
      problems.push({ line, message: `סוג לא מוכר: ${kindCell}` });
      return;
    }

    const fromTime = from.time ?? '00:00';
    const toTime = to.time ?? '23:59';
    if (to.day < from.day || (to.day === from.day && toTime <= fromTime)) {
      problems.push({ line, message: v.endBeforeStart });
      return;
    }

    rows.push({
      line,
      person: person ?? '',
      externalId,
      kind: kind ?? 'leave',
      fromDay: from.day,
      fromTime,
      toDay: to.day,
      toTime,
      reason: read('reason'),
    });
  });

  return { rows, problems, columns: Object.keys(mapping) as AvailabilityColumn[] };
}

export const AVAILABILITY_CSV_TEMPLATE = 'שם,מספר אישי,סוג,מתאריך,עד תאריך,סיבה\n';
