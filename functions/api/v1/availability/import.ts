import { Permissions } from '../../../../shared/rbac';
import { availabilityImportSchema } from '../../../../shared/schemas';
import { overlaps, wallClockToUtc } from '../../../../shared/time';
import { AuditActions, auditStatement } from '../../../_lib/audit';
import { requireUser } from '../../../_lib/auth';
import { DEFAULT_ORG_ID, orgTimezone } from '../../../_lib/data';
import { checkOrigin, newId, now, ok, readBody, type Env } from '../../../_lib/http';

interface RowOutcome {
  line: number;
  person: string;
  status: 'create' | 'skipped';
  reason?: string;
}

/**
 * Bulk availability import.
 *
 * Mirrors the roster import: a dry run by default, every row either accepted
 * or reported with the reason it was not, and the good rows still go in. The
 * hard part is matching a name in a spreadsheet to a person in the roster,
 * which this refuses to guess at — an unknown or ambiguous name is skipped and
 * named in the report.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.availabilityWrite);
  if (user instanceof Response) return user;
  const input = await readBody(request, availabilityImportSchema);
  if (input instanceof Response) return input;

  const timezone = await orgTimezone(env);
  const people = await env.DB.prepare(
    `SELECT id, display_name, external_id FROM personnel
      WHERE org_id = ? AND status != 'archived'`,
  )
    .bind(DEFAULT_ORG_ID)
    .all<{ id: string; display_name: string; external_id: string | null }>();

  const key = (value: string) => value.trim().toLowerCase();
  const byExternalId = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const person of people.results ?? []) {
    if (person.external_id) byExternalId.set(key(person.external_id), person.id);
    const list = byName.get(key(person.display_name)) ?? [];
    list.push(person.id);
    byName.set(key(person.display_name), list);
  }

  // Existing records for the same people, so a second import of the same sheet
  // does not double every absence.
  const existing = await env.DB.prepare(
    `SELECT personnel_id, start_at, end_at FROM availability WHERE status != 'rejected'`,
  ).all<{ personnel_id: string; start_at: number; end_at: number }>();
  const byPerson = new Map<string, { start: number; end: number }[]>();
  for (const row of existing.results ?? []) {
    const list = byPerson.get(row.personnel_id) ?? [];
    list.push({ start: row.start_at, end: row.end_at });
    byPerson.set(row.personnel_id, list);
  }

  const timestamp = now();
  const statements: D1PreparedStatement[] = [];
  const outcomes: RowOutcome[] = [];

  for (const row of input.rows) {
    const label = row.person || row.externalId || '';
    const matches = row.externalId
      ? [byExternalId.get(key(row.externalId))].filter((id): id is string => Boolean(id))
      : (byName.get(key(row.person)) ?? []);

    if (matches.length === 0) {
      outcomes.push({
        line: row.line,
        person: label,
        status: 'skipped',
        reason: 'לא נמצא במאגר כוח האדם',
      });
      continue;
    }
    if (matches.length > 1) {
      outcomes.push({
        line: row.line,
        person: label,
        status: 'skipped',
        reason: 'יש יותר מאדם אחד בשם הזה — הוסיפו עמודת מספר אישי',
      });
      continue;
    }

    const personnelId = matches[0] as string;
    const startAt = wallClockToUtc(row.fromDay, row.fromTime, timezone);
    const endAt = wallClockToUtc(row.toDay, row.toTime, timezone);

    const clash = (byPerson.get(personnelId) ?? []).some((entry) =>
      overlaps(startAt, endAt, entry.start, entry.end),
    );
    if (clash) {
      outcomes.push({
        line: row.line,
        person: label,
        status: 'skipped',
        reason: 'כבר קיים רישום חופף לאדם הזה',
      });
      continue;
    }

    const id = newId('avl');
    statements.push(
      env.DB.prepare(
        `INSERT INTO availability (id, personnel_id, kind, start_at, end_at, status, reason,
                                   requested_by, decided_by, decided_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        personnelId,
        row.kind,
        startAt,
        endAt,
        row.reason,
        user.id,
        user.id,
        timestamp,
        timestamp,
        timestamp,
      ),
    );
    // Later rows in the same file are checked against this one too.
    const list = byPerson.get(personnelId) ?? [];
    list.push({ start: startAt, end: endAt });
    byPerson.set(personnelId, list);
    outcomes.push({ line: row.line, person: label, status: 'create' });
  }

  const willCreate = outcomes.filter((outcome) => outcome.status === 'create').length;

  if (!input.dryRun && statements.length > 0) {
    statements.push(
      auditStatement(env, user, AuditActions.AVAILABILITY_CREATED, 'availability', 'import', {
        imported: willCreate,
        skipped: outcomes.length - willCreate,
      }),
    );
    await env.DB.batch(statements);
  }

  return ok({
    dryRun: input.dryRun,
    imported: input.dryRun ? 0 : willCreate,
    willCreate,
    skipped: outcomes.length - willCreate,
    outcomes,
  });
};
