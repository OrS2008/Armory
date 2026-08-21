/** Zod schemas shared by API request validation and client forms. */
import { z } from 'zod';
import { validationMessages as v } from './messages.he';
import { isDayKey } from './time';

const trimmed = (max: number) => z.string().trim().max(max, v.tooLong);
const optionalText = (max: number) =>
  trimmed(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

export const dayKeySchema = z.string().refine(isDayKey, v.invalidDate);
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, v.invalidTime);
export const idSchema = z.string().min(1, v.required).max(64);

/**
 * An optional reference. An unselected HTML <select> submits an empty string,
 * which means "no reference" rather than an invalid id.
 */
const optionalId = () =>
  z
    .union([z.literal(''), idSchema])
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
export const timestampSchema = z.number().int().finite();

/**
 * Sign-in identifier. A unit issues names like `Admin.951`, not mailboxes, so a
 * username is as valid as an email address here. Stored lower-cased, which makes
 * the comparison case-insensitive.
 */
export const identifierSchema = z
  .string()
  .trim()
  .min(1, v.required)
  .max(120)
  .refine(
    (value) => /^[A-Za-z0-9._-]{3,64}$/.test(value) || z.string().email().safeParse(value).success,
    v.identifier,
  );

export const loginSchema = z.object({
  email: identifierSchema,
  password: z.string().min(12, v.passwordTooShort).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const unitSchema = z.object({
  name: trimmed(80).min(2, v.nameTooShort),
  kind: z.enum(['company', 'platoon', 'team']),
  parentId: optionalId(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
});
export type UnitInput = z.infer<typeof unitSchema>;

export const qualificationSchema = z.object({
  code: trimmed(32).min(2, v.nameTooShort),
  name: trimmed(80).min(2, v.nameTooShort),
  description: optionalText(400),
  active: z.boolean().optional(),
  /**
   * Restricts its holder instead of merely permitting them — whoever holds it
   * is scheduled for the assignments that require it and for nothing else.
   */
  exclusive: z.boolean().optional(),
});
export type QualificationInput = z.infer<typeof qualificationSchema>;

export const personnelSchema = z.object({
  displayName: trimmed(80).min(2, v.nameTooShort),
  externalId: optionalText(32),
  unitId: optionalId(),
  roleTitle: optionalText(60),
  phone: optionalText(20),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  notes: optionalText(500),
  qualificationIds: z.array(idSchema).max(50).optional(),
});
export type PersonnelInput = z.infer<typeof personnelSchema>;

export const availabilitySchema = z
  .object({
    personnelId: idSchema,
    kind: z.enum(['available', 'leave', 'training', 'medical', 'home', 'other']),
    startAt: timestampSchema,
    endAt: timestampSchema,
    reason: optionalText(300),
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
  })
  .refine((value) => value.endAt > value.startAt, {
    message: v.endBeforeStart,
    path: ['endAt'],
  });
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

export const availabilityDecisionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reason: optionalText(300),
});

export const assignmentTypeSchema = z.object({
  name: trimmed(80).min(2, v.nameTooShort),
  category: optionalText(40),
  defaultDurationMinutes: z
    .number()
    .int()
    .min(15, v.positiveNumber)
    .max(60 * 24 * 7),
  requiredHeadcount: z.number().int().min(0, v.nonNegative).max(500),
  priority: z.number().int().min(1).max(5).optional(),
  color: trimmed(20).optional(),
  instructions: optionalText(1000),
  active: z.boolean().optional(),
  /**
   * `minCount: 0` requires every assignee to hold the qualification; a positive
   * count requires at least that many among them.
   */
  requiredQualifications: z
    .array(z.object({ qualificationId: idSchema, minCount: z.number().int().min(0).max(500) }))
    .max(50)
    .optional(),
});
export type AssignmentTypeInput = z.infer<typeof assignmentTypeSchema>;

export const recurrenceSchema = z
  .object({
    frequency: z.enum(['none', 'daily', 'weekdays', 'custom']).default('none'),
    /** 0 = Sunday. Used by `weekdays` and `custom`. */
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    untilDate: dayKeySchema.optional(),
    /** Round-the-clock rotation: one occurrence per handover, not per day. */
    shiftHours: z.number().int().min(1).max(12).optional(),
  })
  .optional();
export type RecurrenceInput = z.infer<typeof recurrenceSchema>;

export const assignmentSchema = z
  .object({
    assignmentTypeId: idSchema,
    scheduleId: optionalId(),
    unitId: optionalId(),
    title: optionalText(120),
    startAt: timestampSchema,
    endAt: timestampSchema,
    requiredHeadcount: z.number().int().min(0, v.nonNegative).max(500),
    notes: optionalText(1000),
    personnelIds: z.array(idSchema).max(500).optional(),
    recurrence: recurrenceSchema,
  })
  .refine((value) => value.endAt > value.startAt, {
    message: v.endBeforeStart,
    path: ['endAt'],
  });
export type AssignmentInput = z.infer<typeof assignmentSchema>;

export const assignmentPatchSchema = z
  .object({
    title: optionalText(120),
    startAt: timestampSchema.optional(),
    endAt: timestampSchema.optional(),
    requiredHeadcount: z.number().int().min(0).max(500).optional(),
    unitId: optionalId(),
    notes: optionalText(1000),
    status: z.enum(['planned', 'cancelled']).optional(),
    scheduleId: optionalId(),
  })
  .refine(
    (value) =>
      value.startAt === undefined || value.endAt === undefined || value.endAt > value.startAt,
    { message: v.endBeforeStart, path: ['endAt'] },
  );

export const assignPersonnelSchema = z.object({
  personnelId: idSchema,
  /** The named seat they fill; omitted or empty means a plain לוחם seat. */
  role: optionalId(),
  overrideReason: optionalText(300),
});

export const bulkAssignSchema = z.object({
  assignments: z
    .array(z.object({ assignmentId: idSchema, personnelId: idSchema, role: optionalId() }))
    .min(1)
    .max(1000),
});

export const scheduleSchema = z
  .object({
    name: trimmed(80).min(2, v.nameTooShort),
    unitId: optionalId(),
    startDate: dayKeySchema,
    endDate: dayKeySchema,
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: v.endBeforeStart,
    path: ['endDate'],
  });
export type ScheduleInput = z.infer<typeof scheduleSchema>;

export const publishSchema = z.object({
  note: optionalText(300),
  acknowledgeWarnings: z.boolean().optional(),
});

export const ruleUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  severity: z.enum(['info', 'warning', 'blocking']).optional(),
  overridable: z.boolean().optional(),
  config: z.record(z.string(), z.number()).optional(),
});

export const replacementSchema = z.object({
  assignmentId: idSchema,
  personnelId: idSchema,
  reason: optionalText(300),
});

export const replacementDecisionSchema = z.object({
  status: z.enum(['proposed', 'approved', 'rejected', 'cancelled']),
  replacementPersonnelId: optionalId(),
});

export const importRowSchema = z.object({
  line: z.number().int().min(0),
  displayName: trimmed(80).min(2, v.nameTooShort),
  externalId: trimmed(32).nullable(),
  unit: trimmed(80).nullable(),
  roleTitle: trimmed(60).nullable(),
  phone: trimmed(20).nullable(),
  qualifications: z.array(trimmed(80).min(1)).max(20),
});

export const personnelImportSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(2000),
  /** Validate and report without writing anything. */
  dryRun: z.boolean().default(true),
  createMissingUnits: z.boolean().default(true),
  createMissingQualifications: z.boolean().default(true),
});
export type PersonnelImportInput = z.infer<typeof personnelImportSchema>;

export const userSchema = z.object({
  email: identifierSchema,
  displayName: trimmed(80).min(2, v.nameTooShort),
  password: z.string().min(12, v.passwordTooShort).max(200).optional(),
  role: z.enum(['system_admin', 'company_commander', 'unit_scheduler', 'soldier', 'viewer']),
  personnelId: optionalId(),
  unitScope: z.array(idSchema).max(50).optional(),
  active: z.boolean().optional(),
});
