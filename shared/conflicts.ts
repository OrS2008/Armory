/**
 * Conflict engine.
 *
 * Pure functions over a snapshot of the schedule window. The API runs this to
 * decide whether an assignment may be saved or a schedule published; the client
 * runs the identical code to show warnings while the scheduler is still
 * dragging. Every conflict carries what happened, who it affects, why it
 * matters and how to resolve it (product principle 3.6).
 */
import { availabilityKindLabels, conflictMessage, conflictResolution } from './messages.he';
import { formatDayKey, formatHours, formatTime } from './format';
import {
  DAY,
  DEFAULT_TIMEZONE,
  HOUR,
  dayKey,
  dayKeysInRange,
  minutesBetween,
  overlaps,
} from './time';
import type { AvailabilityKind, Severity } from './types';

export const RULE_CODES = [
  'NO_OVERLAP',
  'AVAILABILITY_REQUIRED',
  'QUALIFICATION_REQUIRED',
  'MIN_REST',
  'MAX_CONTINUOUS',
  'MAX_ASSIGNMENTS_PER_DAY',
  'MAX_HOURS_IN_WINDOW',
  'UNDERSTAFFED',
  'OVERSTAFFED',
  'UNPUBLISHED_CHANGES',
  'EXCLUSIVE_QUALIFICATION',
  'ROLE_QUALIFICATION',
  'ROLE_TAKEN',
  'PRE_DEPARTURE_REST',
] as const;

export type RuleCode = (typeof RULE_CODES)[number];

export interface SchedulingRule {
  code: RuleCode;
  name: string;
  enabled: boolean;
  severity: Severity;
  overridable: boolean;
  config: Record<string, number>;
}

export interface EnginePerson {
  id: string;
  displayName: string;
  qualificationIds: string[];
}

/**
 * A qualification an assignment needs. `minCount: 0` means every assignee must
 * hold it; a positive count means at least that many of them must — the
 * difference between "four qualified drivers" and "a driver among the four".
 */
export interface RequiredQualification {
  qualificationId: string;
  minCount: number;
}

export interface EngineAssignment {
  id: string;
  title: string;
  startAt: number;
  endAt: number;
  requiredHeadcount: number;
  requiredQualifications: RequiredQualification[];
  assigneeIds: string[];
  /**
   * Which seat each assignee fills, keyed by personnel id: the qualification
   * that names the role, or null for the plain seat the printed sheet calls
   * לוחם. A named role is taken by at most one person — that is what makes
   * "one driver and one commander" true rather than merely intended.
   */
  assigneeRoles?: Record<string, string | null>;
  publicationState: 'draft' | 'published' | 'modified';
  cancelled?: boolean;
  /** Assignees the scheduler explicitly overrode, keyed by personnel id. */
  overriddenBy?: string[];
}

export interface EngineAbsence {
  personnelId: string;
  kind: AvailabilityKind;
  startAt: number;
  endAt: number;
}

export interface EngineInput {
  assignments: EngineAssignment[];
  personnel: EnginePerson[];
  absences: EngineAbsence[];
  rules: SchedulingRule[];
  qualificationNames?: Record<string, string>;
  /**
   * Qualifications that restrict their holder instead of merely permitting
   * them: whoever is marked חמ״ל does חמ״ל and nothing else.
   */
  exclusiveQualificationIds?: string[];
  timezone?: string;
}

export interface Conflict {
  id: string;
  code: RuleCode;
  severity: Severity;
  overridable: boolean;
  assignmentId: string | null;
  personnelId: string | null;
  subject: string;
  message: string;
  resolution: string;
}

export const DEFAULT_RULES: SchedulingRule[] = [
  {
    code: 'NO_OVERLAP',
    name: 'אין חפיפה בין שיבוצים',
    enabled: true,
    severity: 'blocking',
    overridable: true,
    config: {},
  },
  {
    code: 'AVAILABILITY_REQUIRED',
    name: 'שיבוץ רק כאשר האדם זמין',
    enabled: true,
    severity: 'blocking',
    overridable: true,
    config: {},
  },
  {
    code: 'QUALIFICATION_REQUIRED',
    name: 'נדרשים הכשירים למשימה',
    enabled: true,
    severity: 'blocking',
    overridable: true,
    config: {},
  },
  {
    code: 'MIN_REST',
    name: 'מנוחה מזערית בין שיבוצים',
    enabled: true,
    severity: 'warning',
    overridable: true,
    config: { minutes: 480 },
  },
  {
    code: 'MAX_CONTINUOUS',
    name: 'משך שיבוץ רצוף מרבי',
    enabled: true,
    severity: 'warning',
    overridable: true,
    config: { minutes: 720 },
  },
  {
    code: 'MAX_ASSIGNMENTS_PER_DAY',
    name: 'מספר שיבוצים מרבי ביום',
    enabled: true,
    severity: 'warning',
    overridable: true,
    config: { count: 2 },
  },
  {
    code: 'MAX_HOURS_IN_WINDOW',
    name: 'שעות מרביות בחלון זמן',
    enabled: true,
    severity: 'warning',
    overridable: true,
    config: { hours: 60, windowDays: 7 },
  },
  {
    code: 'UNDERSTAFFED',
    name: 'משימה בתת־איוש',
    enabled: true,
    severity: 'warning',
    overridable: true,
    config: {},
  },
  {
    code: 'OVERSTAFFED',
    name: 'משימה מאוישת מעבר לנדרש',
    enabled: true,
    severity: 'info',
    overridable: true,
    config: {},
  },
  {
    code: 'EXCLUSIVE_QUALIFICATION',
    name: 'הכשיר ייעודי — מחזיקו משובץ רק למשימות שלו',
    enabled: true,
    severity: 'blocking',
    overridable: true,
    config: {},
  },
  {
    code: 'ROLE_QUALIFICATION',
    name: 'ממלא תפקיד מחזיק בהכשיר של אותו תפקיד',
    enabled: true,
    severity: 'blocking',
    overridable: true,
    config: {},
  },
  {
    code: 'ROLE_TAKEN',
    name: 'תפקיד אחד לכל אדם במשימה',
    enabled: true,
    severity: 'blocking',
    overridable: false,
    config: {},
  },
  {
    code: 'PRE_DEPARTURE_REST',
    name: 'אין שיבוץ בשעות שלפני יציאה',
    enabled: true,
    severity: 'blocking',
    overridable: true,
    config: { hours: 8 },
  },
  {
    code: 'UNPUBLISHED_CHANGES',
    name: 'שינויים שטרם פורסמו',
    enabled: true,
    severity: 'info',
    overridable: true,
    config: {},
  },
];

const SEVERITY_ORDER: Record<Severity, number> = { blocking: 0, warning: 1, info: 2 };

export function detectConflicts(input: EngineInput): Conflict[] {
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  const rules = new Map(input.rules.map((rule) => [rule.code, rule]));
  const people = new Map(input.personnel.map((person) => [person.id, person]));
  const active = input.assignments.filter((assignment) => !assignment.cancelled);
  const conflicts: Conflict[] = [];

  const rule = (code: RuleCode): SchedulingRule | null => {
    const found = rules.get(code);
    return found && found.enabled ? found : null;
  };

  const personName = (personnelId: string) =>
    people.get(personnelId)?.displayName ?? 'אדם שאינו במאגר';

  const add = (
    code: RuleCode,
    ruleDef: SchedulingRule,
    assignment: EngineAssignment | null,
    personnelId: string | null,
    params: Record<string, string | number>,
  ) => {
    conflicts.push({
      id: `${code}:${assignment?.id ?? 'global'}:${personnelId ?? '-'}`,
      code,
      severity: ruleDef.severity,
      overridable: ruleDef.overridable,
      assignmentId: assignment?.id ?? null,
      personnelId,
      subject: personnelId ? personName(personnelId) : (assignment?.title ?? ''),
      message: conflictMessage(code, params),
      resolution: conflictResolution(code, params),
    });
  };

  // Per-assignment staffing checks.
  for (const assignment of active) {
    const count = assignment.assigneeIds.length;
    const understaffed = rule('UNDERSTAFFED');
    if (understaffed && count < assignment.requiredHeadcount) {
      add('UNDERSTAFFED', understaffed, assignment, null, {
        assignment: assignment.title,
        actual: count,
        required: assignment.requiredHeadcount,
      });
    }
    const overstaffed = rule('OVERSTAFFED');
    if (overstaffed && count > assignment.requiredHeadcount) {
      add('OVERSTAFFED', overstaffed, assignment, null, {
        assignment: assignment.title,
        actual: count,
        required: assignment.requiredHeadcount,
      });
    }
    const unpublished = rule('UNPUBLISHED_CHANGES');
    if (unpublished && assignment.publicationState !== 'published') {
      add('UNPUBLISHED_CHANGES', unpublished, assignment, null, {
        assignment: assignment.title,
      });
    }

    // Qualifications.
    const qualificationRule = rule('QUALIFICATION_REQUIRED');
    if (qualificationRule && assignment.requiredQualifications.length > 0) {
      const holds = (personnelId: string, qualificationId: string) =>
        (people.get(personnelId)?.qualificationIds ?? []).includes(qualificationId);
      const qualificationName = (id: string) => input.qualificationNames?.[id] ?? id;

      // "Every assignee must hold it" is a fact about each person.
      const everyone = assignment.requiredQualifications.filter((item) => item.minCount <= 0);
      for (const personnelId of assignment.assigneeIds) {
        if (isOverridden(assignment, personnelId)) continue;
        const missing = everyone
          .filter((item) => !holds(personnelId, item.qualificationId))
          .map((item) => qualificationName(item.qualificationId));
        if (missing.length > 0) {
          add('QUALIFICATION_REQUIRED', qualificationRule, assignment, personnelId, {
            person: personName(personnelId),
            qualifications: missing.join(', '),
          });
        }
      }

      // "At least N among them" is a fact about the crew, so it is reported
      // against the assignment rather than blamed on any one person.
      for (const item of assignment.requiredQualifications) {
        if (item.minCount <= 0) continue;
        const present = assignment.assigneeIds.filter((personnelId) =>
          holds(personnelId, item.qualificationId),
        ).length;
        if (present < item.minCount) {
          const params = {
            assignment: assignment.title,
            qualification: qualificationName(item.qualificationId),
            required: item.minCount,
            actual: present,
          };
          conflicts.push({
            id: `QUALIFICATION_MISSING_ROLE:${assignment.id}:${item.qualificationId}`,
            code: 'QUALIFICATION_REQUIRED',
            severity: qualificationRule.severity,
            overridable: qualificationRule.overridable,
            assignmentId: assignment.id,
            personnelId: null,
            subject: assignment.title,
            message: conflictMessage('QUALIFICATION_MISSING_ROLE', params),
            resolution: conflictResolution('QUALIFICATION_MISSING_ROLE', params),
          });
        }
      }
    }

    // Roles inside the crew.
    const roles = assignment.assigneeRoles ?? {};
    const qualificationLabel = (id: string) => input.qualificationNames?.[id] ?? id;
    const holdsQualification = (personnelId: string, qualificationId: string) =>
      (people.get(personnelId)?.qualificationIds ?? []).includes(qualificationId);

    const roleQualificationRule = rule('ROLE_QUALIFICATION');
    if (roleQualificationRule) {
      for (const personnelId of assignment.assigneeIds) {
        if (isOverridden(assignment, personnelId)) continue;
        const role = roles[personnelId];
        if (role && !holdsQualification(personnelId, role)) {
          add('ROLE_QUALIFICATION', roleQualificationRule, assignment, personnelId, {
            person: personName(personnelId),
            qualification: qualificationLabel(role),
          });
        }
      }
    }

    // One driver, one commander. The database enforces this with a partial
    // unique index; the engine reports it so the board can warn before the
    // server refuses.
    const roleTakenRule = rule('ROLE_TAKEN');
    if (roleTakenRule) {
      const firstHolder = new Map<string, string>();
      for (const personnelId of assignment.assigneeIds) {
        const role = roles[personnelId];
        if (!role) continue;
        const held = firstHolder.get(role);
        if (held === undefined) {
          firstHolder.set(role, personnelId);
        } else {
          add('ROLE_TAKEN', roleTakenRule, assignment, personnelId, {
            assignment: assignment.title,
            qualification: qualificationLabel(role),
            other: personName(held),
          });
        }
      }
    }

    // An exclusive qualification narrows its holder to the assignments that
    // ask for it, which is the opposite direction from every other rule here.
    const exclusiveRule = rule('EXCLUSIVE_QUALIFICATION');
    const exclusiveIds = input.exclusiveQualificationIds ?? [];
    if (exclusiveRule && exclusiveIds.length > 0) {
      const required = new Set(
        assignment.requiredQualifications.map((item) => item.qualificationId),
      );
      for (const personnelId of assignment.assigneeIds) {
        if (isOverridden(assignment, personnelId)) continue;
        const blockingQualification = (people.get(personnelId)?.qualificationIds ?? []).find(
          (id) => exclusiveIds.includes(id) && !required.has(id),
        );
        if (blockingQualification) {
          add('EXCLUSIVE_QUALIFICATION', exclusiveRule, assignment, personnelId, {
            person: personName(personnelId),
            qualification: qualificationLabel(blockingQualification),
            assignment: assignment.title,
          });
        }
      }
    }

    // Nobody goes on shift right before they leave. AVAILABILITY_REQUIRED
    // already covers the absence itself; this covers the run-up to it.
    const departureRule = rule('PRE_DEPARTURE_REST');
    if (departureRule) {
      const buffer = (departureRule.config.hours ?? 0) * HOUR;
      if (buffer > 0) {
        for (const personnelId of assignment.assigneeIds) {
          if (isOverridden(assignment, personnelId)) continue;
          const departure = input.absences.find(
            (absence) =>
              absence.personnelId === personnelId &&
              absence.kind !== 'available' &&
              // The window is the buffer that ends when they leave. An
              // assignment that runs past the departure is the absence rule's
              // problem, not this one's.
              absence.startAt > assignment.startAt &&
              assignment.endAt > absence.startAt - buffer,
          );
          if (departure) {
            add('PRE_DEPARTURE_REST', departureRule, assignment, personnelId, {
              person: personName(personnelId),
              from: formatTime(departure.startAt, timezone),
              actual: formatHours(Math.max(0, departure.startAt - assignment.endAt) / HOUR),
              required: formatHours(departureRule.config.hours ?? 0),
            });
          }
        }
      }
    }

    // Continuous duration of this single assignment.
    const continuousRule = rule('MAX_CONTINUOUS');
    if (continuousRule) {
      const limit = continuousRule.config.minutes ?? 0;
      const duration = minutesBetween(assignment.startAt, assignment.endAt);
      if (limit > 0 && duration > limit) {
        for (const personnelId of assignment.assigneeIds) {
          if (isOverridden(assignment, personnelId)) continue;
          add('MAX_CONTINUOUS', continuousRule, assignment, personnelId, {
            person: personName(personnelId),
            actual: formatHours(duration / 60),
            required: formatHours(limit / 60),
          });
        }
      }
    }
  }

  // Availability.
  const availabilityRule = rule('AVAILABILITY_REQUIRED');
  if (availabilityRule) {
    const absencesByPerson = groupBy(
      input.absences.filter((absence) => absence.kind !== 'available'),
      (absence) => absence.personnelId,
    );
    for (const assignment of active) {
      for (const personnelId of assignment.assigneeIds) {
        if (isOverridden(assignment, personnelId)) continue;
        const blocking = (absencesByPerson.get(personnelId) ?? []).find((absence) =>
          overlaps(assignment.startAt, assignment.endAt, absence.startAt, absence.endAt),
        );
        if (blocking) {
          add('AVAILABILITY_REQUIRED', availabilityRule, assignment, personnelId, {
            person: personName(personnelId),
            reason: availabilityKindLabels[blocking.kind],
            from: formatTime(blocking.startAt, timezone),
            to: formatTime(blocking.endAt, timezone),
          });
        }
      }
    }
  }

  // Per-person timeline checks.
  const byPerson = new Map<string, EngineAssignment[]>();
  for (const assignment of active) {
    for (const personnelId of assignment.assigneeIds) {
      const list = byPerson.get(personnelId) ?? [];
      list.push(assignment);
      byPerson.set(personnelId, list);
    }
  }

  const overlapRule = rule('NO_OVERLAP');
  const restRule = rule('MIN_REST');
  const perDayRule = rule('MAX_ASSIGNMENTS_PER_DAY');
  const windowRule = rule('MAX_HOURS_IN_WINDOW');

  for (const [personnelId, list] of byPerson) {
    const sorted = [...list].sort((a, b) => a.startAt - b.startAt || a.endAt - b.endAt);

    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index]!;
      if (isOverridden(current, personnelId)) continue;
      const previous = sorted[index - 1];

      if (overlapRule) {
        for (let earlier = 0; earlier < index; earlier += 1) {
          const other = sorted[earlier]!;
          if (overlaps(current.startAt, current.endAt, other.startAt, other.endAt)) {
            add('NO_OVERLAP', overlapRule, current, personnelId, {
              person: personName(personnelId),
              other: other.title,
              from: formatTime(Math.max(current.startAt, other.startAt), timezone),
              to: formatTime(Math.min(current.endAt, other.endAt), timezone),
            });
            break;
          }
        }
      }

      if (restRule && previous) {
        const limit = restRule.config.minutes ?? 0;
        const gap = minutesBetween(previous.endAt, current.startAt);
        if (limit > 0 && gap >= 0 && gap < limit) {
          add('MIN_REST', restRule, current, personnelId, {
            person: personName(personnelId),
            actual: formatHours(gap / 60),
            required: formatHours(limit / 60),
          });
        }
      }
    }

    if (perDayRule) {
      const limit = perDayRule.config.count ?? 0;
      const perDay = new Map<string, number>();
      for (const assignment of sorted) {
        const key = dayKey(assignment.startAt, timezone);
        perDay.set(key, (perDay.get(key) ?? 0) + 1);
      }
      for (const [key, count] of perDay) {
        if (limit > 0 && count > limit) {
          const offender = sorted.find(
            (assignment) =>
              dayKey(assignment.startAt, timezone) === key &&
              !isOverridden(assignment, personnelId),
          );
          if (offender) {
            add('MAX_ASSIGNMENTS_PER_DAY', perDayRule, offender, personnelId, {
              person: personName(personnelId),
              actual: count,
              required: limit,
              date: formatDayKey(key),
            });
          }
        }
      }
    }

    if (windowRule) {
      const limitHours = windowRule.config.hours ?? 0;
      const windowDays = windowRule.config.windowDays ?? 7;
      if (limitHours > 0) {
        for (const anchor of sorted) {
          if (isOverridden(anchor, personnelId)) continue;
          const windowStart = anchor.endAt - windowDays * DAY;
          const total = sorted
            .filter(
              (assignment) => assignment.endAt > windowStart && assignment.startAt < anchor.endAt,
            )
            .reduce(
              (sum, assignment) =>
                sum +
                (Math.min(assignment.endAt, anchor.endAt) -
                  Math.max(assignment.startAt, windowStart)),
              0,
            );
          const hours = total / HOUR;
          if (hours > limitHours) {
            add('MAX_HOURS_IN_WINDOW', windowRule, anchor, personnelId, {
              person: personName(personnelId),
              actual: formatHours(hours),
              required: formatHours(limitHours),
              days: windowDays,
            });
            break;
          }
        }
      }
    }
  }

  return dedupe(conflicts).sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id),
  );
}

/** Conflicts that must stop a save or a publication. */
export function blockingConflicts(conflicts: Conflict[]): Conflict[] {
  return conflicts.filter((conflict) => conflict.severity === 'blocking');
}

export function summarizeConflicts(conflicts: Conflict[]): Record<Severity, number> {
  return conflicts.reduce(
    (summary, conflict) => {
      summary[conflict.severity] += 1;
      return summary;
    },
    { blocking: 0, warning: 0, info: 0 } as Record<Severity, number>,
  );
}

/** Local day keys an assignment covers — used by the board to place blocks. */
export function assignmentDays(
  assignment: Pick<EngineAssignment, 'startAt' | 'endAt'>,
  timezone = DEFAULT_TIMEZONE,
): string[] {
  return dayKeysInRange(assignment.startAt, assignment.endAt, timezone);
}

function isOverridden(assignment: EngineAssignment, personnelId: string): boolean {
  return assignment.overriddenBy?.includes(personnelId) ?? false;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const group = map.get(key(item)) ?? [];
    group.push(item);
    map.set(key(item), group);
  }
  return map;
}

function dedupe(conflicts: Conflict[]): Conflict[] {
  const seen = new Set<string>();
  return conflicts.filter((conflict) => {
    if (seen.has(conflict.id)) return false;
    seen.add(conflict.id);
    return true;
  });
}
