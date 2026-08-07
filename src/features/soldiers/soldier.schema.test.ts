import { describe, expect, it } from 'vitest';
import { soldierFormSchema } from './soldier.schema';
describe('soldierFormSchema', () => {
  it('accepts a valid Hebrew soldier record', () => {
    expect(
      soldierFormSchema.safeParse({
        fullName: 'אור שמחון',
        personalId: '5817533',
        department: 'מפל״ג',
        phone: '0521234573',
      }).success,
    ).toBe(true);
  });
  it('rejects malformed identifiers and phone numbers', () => {
    const result = soldierFormSchema.safeParse({
      fullName: 'א',
      personalId: '12A',
      department: '',
      phone: '123',
    });
    expect(result.success).toBe(false);
  });
});
