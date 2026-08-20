import { describe, expect, it } from 'vitest';
import {
  assignmentSchema,
  availabilitySchema,
  loginSchema,
  personnelSchema,
  scheduleSchema,
} from '@shared/schemas';

describe('validation schemas', () => {
  it('rejects a short password with a Hebrew message', () => {
    const result = loginSchema.safeParse({ email: 'a@b.co', password: 'short' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('12');
  });

  it('rejects an assignment that ends before it starts', () => {
    const result = assignmentSchema.safeParse({
      assignmentTypeId: 'atp_1',
      startAt: 2000,
      endAt: 1000,
      requiredHeadcount: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['endAt']);
  });

  it('accepts a valid overnight assignment', () => {
    expect(
      assignmentSchema.safeParse({
        assignmentTypeId: 'atp_1',
        startAt: 1000,
        endAt: 2000,
        requiredHeadcount: 2,
      }).success,
    ).toBe(true);
  });

  it('requires availability to have a positive duration', () => {
    expect(
      availabilitySchema.safeParse({
        personnelId: 'per_1',
        kind: 'leave',
        startAt: 5,
        endAt: 5,
      }).success,
    ).toBe(false);
  });

  it('normalises empty optional text to null', () => {
    const result = personnelSchema.parse({ displayName: 'דניאל', notes: '' });
    expect(result.notes).toBeNull();
  });

  it('rejects an invalid schedule date', () => {
    expect(
      scheduleSchema.safeParse({ name: 'שבוע', startDate: '2026-13-01', endDate: '2026-13-02' })
        .success,
    ).toBe(false);
  });
});

describe('optional reference fields', () => {
  it('treats an unselected select as no reference', () => {
    const result = personnelSchema.parse({ displayName: 'דניאל', unitId: '' });
    expect(result.unitId).toBeNull();
  });

  it('still rejects an id that is too long', () => {
    expect(
      personnelSchema.safeParse({ displayName: 'דניאל', unitId: 'x'.repeat(80) }).success,
    ).toBe(false);
  });

  it('keeps a real unit id', () => {
    expect(personnelSchema.parse({ displayName: 'דניאל', unitId: 'unt_1' }).unitId).toBe('unt_1');
  });
});
