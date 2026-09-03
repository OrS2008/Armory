import { Permissions, can } from '../../../../shared/rbac';
import type { VolunteerStatus } from '../../../../shared/types';
import { requireUser } from '../../../_lib/auth';
import { ok, searchParams, type Env } from '../../../_lib/http';

/**
 * Offers to stand a seat nobody is on.
 *
 * A soldier sees their own; a scheduler sees everyone's, which is the point —
 * a hole in tomorrow's sheet and somebody willing to fill it are two halves of
 * the same fact, and they used to live in different places.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const params = searchParams(request);

  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (!can(user, Permissions.assignmentsAssign)) {
    if (!user.personnelId) return ok({ volunteers: [] });
    filters.push('v.personnel_id = ?');
    bindings.push(user.personnelId);
  }
  const status = params.get('status');
  if (status) {
    filters.push('v.status = ?');
    bindings.push(status);
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const rows = await env.DB.prepare(
    `SELECT v.id, v.assignment_id, COALESCE(a.title, t.sheet_label, t.name) AS assignment_title,
            a.start_at, a.end_at, v.personnel_id, p.display_name AS personnel_name,
            v.role_qualification_id, v.status, v.note, v.created_at, v.decided_at
       FROM shift_volunteers v
       JOIN assignment_instances a ON a.id = v.assignment_id
       JOIN assignment_types t ON t.id = a.assignment_type_id
       JOIN personnel p ON p.id = v.personnel_id
       ${where}
      ORDER BY a.start_at ASC LIMIT 200`,
  )
    .bind(...bindings)
    .all<{
      id: string;
      assignment_id: string;
      assignment_title: string;
      start_at: number;
      end_at: number;
      personnel_id: string;
      personnel_name: string;
      role_qualification_id: string | null;
      status: VolunteerStatus;
      note: string | null;
      created_at: number;
      decided_at: number | null;
    }>();

  return ok({
    volunteers: (rows.results ?? []).map((row) => ({
      id: row.id,
      assignmentId: row.assignment_id,
      assignmentTitle: row.assignment_title,
      startAt: row.start_at,
      endAt: row.end_at,
      personnelId: row.personnel_id,
      personnelName: row.personnel_name,
      roleQualificationId: row.role_qualification_id,
      status: row.status,
      note: row.note,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
    })),
  });
};
