import type { Role, SessionUser } from './types';

/**
 * Permission catalogue. Every server handler names the permission it needs;
 * hiding a button in the client is never treated as access control.
 */
export const Permissions = {
  personnelRead: 'personnel.read',
  personnelWrite: 'personnel.write',
  unitsRead: 'units.read',
  unitsWrite: 'units.write',
  qualificationsRead: 'qualifications.read',
  qualificationsWrite: 'qualifications.write',
  availabilityRead: 'availability.read',
  availabilityWrite: 'availability.write',
  availabilityRequest: 'availability.request',
  availabilityApprove: 'availability.approve',
  assignmentTypesRead: 'assignment_types.read',
  assignmentTypesWrite: 'assignment_types.write',
  assignmentsRead: 'assignments.read',
  assignmentsWrite: 'assignments.write',
  assignmentsAssign: 'assignments.assign',
  assignmentsOverride: 'assignments.override',
  schedulesRead: 'schedules.read',
  schedulesWrite: 'schedules.write',
  schedulesPublish: 'schedules.publish',
  rulesRead: 'rules.read',
  rulesWrite: 'rules.write',
  replacementsRead: 'replacements.read',
  replacementsRequest: 'replacements.request',
  replacementsDecide: 'replacements.decide',
  reportsRead: 'reports.read',
  auditRead: 'audit.read',
  usersManage: 'users.manage',
  settingsManage: 'settings.manage',
  selfRead: 'self.read',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

const P = Permissions;

const READ_ONLY: Permission[] = [
  P.personnelRead,
  P.unitsRead,
  P.qualificationsRead,
  P.availabilityRead,
  P.assignmentTypesRead,
  P.assignmentsRead,
  P.schedulesRead,
  P.rulesRead,
  P.replacementsRead,
  P.reportsRead,
  P.selfRead,
];

const SCHEDULER: Permission[] = [
  ...READ_ONLY,
  P.personnelWrite,
  P.availabilityWrite,
  P.availabilityApprove,
  P.assignmentsWrite,
  P.assignmentsAssign,
  P.schedulesWrite,
  P.replacementsDecide,
];

const COMMANDER: Permission[] = [
  ...SCHEDULER,
  P.unitsWrite,
  P.qualificationsWrite,
  P.assignmentTypesWrite,
  P.assignmentsOverride,
  P.schedulesPublish,
  P.rulesWrite,
  P.auditRead,
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  system_admin: [...COMMANDER, P.usersManage, P.settingsManage],
  company_commander: COMMANDER,
  unit_scheduler: SCHEDULER,
  soldier: [P.selfRead, P.availabilityRequest, P.replacementsRequest],
  viewer: READ_ONLY,
};

export function permissionsForRole(role: Role): Permission[] {
  return [...new Set(ROLE_PERMISSIONS[role] ?? [])];
}

export function can(user: Pick<SessionUser, 'permissions'>, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

/**
 * Organisational scope. An empty scope means company-wide; otherwise the unit
 * must be one of the granted units or a descendant of one.
 */
export function unitInScope(
  scope: string[],
  unitId: string | null,
  parentOf: Map<string, string | null>,
): boolean {
  if (scope.length === 0) return true;
  if (!unitId) return false;
  let cursor: string | null = unitId;
  for (let guard = 0; cursor && guard < 32; guard += 1) {
    if (scope.includes(cursor)) return true;
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}

/** All units at or below the granted scope, used to filter list queries. */
export function expandScope(
  scope: string[],
  parentOf: Map<string, string | null>,
): string[] | null {
  if (scope.length === 0) return null;
  const all = [...parentOf.keys()];
  return all.filter((unitId) => unitInScope(scope, unitId, parentOf));
}
