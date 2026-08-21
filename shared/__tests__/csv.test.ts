import { describe, expect, it } from 'vitest';
import { mapHeaders, parseCsv, parsePersonnelCsv } from '../csv';

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
