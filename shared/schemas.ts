/** Zod schemas shared by API request validation and client forms. */
import { z } from 'zod';
import { validationMessages as v } from './messages.he';
import { isDayKey } from './time';
import { isShiftHours } from './recurrence';
import { MAX_STANDING_DAYS, isStandingShiftHours } from './standing';

const trimmed = (max: number) => z.string().trim().max(max, v.tooLong);
/**
 * A number that may be left blank.
 *
 * An empty `<select>` or `<input type=number>` submits `''`, and JSON from any
 * other caller may send `null` or leave the key out entirely. All three mean the
 * same thing — nobody chose — so they are normalised here rather than in each
 * form, where forgetting it fails validation with a message nobody can act on.
 */
const optionalNumber = <T extends z.ZodType<number>>(schema: T) =>
  z
    .union([z.literal(''), z.null(), schema])
    .transform((value) => (value === '' ? null : value))
    .optional();

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
  /** Takes its holder out of the rotation entirely — מפלג has a job, not a shift. */
  blocksScheduling: z.boolean().optional(),
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

/**
 * A single endpoint carries two different edits: a manager's decision
 * (`status`) and a correction to what was actually requested (`kind`, the
 * dates, `reason`) — the same split, and the same reason for it, as
 * `assignmentPatchSchema` below. The handler gates each half on its own
 * permission rather than requiring both at once.
 */
export const availabilityPatchSchema = z
  .object({
    kind: z.enum(['available', 'leave', 'training', 'medical', 'home', 'other']).optional(),
    startAt: timestampSchema.optional(),
    endAt: timestampSchema.optional(),
    reason: optionalText(300),
    status: z.enum(['approved', 'rejected']).optional(),
  })
  .refine(
    (value) =>
      value.startAt === undefined || value.endAt === undefined || value.endAt > value.startAt,
    { message: v.endBeforeStart, path: ['endAt'] },
  );
export type AvailabilityPatchInput = z.infer<typeof availabilityPatchSchema>;

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
  /** Minutes before each shift's own start that its briefing is held. */
  briefingMinutesBefore: optionalNumber(z.number().int().min(0).max(120)),
  active: z.boolean().optional(),
  /**
   * `minCount: 0` requires every assignee to hold the qualification; a positive
   * count requires at least that many among them.
   */
  requiredQualifications: z
    .array(z.object({ qualificationId: idSchema, minCount: z.number().int().min(0).max(500) }))
    .max(50)
    .optional(),
  /** Marks that disqualify their holder from this post. */
  excludedQualificationIds: z.array(idSchema).max(50).optional(),
  /** A post covered round the clock, handed over every `shiftHours`. */
  standing: z.boolean().optional(),
  shiftHours: z.number().int().min(1).max(24).refine(isStandingShiftHours, v.shiftHours).optional(),
  shiftStartHour: z.number().int().min(0).max(23).optional(),
  shiftStartMinute: z.number().int().min(0).max(59).optional(),
  /** Where the post prints on the duty sheet, and how its title bar reads. */
  section: optionalText(80),
  sheetLabel: optionalText(120),
  crewRoleSuffix: optionalText(40),
  sheetColumn: optionalNumber(z.number().int().min(1).max(3)),
});
export type AssignmentTypeInput = z.infer<typeof assignmentTypeSchema>;
/**
 * What the form holds before the schema normalises it — a blank `<select>` is
 * `''` until it has been parsed, so the form is typed on the way in and the
 * API on the way out.
 */
export type AssignmentTypeFormValues = z.input<typeof assignmentTypeSchema>;

export const recurrenceSchema = z
  .object({
    frequency: z.enum(['none', 'daily', 'weekdays', 'custom']).default('none'),
    /** 0 = Sunday. Used by `weekdays` and `custom`. */
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    untilDate: dayKeySchema.optional(),
    /** Round-the-clock rotation: one occurrence per handover, not per day. */
    shiftHours: z.number().int().min(1).max(24).refine(isShiftHours, v.shiftHours).optional(),
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

/**
 * Taking somebody off a post. `scope: 'day'` removes them from every shift
 * that starts on the same local day — "הסרת שיבוץ כולל לאותו היום" — because
 * clearing one shift at a time is how a person ends up half-removed.
 */
export const unassignPersonnelSchema = z.object({
  personnelId: idSchema,
  scope: z.enum(['shift', 'day']).optional(),
});

/**
 * Clears everyone off every shift that starts on one local day, in one
 * action — the group version of `scope: 'day'` above, for a commander
 * restarting a whole day's staffing rather than one person's. The shifts
 * themselves are untouched; only who is on them.
 */
export const unassignDaySchema = z.object({
  day: dayKeySchema,
});
export type UnassignDayInput = z.infer<typeof unassignDaySchema>;

/**
 * Lay out every standing post across a period. The manager states the period
 * once; the posts carry their own rhythm.
 */
export const standingRosterSchema = z
  .object({
    fromDate: dayKeySchema,
    toDate: dayKeySchema,
    /** Defaults to every standing post. */
    assignmentTypeIds: z.array(idSchema).max(50).optional(),
  })
  .refine((value) => value.toDate >= value.fromDate, {
    message: v.endBeforeStart,
    path: ['toDate'],
  })
  .refine((value) => daysBetweenKeys(value.fromDate, value.toDate) <= MAX_STANDING_DAYS, {
    message: v.rangeTooLong,
    path: ['toDate'],
  });
export type StandingRosterInput = z.infer<typeof standingRosterSchema>;

function daysBetweenKeys(from: string, to: string): number {
  const parse = (key: string) => {
    const [year, month, day] = key.split('-').map(Number) as [number, number, number];
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

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

const roleSchema = z.enum([
  'system_admin',
  'company_commander',
  'unit_scheduler',
  'soldier',
  'viewer',
]);

/** A new account. The password is set once here and never read back. */
const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, v.mfaCode);

export const mfaEnableSchema = z.object({ code: totpCodeSchema });
export type MfaEnableInput = z.infer<typeof mfaEnableSchema>;

export const mfaDisableSchema = z.object({ password: z.string().min(1, v.required).max(200) });

/**
 * Completing a login. Either the app's six digits or one recovery code — the
 * point of the second is that the phone with the first is gone.
 */
export const mfaVerifySchema = z
  .object({
    challenge: z.string().min(1, v.required).max(200),
    code: z.string().trim().min(1, v.required).max(40),
  })
  .transform((value) => ({ ...value, code: value.code.replace(/\s/g, '') }));
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const availabilityImportRowSchema = z.object({
  line: z.number().int().min(0),
  person: trimmed(80),
  externalId: trimmed(32).nullable(),
  kind: z.enum(['available', 'leave', 'training', 'medical', 'home', 'other']),
  fromDay: dayKeySchema,
  fromTime: timeSchema,
  toDay: dayKeySchema,
  toTime: timeSchema,
  reason: trimmed(300).nullable(),
});

export const availabilityImportSchema = z.object({
  rows: z.array(availabilityImportRowSchema).min(1).max(2000),
  /** Validate and report without writing anything. */
  dryRun: z.boolean().default(true),
});
export type AvailabilityImportInput = z.infer<typeof availabilityImportSchema>;

export const userSchema = z.object({
  email: identifierSchema,
  displayName: trimmed(80).min(2, v.nameTooShort),
  password: z.string().min(12, v.passwordTooShort).max(200),
  role: roleSchema,
  personnelId: optionalId(),
  unitScope: z.array(idSchema).max(50).optional(),
  active: z.boolean().optional(),
});
export type UserInput = z.infer<typeof userSchema>;

/**
 * Editing an account. Every field is optional because the screen sends only
 * what changed; `password` here is an administrator resetting someone else's,
 * which is a different act from a person changing their own.
 */
export const userPatchSchema = z.object({
  displayName: trimmed(80).min(2, v.nameTooShort).optional(),
  role: roleSchema.optional(),
  personnelId: optionalId(),
  unitScope: z.array(idSchema).max(50).optional(),
  active: z.boolean().optional(),
  password: z.string().min(12, v.passwordTooShort).max(200).optional(),
  /** Only ever false: an administrator can clear a lost second factor, never set one up for someone else. */
  mfaEnabled: z.literal(false).optional(),
});
export type UserPatchInput = z.infer<typeof userPatchSchema>;

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, v.required).max(200),
    newPassword: z.string().min(12, v.passwordTooShort).max(200),
    confirmPassword: z.string().min(1, v.required).max(200),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: v.passwordMismatch,
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ['newPassword'],
    message: v.passwordUnchanged,
  });
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
