/** D1 row loading and mapping into the shared domain types. */
import type {
  Conflict,
  EngineAbsence,
  EngineAssignment,
  EnginePerson,
  RequiredQualification,
  RuleCode,
  SchedulingRule,
} from '../../shared/conflicts';
import { detectConflicts } from '../../shared/conflicts';
import type {
  AdminUser,
  Assignment,
  AssignmentType,
  Availability,
  Personnel,
  PublicationState,
  Qualification,
  Role,
  Severity,
  Unit,
} from '../../shared/types';
import { now, type Env } from './http';

export const DEFAULT_ORG_ID = 'org_default';

/** Whether any account exists yet — the bootstrap only runs while none does. */
export async function hasAnyUser(env: Env): Promise<boolean> {
  try {
    const row = await env.DB.prepare('SELECT 1 AS present FROM users LIMIT 1').first<{
      present: number;
    }>();
    return row?.present === 1;
  } catch {
    return false;
  }
}

/**
 * Whether the migrations have been applied. A correctly bound but empty
 * database answers `SELECT 1` happily, so the binding being healthy says
 * nothing about the schema existing.
 */
export async function schemaReady(env: Env): Promise<boolean> {
  try {
    await env.DB.prepare('SELECT 1 FROM users LIMIT 1').first();
    return true;
  } catch {
    return false;
  }
}

export async function orgTimezone(env: Env): Promise<string> {
  const row = await env.DB.prepare('SELECT timezone FROM organizations WHERE id = ?')
    .bind(DEFAULT_ORG_ID)
    .first<{ timezone: string }>();
  return row?.timezone ?? 'Asia/Jerusalem';
}

export async function loadRules(env: Env): Promise<SchedulingRule[]> {
  const rows = await env.DB.prepare(
    'SELECT code, name, enabled, severity, overridable, config FROM scheduling_rules WHERE org_id = ?',
  )
    .bind(DEFAULT_ORG_ID)
    .all<{
      code: string;
      name: string;
      enabled: number;
      severity: Severity;
      overridable: number;
      config: string;
    }>();
  return (rows.results ?? []).map((row) => ({
    code: row.code as RuleCode,
    name: row.name,
    enabled: row.enabled === 1,
    severity: row.severity,
    overridable: row.overridable === 1,
    config: safeJson<Record<string, number>>(row.config, {}),
  }));
}

export async function loadUnits(env: Env): Promise<Unit[]> {
  const rows = await env.DB.prepare(
    'SELECT id, parent_id, name, kind, sort_order, active FROM units WHERE org_id = ? ORDER BY sort_order, name',
  )
    .bind(DEFAULT_ORG_ID)
    .all<{
      id: string;
      parent_id: string | null;
      name: string;
      kind: Unit['kind'];
      sort_order: number;
      active: number;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    kind: row.kind,
    sortOrder: row.sort_order,
    active: row.active === 1,
  }));
}

export async function loadQualifications(env: Env): Promise<Qualification[]> {
  const rows = await env.DB.prepare(
    `SELECT id, code, name, description, active, exclusive
       FROM qualifications WHERE org_id = ? ORDER BY name`,
  )
    .bind(DEFAULT_ORG_ID)
    .all<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      active: number;
      exclusive: number;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    active: row.active === 1,
    exclusive: row.exclusive === 1,
  }));
}

/**
 * Accounts for the administration screen. The password columns are not
 * selected: nothing outside the auth path has a reason to see them.
 */
export async function loadUsers(env: Env): Promise<AdminUser[]> {
  const rows = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.role, u.personnel_id, p.display_name AS personnel_name,
            u.active, u.mfa_enabled, u.last_login_at, u.created_at
       FROM users u
       LEFT JOIN personnel p ON p.id = u.personnel_id
      ORDER BY u.active DESC, u.display_name`,
  ).all<{
    id: string;
    email: string;
    display_name: string;
    role: Role;
    personnel_id: string | null;
    personnel_name: string | null;
    active: number;
    mfa_enabled: number;
    last_login_at: number | null;
    created_at: number;
  }>();

  const scopeRows = await env.DB.prepare('SELECT user_id, unit_id FROM user_scopes').all<{
    user_id: string;
    unit_id: string;
  }>();
  const scopes = new Map<string, string[]>();
  for (const scope of scopeRows.results ?? []) {
    const list = scopes.get(scope.user_id) ?? [];
    list.push(scope.unit_id);
    scopes.set(scope.user_id, list);
  }

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    personnelId: row.personnel_id,
    personnelName: row.personnel_name,
    unitScope: scopes.get(row.id) ?? [],
    active: row.active === 1,
    mfaEnabled: row.mfa_enabled === 1,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  }));
}

/**
 * How many administrators could still sign in if this one were changed. The
 * screen must not be able to lock the unit out of its own system.
 */
export async function otherActiveAdmins(env: Env, exceptUserId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'system_admin' AND active = 1 AND id != ?",
  )
    .bind(exceptUserId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function loadPersonnel(
  env: Env,
  options: { unitIds?: string[] | null; includeInactive?: boolean } = {},
): Promise<Personnel[]> {
  const filters = ['p.org_id = ?'];
  const bindings: unknown[] = [DEFAULT_ORG_ID];
  if (!options.includeInactive) filters.push("p.status = 'active'");
  if (options.unitIds && options.unitIds.length > 0) {
    filters.push(`p.unit_id IN (${options.unitIds.map(() => '?').join(',')})`);
    bindings.push(...options.unitIds);
  } else if (options.unitIds && options.unitIds.length === 0) {
    return [];
  }

  const rows = await env.DB.prepare(
    `SELECT p.id, p.unit_id, u.name AS unit_name, p.external_id, p.display_name, p.role_title,
            p.phone, p.status, p.notes
       FROM personnel p
       LEFT JOIN units u ON u.id = p.unit_id
      WHERE ${filters.join(' AND ')}
      ORDER BY p.display_name`,
  )
    .bind(...bindings)
    .all<{
      id: string;
      unit_id: string | null;
      unit_name: string | null;
      external_id: string | null;
      display_name: string;
      role_title: string | null;
      phone: string | null;
      status: Personnel['status'];
      notes: string | null;
    }>();

  const qualifications = await loadPersonnelQualifications(env);
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    externalId: row.external_id,
    displayName: row.display_name,
    roleTitle: row.role_title,
    phone: row.phone,
    status: row.status,
    notes: row.notes,
    qualificationIds: qualifications.get(row.id) ?? [],
  }));
}

/** Held qualifications, excluding any that have expired. */
export async function loadPersonnelQualifications(env: Env): Promise<Map<string, string[]>> {
  const rows = await env.DB.prepare(
    `SELECT personnel_id, qualification_id FROM personnel_qualifications
      WHERE expires_at IS NULL OR expires_at > ?`,
  )
    .bind(now())
    .all<{ personnel_id: string; qualification_id: string }>();
  const map = new Map<string, string[]>();
  for (const row of rows.results ?? []) {
    const list = map.get(row.personnel_id) ?? [];
    list.push(row.qualification_id);
    map.set(row.personnel_id, list);
  }
  return map;
}

export async function loadAssignmentTypes(env: Env): Promise<AssignmentType[]> {
  const rows = await env.DB.prepare(
    `SELECT id, name, category, default_duration_minutes, required_headcount, priority, color,
            instructions, active
       FROM assignment_types WHERE org_id = ? ORDER BY priority, name`,
  )
    .bind(DEFAULT_ORG_ID)
    .all<{
      id: string;
      name: string;
      category: string | null;
      default_duration_minutes: number;
      required_headcount: number;
      priority: number;
      color: string;
      instructions: string | null;
      active: number;
    }>();
  const links = await loadTypeQualifications(env);
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    defaultDurationMinutes: row.default_duration_minutes,
    requiredHeadcount: row.required_headcount,
    priority: row.priority,
    color: row.color,
    instructions: row.instructions,
    active: row.active === 1,
    requiredQualifications: links.get(row.id) ?? [],
  }));
}

export async function loadTypeQualifications(
  env: Env,
): Promise<Map<string, RequiredQualification[]>> {
  const rows = await env.DB.prepare(
    'SELECT assignment_type_id, qualification_id, min_count FROM assignment_type_qualifications',
  ).all<{ assignment_type_id: string; qualification_id: string; min_count: number }>();
  const map = new Map<string, RequiredQualification[]>();
  for (const row of rows.results ?? []) {
    const list = map.get(row.assignment_type_id) ?? [];
    list.push({ qualificationId: row.qualification_id, minCount: row.min_count });
    map.set(row.assignment_type_id, list);
  }
  return map;
}

export interface AssignmentQuery {
  from?: number;
  to?: number;
  unitIds?: string[] | null;
  scheduleId?: string | null;
  personnelId?: string | null;
  includeCancelled?: boolean;
}

export async function loadAssignments(
  env: Env,
  query: AssignmentQuery = {},
): Promise<Assignment[]> {
  const filters = ['a.org_id = ?'];
  const bindings: unknown[] = [DEFAULT_ORG_ID];
  if (query.from !== undefined) {
    filters.push('a.end_at > ?');
    bindings.push(query.from);
  }
  if (query.to !== undefined) {
    filters.push('a.start_at < ?');
    bindings.push(query.to);
  }
  if (query.scheduleId) {
    filters.push('a.schedule_id = ?');
    bindings.push(query.scheduleId);
  }
  if (!query.includeCancelled) filters.push("a.status = 'planned'");
  if (query.unitIds) {
    if (query.unitIds.length === 0) return [];
    filters.push(`(a.unit_id IS NULL OR a.unit_id IN (${query.unitIds.map(() => '?').join(',')}))`);
    bindings.push(...query.unitIds);
  }
  if (query.personnelId) {
    filters.push(
      'EXISTS (SELECT 1 FROM assignment_personnel ap WHERE ap.assignment_id = a.id AND ap.personnel_id = ?)',
    );
    bindings.push(query.personnelId);
  }

  const rows = await env.DB.prepare(
    `SELECT a.id, a.schedule_id, a.assignment_type_id, t.name AS type_name, t.color, a.unit_id,
            t.instructions, a.title, a.start_at, a.end_at, a.required_headcount, a.status,
            a.publication_state, a.notes, a.updated_at
       FROM assignment_instances a
       JOIN assignment_types t ON t.id = a.assignment_type_id
      WHERE ${filters.join(' AND ')}
      ORDER BY a.start_at, t.priority, t.name`,
  )
    .bind(...bindings)
    .all<{
      id: string;
      schedule_id: string | null;
      assignment_type_id: string;
      type_name: string;
      color: string;
      unit_id: string | null;
      instructions: string | null;
      title: string | null;
      start_at: number;
      end_at: number;
      required_headcount: number;
      status: Assignment['status'];
      publication_state: PublicationState;
      notes: string | null;
      updated_at: number;
    }>();

  const assignments = rows.results ?? [];
  if (assignments.length === 0) return [];

  const ids = assignments.map((row) => row.id);
  const assigneeRows = await env.DB.prepare(
    `SELECT ap.assignment_id, ap.personnel_id, p.display_name, p.unit_id, ap.assigned_at,
            ap.acknowledged_at, ap.override_reason, ap.role_qualification_id
       FROM assignment_personnel ap
       JOIN personnel p ON p.id = ap.personnel_id
      WHERE ap.assignment_id IN (${ids.map(() => '?').join(',')})
      ORDER BY p.display_name`,
  )
    .bind(...ids)
    .all<{
      assignment_id: string;
      personnel_id: string;
      display_name: string;
      unit_id: string | null;
      assigned_at: number;
      acknowledged_at: number | null;
      override_reason: string | null;
      role_qualification_id: string | null;
    }>();

  const byAssignment = new Map<string, Assignment['assignees']>();
  for (const row of assigneeRows.results ?? []) {
    const list = byAssignment.get(row.assignment_id) ?? [];
    list.push({
      personnelId: row.personnel_id,
      personnelName: row.display_name,
      unitId: row.unit_id,
      role: row.role_qualification_id,
      assignedAt: row.assigned_at,
      acknowledgedAt: row.acknowledged_at,
      overrideReason: row.override_reason,
    });
    byAssignment.set(row.assignment_id, list);
  }

  const typeQualifications = await loadTypeQualifications(env);
  return assignments.map((row) => ({
    id: row.id,
    scheduleId: row.schedule_id,
    assignmentTypeId: row.assignment_type_id,
    assignmentTypeName: row.type_name,
    color: row.color,
    unitId: row.unit_id,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
    requiredHeadcount: row.required_headcount,
    status: row.status,
    publicationState: row.publication_state,
    notes: row.notes,
    assignees: byAssignment.get(row.id) ?? [],
    requiredQualifications: typeQualifications.get(row.assignment_type_id) ?? [],
    instructions: row.instructions,
    updatedAt: row.updated_at,
  }));
}

export async function loadAvailability(
  env: Env,
  query: { from?: number; to?: number; personnelId?: string; status?: string } = {},
): Promise<Availability[]> {
  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (query.from !== undefined) {
    filters.push('a.end_at > ?');
    bindings.push(query.from);
  }
  if (query.to !== undefined) {
    filters.push('a.start_at < ?');
    bindings.push(query.to);
  }
  if (query.personnelId) {
    filters.push('a.personnel_id = ?');
    bindings.push(query.personnelId);
  }
  if (query.status) {
    filters.push('a.status = ?');
    bindings.push(query.status);
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await env.DB.prepare(
    `SELECT a.id, a.personnel_id, p.display_name, a.kind, a.start_at, a.end_at, a.status,
            a.reason, a.created_at
       FROM availability a
       JOIN personnel p ON p.id = a.personnel_id
       ${where}
      ORDER BY a.start_at DESC`,
  )
    .bind(...bindings)
    .all<{
      id: string;
      personnel_id: string;
      display_name: string;
      kind: Availability['kind'];
      start_at: number;
      end_at: number;
      status: Availability['status'];
      reason: string | null;
      created_at: number;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    personnelId: row.personnel_id,
    personnelName: row.display_name,
    kind: row.kind,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

export function toEngineAssignment(assignment: Assignment): EngineAssignment {
  return {
    id: assignment.id,
    assignmentTypeId: assignment.assignmentTypeId,
    title: assignment.title ?? assignment.assignmentTypeName,
    startAt: assignment.startAt,
    endAt: assignment.endAt,
    requiredHeadcount: assignment.requiredHeadcount,
    requiredQualifications: assignment.requiredQualifications,
    assigneeIds: assignment.assignees.map((assignee) => assignee.personnelId),
    assigneeRoles: Object.fromEntries(
      assignment.assignees.map((assignee) => [assignee.personnelId, assignee.role]),
    ),
    publicationState: assignment.publicationState,
    cancelled: assignment.status === 'cancelled',
    overriddenBy: assignment.assignees
      .filter((assignee) => assignee.overrideReason)
      .map((assignee) => assignee.personnelId),
  };
}

export function toEnginePerson(person: Personnel): EnginePerson {
  return {
    id: person.id,
    displayName: person.displayName,
    qualificationIds: person.qualificationIds,
  };
}

export function toEngineAbsences(availability: Availability[]): EngineAbsence[] {
  return availability
    .filter((entry) => entry.status === 'approved' && entry.kind !== 'available')
    .map((entry) => ({
      personnelId: entry.personnelId,
      kind: entry.kind,
      startAt: entry.startAt,
      endAt: entry.endAt,
    }));
}

export interface EvaluationWindow {
  from: number;
  to: number;
  unitIds?: string[] | null;
  scheduleId?: string | null;
}

/**
 * Load everything the conflict engine needs for a window and run it. The same
 * function backs `/conflicts`, assignment writes and schedule validation, so a
 * warning never depends on which endpoint produced it.
 */
export async function evaluateWindow(
  env: Env,
  window: EvaluationWindow,
): Promise<{
  conflicts: Conflict[];
  assignments: Assignment[];
  personnel: Personnel[];
  availability: Availability[];
  rules: SchedulingRule[];
  timezone: string;
}> {
  const [assignments, personnel, availability, rules, qualifications, timezone] = await Promise.all(
    [
      loadAssignments(env, {
        from: window.from,
        to: window.to,
        unitIds: window.unitIds ?? null,
        scheduleId: window.scheduleId ?? null,
      }),
      loadPersonnel(env, { includeInactive: true }),
      loadAvailability(env, { from: window.from, to: window.to, status: 'approved' }),
      loadRules(env),
      loadQualifications(env),
      orgTimezone(env),
    ],
  );

  const conflicts = detectConflicts({
    assignments: assignments.map(toEngineAssignment),
    personnel: personnel.map(toEnginePerson),
    absences: toEngineAbsences(availability),
    rules,
    qualificationNames: Object.fromEntries(
      qualifications.map((qualification) => [qualification.id, qualification.name]),
    ),
    exclusiveQualificationIds: qualifications
      .filter((qualification) => qualification.exclusive)
      .map((qualification) => qualification.id),
    timezone,
  });

  return { conflicts, assignments, personnel, availability, rules, timezone };
}

export function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function boolToInt(value: boolean | undefined, fallback: number): number {
  return value === undefined ? fallback : value ? 1 : 0;
}
