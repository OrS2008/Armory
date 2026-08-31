import { describe, expect, it } from 'vitest';
import { assignmentTypeSchema } from '../schemas';

/**
 * A blank `<select>` submits `''`, not `null`.
 *
 * Every optional number on a form has to survive that, or saving a post with
 * nothing chosen in one of its dropdowns fails validation with a message the
 * person filling the form cannot act on — which is exactly what happened once.
 */
const post = (over: Record<string, unknown> = {}) => ({
  name: 'עמדה',
  defaultDurationMinutes: 480,
  requiredHeadcount: 1,
  ...over,
});

describe('an optional number on a post', () => {
  it('reads a blank dropdown as "nobody chose"', () => {
    const parsed = assignmentTypeSchema.parse(post({ sheetColumn: '', briefingMinutesBefore: '' }));
    expect(parsed.sheetColumn).toBeNull();
    expect(parsed.briefingMinutesBefore).toBeNull();
  });

  it('reads an explicit null and an absent key the same way', () => {
    expect(assignmentTypeSchema.parse(post({ sheetColumn: null })).sheetColumn).toBeNull();
    expect(assignmentTypeSchema.parse(post()).sheetColumn).toBeUndefined();
  });

  it('keeps a real choice', () => {
    expect(assignmentTypeSchema.parse(post({ sheetColumn: 2 })).sheetColumn).toBe(2);
  });

  it('still refuses a column the sheet does not have', () => {
    expect(assignmentTypeSchema.safeParse(post({ sheetColumn: 4 })).success).toBe(false);
    expect(assignmentTypeSchema.safeParse(post({ sheetColumn: 'x' })).success).toBe(false);
  });
});
