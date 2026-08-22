import { describe, expect, it } from 'vitest';
import {
  mapHeaders,
  parseAvailabilityCsv,
  parseCsv,
  parseDateCell,
  parsePersonnelCsv,
} from '../csv';

describe('csv parsing', () => {
  it('handles quoted fields containing the delimiter', () => {
    expect(parseCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
  });

  it('handles escaped quotes', () => {
    expect(parseCsv('a,"say ""hi""",c')).toEqual([['a', 'say "hi"', 'c']]);
  });

  it('strips a UTF-8 BOM, which Excel writes on Hebrew sheets', () => {
    expect(parseCsv('﻿שם,תפקיד\nדני,לוחם')).toEqual([
      ['שם', 'תפקיד'],
      ['דני', 'לוחם'],
    ]);
  });

  it('accepts CRLF, semicolons and tabs', () => {
    expect(parseCsv('a;b\r\nc;d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseCsv('a\tb')).toEqual([['a', 'b']]);
  });

  it('drops entirely blank lines', () => {
    expect(parseCsv('a,b\n\n\nc,d')).toHaveLength(2);
  });
});

describe('header mapping', () => {
  it('recognises Hebrew headers', () => {
    const mapping = mapHeaders(['שם', 'מספר אישי', 'מסגרת', 'תפקיד', 'טלפון', 'הכשירים']);
    expect(mapping).toEqual({
      displayName: 0,
      externalId: 1,
      unit: 2,
      roleTitle: 3,
      phone: 4,
      qualifications: 5,
    });
  });

  it('recognises English headers and ignores spacing and quotes', () => {
    const mapping = mapHeaders(['  Name ', 'Personal ID', 'unknown column']);
    expect(mapping.displayName).toBe(0);
    expect(mapping.externalId).toBe(1);
  });

  it('accepts the abbreviated מ״א spelling', () => {
    expect(mapHeaders(['שם', 'מ״א']).externalId).toBe(1);
  });
});

describe('personnel import', () => {
  const header = 'שם,מספר אישי,מסגרת,תפקיד,טלפון,הכשירים\n';

  it('reads a well-formed file', () => {
    const result = parsePersonnelCsv(
      `${header}דניאל כהן,1000001,מחלקה 1,לוחם,0501234567,"נהג, מפקד"`,
    );
    expect(result.problems).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      line: 2,
      displayName: 'דניאל כהן',
      externalId: '1000001',
      unit: 'מחלקה 1',
      qualifications: ['נהג', 'מפקד'],
    });
  });

  it('reports the line number of a bad row and keeps the good ones', () => {
    const result = parsePersonnelCsv(`${header}דניאל כהן,1\nא,2\nנועה לוי,3`);
    expect(result.rows.map((row) => row.displayName)).toEqual(['דניאל כהן', 'נועה לוי']);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.line).toBe(3);
  });

  it('refuses a file with no name column', () => {
    const result = parsePersonnelCsv('תפקיד,טלפון\nלוחם,050');
    expect(result.rows).toEqual([]);
    expect(result.problems[0]?.message).toContain('שם');
  });

  it('catches a service number repeated inside the file', () => {
    const result = parsePersonnelCsv(`${header}דניאל כהן,1000001\nנועה לוי,1000001`);
    expect(result.rows).toHaveLength(1);
    expect(result.problems[0]?.message).toContain('1000001');
  });

  it('catches a repeated name when no service number distinguishes them', () => {
    const result = parsePersonnelCsv(`${header}דניאל כהן\nדניאל כהן`);
    expect(result.rows).toHaveLength(1);
    expect(result.problems[0]?.message).toContain('דניאל כהן');
  });

  it('allows the same name twice when the service numbers differ', () => {
    const result = parsePersonnelCsv(`${header}דניאל כהן,1\nדניאל כהן,2`);
    expect(result.rows).toHaveLength(2);
    expect(result.problems).toEqual([]);
  });

  it('treats missing optional columns as absent, not empty strings', () => {
    const result = parsePersonnelCsv('שם\nדניאל כהן');
    expect(result.rows[0]).toMatchObject({ externalId: null, unit: null, phone: null });
  });

  it('splits qualifications on several separators', () => {
    const result = parsePersonnelCsv(`שם,הכשירים\nדניאל,"נהג; מפקד / חובש"`);
    expect(result.rows[0]?.qualifications).toEqual(['נהג', 'מפקד', 'חובש']);
  });

  it('reports an empty file rather than importing nothing silently', () => {
    expect(parsePersonnelCsv('').problems[0]?.message).toContain('ריק');
  });
});

describe('parseDateCell', () => {
  it('reads the shapes a person actually types', () => {
    expect(parseDateCell('21/08/2026')).toEqual({ day: '2026-08-21', time: null });
    expect(parseDateCell('21.8.26')).toEqual({ day: '2026-08-21', time: null });
    expect(parseDateCell('2026-08-21')).toEqual({ day: '2026-08-21', time: null });
    expect(parseDateCell('21/08/2026 08:30')).toEqual({ day: '2026-08-21', time: '08:30' });
    expect(parseDateCell('2026-08-21T8:30')).toEqual({ day: '2026-08-21', time: '08:30' });
  });

  it('refuses to guess', () => {
    expect(parseDateCell('')).toBeNull();
    expect(parseDateCell('בקרוב')).toBeNull();
    expect(parseDateCell('32/01/2026')).toBeNull();
    expect(parseDateCell('21/13/2026')).toBeNull();
  });
});

describe('parseAvailabilityCsv', () => {
  it('reads a leave sheet, defaulting a single date to the whole day', () => {
    const result = parseAvailabilityCsv(
      [
        'שם,סוג,מתאריך,עד תאריך,סיבה',
        'דניאל כהן,חופשה,21/08/2026,23/08/2026,רגילה',
        'נועה לוי,גימלים,22/08/2026,,',
      ].join('\n'),
    );

    expect(result.problems).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      person: 'דניאל כהן',
      kind: 'leave',
      fromDay: '2026-08-21',
      fromTime: '00:00',
      toDay: '2026-08-23',
      toTime: '23:59',
      reason: 'רגילה',
    });
    // One date means that day, start to end, rather than a zero-length record.
    expect(result.rows[1]).toMatchObject({
      kind: 'medical',
      fromDay: '2026-08-22',
      toDay: '2026-08-22',
      toTime: '23:59',
    });
  });

  it('names the line and the reason for every row it will not take', () => {
    const result = parseAvailabilityCsv(
      [
        'שם,סוג,מתאריך,עד תאריך',
        ',חופשה,21/08/2026,',
        'דניאל כהן,מסיבה,21/08/2026,',
        'נועה לוי,חופשה,מחר,',
        'יוסי אברהם,חופשה,23/08/2026,21/08/2026',
      ].join('\n'),
    );

    expect(result.rows).toEqual([]);
    expect(result.problems.map((problem) => problem.line)).toEqual([2, 3, 4, 5]);
    expect(result.problems[1]?.message).toContain('מסיבה');
  });

  it('accepts a sheet keyed by personal number instead of by name', () => {
    const result = parseAvailabilityCsv('מספר אישי,מתאריך\n1000001,21/08/2026');
    expect(result.rows[0]).toMatchObject({ externalId: '1000001', kind: 'leave' });
  });

  it('says what is missing when the header carries neither a name nor a number', () => {
    const result = parseAvailabilityCsv('סוג,מתאריך\nחופשה,21/08/2026');
    expect(result.rows).toEqual([]);
    expect(result.problems[0]?.message).toContain('שם');
  });
});
