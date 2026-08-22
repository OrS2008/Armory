/** Append-only audit trail and in-app notifications. */
import type { SessionUser } from '../../shared/types';
import { chunked, placeholders } from './data';
import { newId, now, type Env } from './http';

export const AuditActions = {
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  PERSONNEL_CREATED: 'PERSONNEL_CREATED',
  PERSONNEL_UPDATED: 'PERSONNEL_UPDATED',
  PERSONNEL_ARCHIVED: 'PERSONNEL_ARCHIVED',
  UNIT_CREATED: 'UNIT_CREATED',
  UNIT_UPDATED: 'UNIT_UPDATED',
  QUALIFICATION_CREATED: 'QUALIFICATION_CREATED',
  QUALIFICATION_UPDATED: 'QUALIFICATION_UPDATED',
  AVAILABILITY_CREATED: 'AVAILABILITY_CREATED',
  AVAILABILITY_UPDATED: 'AVAILABILITY_UPDATED',
  AVAILABILITY_DECIDED: 'AVAILABILITY_DECIDED',
  ASSIGNMENT_TYPE_CREATED: 'ASSIGNMENT_TYPE_CREATED',
  ASSIGNMENT_TYPE_UPDATED: 'ASSIGNMENT_TYPE_UPDATED',
  ASSIGNMENT_TYPE_DELETED: 'ASSIGNMENT_TYPE_DELETED',
  ASSIGNMENT_CREATED: 'ASSIGNMENT_CREATED',
  ASSIGNMENT_UPDATED: 'ASSIGNMENT_UPDATED',
  ASSIGNMENT_CANCELLED: 'ASSIGNMENT_CANCELLED',
  ASSIGNMENT_DELETED: 'ASSIGNMENT_DELETED',
  PERSONNEL_ASSIGNED: 'PERSONNEL_ASSIGNED',
  PERSONNEL_UNASSIGNED: 'PERSONNEL_UNASSIGNED',
  ASSIGNMENT_OVERRIDE: 'ASSIGNMENT_OVERRIDE',
  ASSIGNMENT_ACKNOWLEDGED: 'ASSIGNMENT_ACKNOWLEDGED',
  SCHEDULE_CREATED: 'SCHEDULE_CREATED',
  SCHEDULE_PUBLISHED: 'SCHEDULE_PUBLISHED',
  RULE_UPDATED: 'RULE_UPDATED',
  REPLACEMENT_REQUESTED: 'REPLACEMENT_REQUESTED',
  REPLACEMENT_DECIDED: 'REPLACEMENT_DECIDED',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

/**
 * Audit metadata is deliberately small: identifiers and changed field names,
 * never free-text notes or personal details (plan sections 20 and 22).
 */
export function auditStatement(
  env: Env,
  actor: Pick<SessionUser, 'id' | 'displayName'> | null,
  action: AuditAction,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO audit_events (id, actor_user_id, actor_name, action, entity_type, entity_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    newId('aud'),
    actor?.id ?? null,
    actor?.displayName ?? 'מערכת',
    action,
    entityType,
    entityId,
    JSON.stringify(metadata),
    now(),
  );
}

export async function writeAudit(
  env: Env,
  actor: Pick<SessionUser, 'id' | 'displayName'> | null,
  action: AuditAction,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await auditStatement(env, actor, action, entityType, entityId, metadata).run();
}

/** Field-level diff for audit metadata: `{ startAt: [before, after] }`. */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): Record<string, [unknown, unknown]> {
  const changes: Record<string, [unknown, unknown]> = {};
  for (const field of fields) {
    if (field in after && before[field] !== after[field]) {
      changes[field] = [before[field], after[field]];
    }
  }
  return changes;
}

export function notificationStatement(
  env: Env,
  userId: string,
  type: string,
  title: string,
  body: string | null,
  entityType: string | null,
  entityId: string | null,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO notifications (id, user_id, type, title, body, entity_type, entity_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(newId('ntf'), userId, type, title, body, entityType, entityId, now());
}

/**
 * Resolve the user accounts linked to a set of personnel records.
 *
 * Chunked: today every caller passes a single id, but a set large enough to
 * exceed D1's bound-variable limit must come back short of nobody. A missing
 * recipient is a notification that silently never arrives.
 */
export async function usersForPersonnel(
  env: Env,
  personnelIds: string[],
): Promise<Map<string, string>> {
  if (personnelIds.length === 0) return new Map();
  const pages = await Promise.all(
    chunked(personnelIds).map((slice) =>
      env.DB.prepare(
        `SELECT id, personnel_id FROM users
          WHERE active = 1 AND personnel_id IN (${placeholders(slice)})`,
      )
        .bind(...slice)
        .all<{ id: string; personnel_id: string }>(),
    ),
  );
  return new Map(
    pages.flatMap((page) => (page.results ?? []).map((row) => [row.personnel_id, row.id] as const)),
  );
}
