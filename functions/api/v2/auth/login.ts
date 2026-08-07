import { body, fail, id, json, now, sessionCookie, sha256, token, type Env } from '../../../_shared/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const input = await body(request); if (input instanceof Response) return input;
  const username = String(input.username ?? '').trim(); const password = String(input.password ?? '');
  if (!username || password.length < 10) return fail(400, 'INVALID_CREDENTIALS', 'שם משתמש או סיסמה אינם תקינים');
  const bootstrapUser = env.ADMIN_USERNAME; const bootstrapPassword = env.ADMIN_PASSWORD;
  if (!bootstrapUser || !bootstrapPassword) return fail(503, 'AUTH_NOT_CONFIGURED', 'התחברות מנהל טרם הוגדרה');
  if (username !== bootstrapUser || (await sha256(password)) !== (await sha256(bootstrapPassword))) return fail(401, 'INVALID_CREDENTIALS', 'שם המשתמש או הסיסמה שגויים');
  const timestamp = now(); let user = await env.DB.prepare('SELECT id,username,display_name,role FROM users WHERE username=?').bind(username).first<{id:string;username:string;display_name:string;role:string}>();
  if (!user) { const userId=id(); await env.DB.prepare(`INSERT INTO users(id,username,display_name,password_hash,role,permissions,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(userId,username,'מנהל מערכת','environment-secret','admin','["*"]',timestamp,timestamp).run(); user={id:userId,username,display_name:'מנהל מערכת',role:'admin'}; }
  const raw=token(); await env.DB.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?,?)').bind(id(),user.id,await sha256(raw),timestamp+43_200_000,timestamp,timestamp).run();
  return json({ok:true,user:{id:user.id,username:user.username,displayName:user.display_name,role:user.role}},200,{'Set-Cookie':sessionCookie(raw)});
};
