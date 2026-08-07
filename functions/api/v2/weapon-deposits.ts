import { body, fail, id, json, now, requireUser, type Env } from '../../_shared/http';
const departments: Record<string, string> = { 'מחלקה 1': 'p1', 'מחלקה 2': 'p2', 'מחלקה 3': 'p3', 'מפל״ג': 'mplag', 'מסופחים': 'attached' };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const input = await body(request); if (input instanceof Response) return input;
  const fullName = String(input.fullName ?? '').trim();
  const personalId = String(input.personalId ?? '').replace(/\D/g, '');
  const phone = String(input.phone ?? '').replace(/\D/g, '');
  const department = String(input.department ?? '').trim();
  const weapon = String(input.weaponSerial ?? '').trim();
  if (fullName.length < 2 || personalId.length < 5 || phone.length !== 10 || !departments[department] || weapon.length < 3) return fail(422, 'VALIDATION_ERROR', 'פרטי ההפקדה אינם תקינים');
  const duplicate = await env.DB.prepare(`SELECT id FROM weapon_deposits WHERE lower(weapon_serial)=lower(?) AND status IN ('pending','approved')`).bind(weapon).first();
  if (duplicate) return fail(409, 'DUPLICATE_WEAPON', 'הנשק כבר מופיע בבקשת אפסון פעילה');
  const timestamp = now(); const soldierId = id(); const depositId = id();
  const existing = await env.DB.prepare('SELECT id FROM soldiers WHERE personal_id=?').bind(personalId).first<{ id: string }>();
  const resolved = existing?.id ?? soldierId;
  await env.DB.batch([
    existing ? env.DB.prepare('UPDATE soldiers SET full_name=?,phone=?,department_id=?,updated_at=? WHERE id=?').bind(fullName,phone,departments[department],timestamp,resolved) : env.DB.prepare('INSERT INTO soldiers(id,personal_id,full_name,phone,department_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(resolved,personalId,fullName,phone,departments[department],timestamp,timestamp),
    env.DB.prepare('INSERT INTO weapon_deposits(id,soldier_id,weapon_serial,amral_serial,scope_serial,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(depositId,resolved,weapon,String(input.amralSerial ?? '').trim() || null,String(input.scopeSerial ?? '').trim() || null,String(input.note ?? '').trim() || null,timestamp,timestamp),
  ]);
  return json({ ok:true,id:depositId,status:'pending' },201);
};
export const onRequestGet: PagesFunction<Env> = async ({ request,env }) => {
  const user = await requireUser(request,env,'armory'); if (user instanceof Response) return user;
  const result = await env.DB.prepare(`SELECT wd.*,s.full_name,s.personal_id,s.phone,d.name department FROM weapon_deposits wd JOIN soldiers s ON s.id=wd.soldier_id LEFT JOIN departments d ON d.id=s.department_id ORDER BY wd.created_at DESC LIMIT 300`).all();
  return json({ok:true,items:result.results});
};
