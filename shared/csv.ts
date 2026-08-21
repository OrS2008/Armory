/**
 * Personnel CSV import (plan section 44).
 *
 * Parsing and validation live here, away from the UI, so the preview the
 * scheduler sees and the rows the server writes come from the same code. A
 * malformed record is never silently imported: every row is either valid or
 * carries the reason it is not.
 */
import { z } from 'zod';
import { validationMessages as v } from './messages.he';

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
