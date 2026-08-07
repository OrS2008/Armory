interface Env {
  DB: D1Database;
}
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const row = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    return Response.json(
      { ok: row?.ok === 1, service: 'armory-v2', version: '0.1.0' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { ok: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'השירות אינו זמין כרגע' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
