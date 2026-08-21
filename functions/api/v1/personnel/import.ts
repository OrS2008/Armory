import { Permissions } from '../../../../shared/rbac';
import { personnelImportSchema } from '../../../../shared/schemas';
import { AuditActions, auditStatement } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { DEFAULT_ORG_ID } from '../../../_lib/data';
import { checkOrigin, newId, now, ok, readBody, type Env } from '../../../_lib/http';

interface RowOutcome {
  line: number;
  displayName: string;
  status: 'create' | 'duplicate' | 'invalid';
  reason?: string;
}

/**
 * Bulk personnel import (plan section 44).
 *
 * Defaults to a dry run: the same resolution and duplicate checks execute, and
 * the caller gets the report, but nothing is written. A malformed or duplicate
 * row is reported and skipped — never imported silently — and the rows that are
 * fine still go in, so one bad line does not block a roster of two hundred.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.personnelWrite);
  if (user instanceof Response) return user;
  const input = await readBody(request, personnelImportSchema);
  if (input instanceof Response) return input;

  const [unitRows, qualificationRows, personnelRows] = await Promise.all([
    env.DB.prepare('SELECT id, name FROM units WHERE org_id = ?')
      .bind(DEFAULT_ORG_ID)
      .all<{ id: string; name: string }>(),
    env.DB.prepare('SELECT id, code, name FROM qualifications WHERE org_id = ?')
      .bind(DEFAULT_ORG_ID)
      .all<{ id: string; code: string; name: string }>(),
    env.DB.prepare('SELECT external_id, display_name FROM personnel WHERE org_id = ?')
      .bind(DEFAULT_ORG_ID)
      .all<{ external_id: string | null; display_name: string }>(),
  ]);

  const key = (value: string) => value.trim().toLowerCase();
  const unitsByName = new Map(
    (unitRows.results ?? []).map((unit) => [key(unit.name), unit.id] as const),
  );
  const qualificationsByName = new Map<string, string>();
  for (const qualification of qualificationRows.results ?? []) {
    qualificationsByName.set(key(qualification.name), qualification.id);
    qualificationsByName.set(key(qualification.code), qualification.id);
  }
  const existingIds = new Set(
    (personnelRows.results ?? [])
      .map((person) => person.external_id)
      .filter((value): value is string => Boolean(value)),
  );
  const existingNames = new Set(
    (personnelRows.results ?? []).map((person) => key(person.display_name)),
  );

  const timestamp = now();
  const statements: D1PreparedStatement[] = [];
  const outcomes: RowOutcome[] = [];
  const createdUnits: string[] = [];
  const createdQualifications: string[] = [];

  const ensureUnit = (name: string): string | null => {
    const found = unitsByName.get(key(name));
    if (found) return found;
    if (!input.createMissingUnits) return null;
    const id = newId('unt');
    unitsByName.set(key(name), id);
    createdUnits.push(name);
    statements.push(
      env.DB.prepare(
        `INSERT INTO units (id, org_id, parent_id, name, kind, sort_order, active, created_at, updated_at)
         VALUES (?, ?, NULL, ?, 'team', 0, 1, ?, ?)`,
      ).bind(id, DEFAULT_ORG_ID, name, timestamp, timestamp),
    );
    return id;
  };

  const ensureQualification = (name: string): string | null => {
    const found = qualificationsByName.get(key(name));
    if (found) return found;
    if (!input.createMissingQualifications) return null;
    const id = newId('qlf');
    qualificationsByName.set(key(name), id);
    createdQualifications.push(name);
    statements.push(
      env.DB.prepare(
        `INSERT INTO qualifications (id, org_id, code, name, description, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, 1, ?, ?)`,
      ).bind(id, DEFAULT_ORG_ID, name.slice(0, 32), name, timestamp, timestamp),
    );
    return id;
  };

  for (const row of input.rows) {
    if (row.externalId && existingIds.has(row.externalId)) {
      outcomes.push({
        line: row.line,
        displayName: row.displayName,
        status: 'duplicate',
        reason: `מספר אישי ${row.externalId} כבר קיים במערכת`,
      });
      continue;
    }
    if (!row.externalId && existingNames.has(key(row.displayName))) {
      outcomes.push({
        line: row.line,
        displayName: row.displayName,
        status: 'duplicate',
        reason: 'שם זהה כבר קיים במערכת, ואין מספר אישי להבחין ביניהם',
      });
      continue;
    }

    const unitId = row.unit ? ensureUnit(row.unit) : null;
    const qualificationIds = row.qualifications
      .map((name) => ensureQualification(name))
      .filter((value): value is string => Boolean(value));

    const personnelId = newId('per');
    statements.push(
      env.DB.prepare(
        `INSERT INTO personnel (id, org_id, unit_id, external_id, display_name, role_title, phone,
                                status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)`,
      ).bind(
        personnelId,
        DEFAULT_ORG_ID,
        unitId,
        row.externalId,
        row.displayName,
        row.roleTitle,
        row.phone,
        timestamp,
        timestamp,
      ),
    );
    for (const qualificationId of qualificationIds) {
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO personnel_qualifications (personnel_id, qualification_id, granted_at)
           VALUES (?, ?, ?)`,
        ).bind(personnelId, qualificationId, timestamp),
      );
    }

    if (row.externalId) existingIds.add(row.externalId);
    existingNames.add(key(row.displayName));
    outcomes.push({ line: row.line, displayName: row.displayName, status: 'create' });
  }

  const willCreate = outcomes.filter((outcome) => outcome.status === 'create').length;

  if (!input.dryRun && statements.length > 0) {
    statements.push(
      auditStatement(env, user, AuditActions.PERSONNEL_CREATED, 'personnel', 'import', {
        imported: willCreate,
        skipped: outcomes.length - willCreate,
        unitsCreated: createdUnits.length,
        qualificationsCreated: createdQualifications.length,
      }),
    );
    await env.DB.batch(statements);
  }

  return ok({
    dryRun: input.dryRun,
    imported: input.dryRun ? 0 : willCreate,
    willCreate,
    skipped: outcomes.length - willCreate,
    createdUnits,
    createdQualifications,
    outcomes,
  });
};
