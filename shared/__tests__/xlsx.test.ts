import { describe, expect, it } from 'vitest';
import { buildXlsx, columnName, crc32 } from '../xlsx';

const decode = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes);

describe('crc32', () => {
  it('matches the standard check value', () => {
    // 0xCBF43926 for "123456789" is the published check value for CRC-32.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('columnName', () => {
  it('counts in the base-26 alphabet Excel uses, which has no zero', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
    expect(columnName(27)).toBe('AB');
    expect(columnName(701)).toBe('ZZ');
    expect(columnName(702)).toBe('AAA');
  });
});

describe('buildXlsx', () => {
  const workbook = buildXlsx([
    {
      name: 'עומס',
      columns: [{ header: 'שם', width: 24 }, { header: 'שעות' }],
      rows: [
        ['דניאל כהן', 12.5],
        ['נועה לוי', null],
      ],
    },
    { name: 'פערים', columns: [{ header: 'משימה' }], rows: [['ש.ג']] },
  ]);

  it('writes a ZIP container', () => {
    expect(Array.from(workbook.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    // End of central directory, with no trailing comment.
    const tail = workbook.slice(-22);
    expect(Array.from(tail.slice(0, 4))).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it('carries every part a reader needs, one worksheet per sheet', () => {
    const text = decode(workbook);
    expect(text).toContain('[Content_Types].xml');
    expect(text).toContain('xl/workbook.xml');
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('xl/worksheets/sheet2.xml');
    expect(text).toContain('<sheet name="עומס"');
    expect(text).toContain('<sheet name="פערים"');
  });

  it('keeps a number a number and leaves an empty cell out', () => {
    const text = decode(workbook);
    expect(text).toContain('<c r="B2"><v>12.5</v></c>');
    expect(text).toContain('>דניאל כהן<');
    // Row 3 has a name and nothing else; B3 is absent rather than empty.
    expect(text).not.toContain('r="B3"');
  });

  it('opens right to left, because the sheet is Hebrew', () => {
    expect(decode(workbook)).toContain('rightToLeft="1"');
  });
});
