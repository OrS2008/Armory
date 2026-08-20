/** Shared loading helpers for schedule endpoints. */
import { endOfDay, startOfDay } from '../../shared/time';
import type { Schedule } from '../../shared/types';
import { orgTimezone } from './data';
import type { Env } from './http';

export async function loadSchedule(env: Env, id: string): Promise<Schedule | null> {
  const row = await env.DB.prepare(
    `SELECT id, unit_id, name, start_date, end_date, status, version, published_at, created_at
       FROM schedules WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      unit_id: string | null;
      name: string;
      start_date: string;
      end_date: string;
      status: Schedule['status'];
      version: number;
      published_at: number | null;
      created_at: number;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    unitId: row.unit_id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    version: row.version,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

export async function scheduleWindow(
  env: Env,
  schedule: Schedule,
): Promise<{ from: number; to: number; timezone: string }> {
  const timezone = await orgTimezone(env);
  return {
    from: startOfDay(schedule.startDate, timezone),
    to: endOfDay(schedule.endDate, timezone),
    timezone,
  };
}
