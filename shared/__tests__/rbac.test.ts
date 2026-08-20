import { describe, expect, it } from 'vitest';
import { Permissions, can, expandScope, permissionsForRole, unitInScope } from '../rbac';

const parents = new Map<string, string | null>([
  ['company', null],
  ['platoon-a', 'company'],
  ['team-a1', 'platoon-a'],
  ['platoon-b', 'company'],
]);

describe('role permissions', () => {
  it('gives a soldier only self-service permissions', () => {
    const permissions = permissionsForRole('soldier');
    expect(permissions).toContain(Permissions.selfRead);
    expect(permissions).not.toContain(Permissions.assignmentsWrite);
    expect(permissions).not.toContain(Permissions.personnelRead);
  });

  it('lets a unit scheduler assign but not publish or override', () => {
    const permissions = permissionsForRole('unit_scheduler');
    expect(permissions).toContain(Permissions.assignmentsAssign);
    expect(permissions).not.toContain(Permissions.schedulesPublish);
    expect(permissions).not.toContain(Permissions.assignmentsOverride);
  });

  it('lets a commander publish and override, but not manage users', () => {
    const permissions = permissionsForRole('company_commander');
    expect(permissions).toContain(Permissions.schedulesPublish);
    expect(permissions).toContain(Permissions.assignmentsOverride);
    expect(permissions).not.toContain(Permissions.usersManage);
  });

  it('keeps a viewer read-only', () => {
    const permissions = permissionsForRole('viewer');
    expect(permissions).toContain(Permissions.assignmentsRead);
    expect(permissions.some((permission) => permission.endsWith('.write'))).toBe(false);
  });

  it('checks a single permission', () => {
    expect(can({ permissions: permissionsForRole('viewer') }, Permissions.assignmentsWrite)).toBe(
      false,
    );
  });
});

describe('organisational scope', () => {
  it('treats an empty scope as company-wide', () => {
    expect(unitInScope([], 'team-a1', parents)).toBe(true);
    expect(unitInScope([], null, parents)).toBe(true);
  });

  it('includes descendants of a granted unit', () => {
    expect(unitInScope(['platoon-a'], 'team-a1', parents)).toBe(true);
  });

  it('excludes sibling units', () => {
    expect(unitInScope(['platoon-a'], 'platoon-b', parents)).toBe(false);
  });

  it('excludes unassigned personnel from a narrowed scope', () => {
    expect(unitInScope(['platoon-a'], null, parents)).toBe(false);
  });

  it('expands a scope into the full list of readable units', () => {
    expect(expandScope(['platoon-a'], parents)?.sort()).toEqual(['platoon-a', 'team-a1']);
    expect(expandScope([], parents)).toBeNull();
  });
});
