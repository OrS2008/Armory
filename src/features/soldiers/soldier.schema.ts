import { z } from 'zod';

export const soldierSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().trim().min(2, 'יש להזין שם מלא').max(80),
  personalId: z.string().regex(/^\d{5,9}$/, 'מספר אישי חייב להכיל 5–9 ספרות'),
  department: z.string().min(1, 'יש לבחור מחלקה'),
  phone: z.string().regex(/^05\d{8}$/, 'מספר הטלפון אינו תקין'),
  approvalStatus: z.enum(['pending', 'approved', 'archived']),
  equipmentStatus: z.enum(['outside', 'returned', 'partial']),
  approvedAt: z.string().nullable(),
  messageSentAt: z.string().nullable(),
  civilianLicense: z.object({
    number: z.string(),
    expiresAt: z.string().nullable(),
    approved: z.boolean(),
    documentName: z.string().nullable(),
  }),
  militaryLicense: z.object({
    number: z.string(),
    expiresAt: z.string().nullable(),
    approved: z.boolean(),
    documentName: z.string().nullable(),
  }),
  equipment: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      issued: z.number().int().nonnegative(),
      returned: z.number().int().nonnegative(),
    }),
  ),
  note: z.string().max(500),
});
export type Soldier = z.infer<typeof soldierSchema>;

export const soldierFormSchema = soldierSchema.pick({
  fullName: true,
  personalId: true,
  department: true,
  phone: true,
});
export type SoldierFormValues = z.infer<typeof soldierFormSchema>;
